import { useState, useEffect, useMemo, useRef } from 'react'
import { useShiftStore, Activity, ShiftTemplate } from '../stores/useShiftStore'
import { playSound } from '../utils/soundEffects'

// Helper to convert HH:mm:ss to seconds of the day
export function timeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number)
  const h = parts[0] || 0
  const m = parts[1] || 0
  const s = parts[2] || 0
  return h * 3600 + m * 60 + s
}

// Helper to convert seconds of the day to HH:mm
export function secondsToHHMM(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600) % 24
  const m = Math.floor((totalSecs % 3600) / 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

// Helper to format remaining time or overtime
export function formatRemaining(totalSecs: number, isOvertime = false): string {
  if (typeof totalSecs !== 'number' || !Number.isFinite(totalSecs) || totalSecs <= 0) return '00:00'
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  
  const prefix = isOvertime ? '+' : ''
  
  if (h > 0) {
    return `${prefix}${h}sa ${m.toString().padStart(2, '0')}dk`
  }
  return `${prefix}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// Actually worked time (in seconds) from a live clock position: sum of fully elapsed
// activities plus the partial time spent inside the current one. Activities flagged
// as "Mola mı?" (isBreak) are never counted as working time.
export function computeWorkedSeconds(activities: Activity[], realSecs: number): number {
  let worked = 0
  const sorted = [...activities].sort((a, b) => a.startTime.localeCompare(b.startTime))
  for (const act of sorted) {
    if (act.isBreak) continue
    const actStartSecs = timeToSeconds(`${act.startTime}:00`)
    const actEndSecs = timeToSeconds(`${act.endTime}:00`)
    if (realSecs >= actEndSecs) {
      worked += act.duration * 60
    } else if (realSecs >= actStartSecs) {
      worked += realSecs - actStartSecs
      break
    } else {
      break
    }
  }
  return worked
}

// Module-level flag: only ONE mounted engine instance may fire notifications.
// Dashboard and Timeline each mount their own useLiveShiftEngine; without this,
// every activity transition produces two identical stacked toasts.
let notificationOwnerActive = false

export function useLiveShiftEngine() {
  const templates = useShiftStore((state) => state.templates)
  const settings = useShiftStore((state) => state.settings)
  const completedShifts = useShiftStore((state) => state.completedShifts)
  const confirmedActivities = useShiftStore((state) => state.confirmedActivities)
  const timeOffset = useShiftStore((state) => state.timeOffset)
  const setTimeOffset = useShiftStore((state) => state.setTimeOffset)
  
  const [time, setTime] = useState<Date>(new Date())
  const [prevActivityId, setPrevActivityId] = useState<string | null>(null)
  const [hasNotifiedShiftStart, setHasNotifiedShiftStart] = useState<boolean>(false)
  const [hasNotifiedShiftEnd, setHasNotifiedShiftEnd] = useState<boolean>(false)

  // First run lock to prevent notification spam on startup / reload
  const isFirstRun = useRef(true)
  // Tracks manual rewind offset to suppress notifications when user jumps around
  const prevOffset = useRef(timeOffset)

  // Update clock every second. Also re-sync immediately when the window regains
  // focus / becomes visible — while hidden in the tray Chromium throttles timers,
  // so this keeps the countdown, transitions and notifications up to date the
  // moment the user looks at the app again.
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)
    const sync = () => setTime(new Date())
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  const timeString = useMemo(() => {
    return time.toTimeString().split(' ')[0] // "HH:mm:ss"
  }, [time])

  // Effective time of day (seconds) — shifted backward when the user rewinds the day
  const effectiveSecs = useMemo(() => {
    return (timeToSeconds(timeString) + timeOffset + 86400) % 86400
  }, [timeString, timeOffset])

  const currentDateStr = useMemo(() => {
    const y = time.getFullYear()
    const m = (time.getMonth() + 1).toString().padStart(2, '0')
    const d = time.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${d}` // "YYYY-MM-DD"
  }, [time])

  const currentDayOfWeek = useMemo(() => {
    return time.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  }, [time])

  const currentDateMMDD = useMemo(() => {
    return currentDateStr.substring(5) // "MM-DD"
  }, [currentDateStr])

  // Resolve today's active shift template
  const activeTemplate = useMemo<ShiftTemplate | null>(() => {
    // A template with no activities is not a real shift — treat it as inactive so
    // it can never become "today's shift" and crash views that assume activities exist.
    const activeTemplates = templates.filter(t => t.isActive && t.activities.length > 0)
    
    // 1. Check birthday match (Highest priority)
    // If today is user's birthday, look for a template named "Doğum Günü" or "Birthday"
    if (settings.birthday && settings.birthday === currentDateMMDD) {
      const birthdayTemplate = activeTemplates.find(
        t => t.name.toLowerCase().includes('doğum') || t.name.toLowerCase().includes('birthday')
      )
      if (birthdayTemplate) return birthdayTemplate
    }

    // 2. Check custom date match (Medium-high priority)
    const dateMatch = activeTemplates.find(t => t.customDates?.includes(currentDateStr))
    if (dateMatch) return dateMatch

    // 3. Check weekday match (Medium priority)
    const weekdayMatch = activeTemplates.find(t => t.weekdays.includes(currentDayOfWeek))
    if (weekdayMatch) return weekdayMatch

    return null
  }, [templates, currentDateStr, currentDayOfWeek, currentDateMMDD, settings.birthday])

  // Pay mode synthesizes a single fixed work block from the Settings times. Breaks
  // are NOT part of the template — they are started manually from the Dashboard and
  // tracked by the store (breakUsage / runningBreak).
  //
  // In 'duration' mode the user owes a fixed number of work minutes (payDurationMin);
  // the "work block" therefore spans the whole day and completion is driven by the
  // live work accumulator in engineState instead of the clock.
  const payTemplate = useMemo<ShiftTemplate | null>(() => {
    if (settings.mode !== 'pay') return null
    if (settings.payTargetMode === 'duration') {
      return {
        id: '__pay__',
        name: 'Pay Vardiyası',
        activities: [
          {
            id: '__pay__work',
            name: 'Çalışma',
            icon: '💼',
            color: 'emerald',
            startTime: '00:00',
            endTime: '23:59',
            duration: 24 * 60 - 1,
            notificationEnabled: true,
            notificationSound: 'default'
          }
        ],
        weekdays: [],
        isActive: true
      }
    }
    const startSecs = timeToSeconds(`${settings.payShiftStart}:00`)
    const endSecs = timeToSeconds(`${settings.payShiftEnd}:00`)
    if (endSecs <= startSecs) return null
    return {
      id: '__pay__',
      name: 'Pay Vardiyası',
      activities: [
        {
          id: '__pay__work',
          name: 'Çalışma',
          icon: '💼',
          color: 'emerald',
          startTime: settings.payShiftStart,
          endTime: settings.payShiftEnd,
          duration: (endSecs - startSecs) / 60,
          notificationEnabled: true,
          notificationSound: 'default'
        }
      ],
      weekdays: [],
      isActive: true
    }
  }, [settings.mode, settings.payTargetMode, settings.payShiftStart, settings.payShiftEnd])

  const resolvedTemplate = settings.mode === 'pay' ? payTemplate : (settings.mode === 'chrono' ? null : activeTemplate)

  // Duration mode: live work accumulator (single source of truth lives in the store,
  // updated by the updatePayWork effect below). Recomputes every second via `time`.
  const payWorkAccumMs = useShiftStore((state) => state.payWorkAccumMs)
  const payWorkStartTs = useShiftStore((state) => state.payWorkStartTs)
  const updatePayWork = useShiftStore((state) => state.updatePayWork)
  const durationMode = settings.mode === 'pay' && settings.payTargetMode === 'duration'
  const payWorkTotalMs = payWorkAccumMs + (payWorkStartTs !== null ? Math.max(0, Date.now() - payWorkStartTs) : 0)
  const payWorkSecs = Math.floor(payWorkTotalMs / 1000)
  const durationTargetSecs = Math.max(0, settings.payDurationMin) * 60

  // Get current and next activities
  // Chrono mode state
  const chronoMode = useShiftStore((s) => s.chronoMode)
  const chronoStartedAt = useShiftStore((s) => s.chronoStartedAt)
  const chronoWorkAccumMs = useShiftStore((s) => s.chronoWorkAccumMs)
  const chronoBreakAccumMs = useShiftStore((s) => s.chronoBreakAccumMs)
  const chronoWorkTotalMs = chronoWorkAccumMs + (chronoMode === 'work' && chronoStartedAt !== null ? Math.max(0, Date.now() - chronoStartedAt) : 0)
  const chronoBreakTotalMs = chronoBreakAccumMs + (chronoMode === 'break' && chronoStartedAt !== null ? Math.max(0, Date.now() - chronoStartedAt) : 0)

  const engineState = useMemo(() => {
    // Chrono mode: no template, state driven by chronoMode store field.
    if (settings.mode === 'chrono') {
      const isChronoWork = chronoMode === 'work'
      const isChronoBreak = chronoMode === 'break'
      const virtualActivity: Activity | null = isChronoWork ? {
        id: '__chrono__work',
        name: 'Çalışma',
        icon: '⏱️',
        color: 'amber',
        startTime: '00:00',
        endTime: '23:59',
        duration: 0,
        notificationEnabled: false,
        notificationSound: 'default'
      } : null
      return {
        currentActivity: virtualActivity,
        nextActivity: null,
        pendingActivity: null,
        pendingAfter: null,
        awaitingConfirmation: false,
        remainingSeconds: 0,
        activityProgress: 0,
        shiftProgress: 0,
        activitiesStatus: {} as Record<string, 'completed' | 'active' | 'future'>,
        isShiftFinished: false,
        isBeforeShift: false,
        isOvertime: false,
        overtimeSeconds: 0,
        shiftStartSecs: 0,
        shiftEndSecs: 0,
        isChronoWork,
        isChronoBreak,
        chronoWorkSecs: Math.floor(chronoWorkTotalMs / 1000),
        chronoBreakSecs: Math.floor(chronoBreakTotalMs / 1000)
      }
    }

    if (!resolvedTemplate || resolvedTemplate.activities.length === 0) {
      return {
        currentActivity: null,
        nextActivity: null,
        pendingActivity: null,
        pendingAfter: null,
        awaitingConfirmation: false,
        remainingSeconds: 0,
        activityProgress: 0,
        shiftProgress: 0,
        activitiesStatus: {} as Record<string, 'completed' | 'active' | 'future'>,
        isShiftFinished: false,
        isBeforeShift: false,
        isOvertime: false,
        overtimeSeconds: 0,
        shiftStartSecs: 0,
        shiftEndSecs: 0,
        isChronoWork: false,
        isChronoBreak: false,
        chronoWorkSecs: Math.floor(chronoWorkTotalMs / 1000),
        chronoBreakSecs: Math.floor(chronoBreakTotalMs / 1000)
      }
    }

    const currentSecs = effectiveSecs
    const activities = resolvedTemplate.activities

    // Sort activities (already sorted by saveTemplate)
    const sorted = [...activities].sort((a, b) => a.startTime.localeCompare(b.startTime))

    // Calculate boundary times in seconds
    const firstAct = sorted[0]
    const lastAct = sorted[sorted.length - 1]
    const shiftStartSecs = timeToSeconds(`${firstAct.startTime}:00`)
    const shiftEndSecs = timeToSeconds(`${lastAct.endTime}:00`)

    // Overnight shift detection: endTime < startTime means the shift crosses midnight.
    // E.g. 23:00 → 01:00 means the shift wraps around 00:00.
    const isOvernight = shiftStartSecs > shiftEndSecs

    // Helper: check if a time-of-day (in seconds) falls within a shift/activity window
    // that may cross midnight. For overnight ranges (start > end), the window wraps: [start..86400] ∪ [0..end].
    const inWindow = (t: number, start: number, end: number) =>
      start > end ? (t >= start || t <= end) : (t >= start && t <= end)

    // Check if shift is manually completed by user for today
    const isManuallyCompleted = completedShifts.includes(currentDateStr)

    let currentActivity: Activity | null = null
    let nextActivity: Activity | null = null
    let pendingActivity: Activity | null = null
    let pendingAfter: Activity | null = null
    let remainingSeconds = 0
    let activityProgress = 0
    let isShiftFinished = false
    let isBeforeShift = false
    let isOvertime = false
    let overtimeSeconds = 0

    if (isManuallyCompleted) {
      isShiftFinished = true
      currentActivity = null
      nextActivity = null
      remainingSeconds = 0
    } else if (durationMode) {
      // Duration mode: no fixed window — the user owes durationTargetSecs of work and
      // the remaining target shrinks live as they work (accumulator, not the clock).
      // Once the target is met the shift does NOT finish on its own: until the user
      // presses "Vardiyayı Tamamla", every second beyond the target counts as aşım.
      const remaining = Math.max(0, durationTargetSecs - payWorkSecs)
      const overtime = Math.max(0, payWorkSecs - durationTargetSecs)
      isBeforeShift = false
      activityProgress = durationTargetSecs > 0 ? Math.min(100, (payWorkSecs / durationTargetSecs) * 100) : 0
      if (remaining > 0) {
        currentActivity = sorted[0]
        nextActivity = null
        remainingSeconds = remaining
        isShiftFinished = false
        isOvertime = false
        overtimeSeconds = 0
      } else {
        // Target reached — overtime (aşım) until the user manually completes.
        // currentActivity = null so the idle accumulator counts every extra second.
        currentActivity = null
        nextActivity = null
        remainingSeconds = overtime
        isShiftFinished = false
        isOvertime = true
        overtimeSeconds = overtime
      }
    } else if (!inWindow(currentSecs, shiftStartSecs, shiftEndSecs)) {
      // Outside the shift window. Determine if before or overtime.
      // For overnight shifts there is no "overtime" — the gap between shiftEnd and
      // shiftStart is simply the non-working period (before shift for the next day).
      if (isOvernight) {
        // Overnight: the gap is (shiftEnd, shiftStart). User is "before shift".
        isBeforeShift = true
        nextActivity = firstAct
        // Remaining = seconds until shiftStart wraps around
        remainingSeconds = currentSecs < shiftStartSecs
          ? shiftStartSecs - currentSecs
          : (86400 - currentSecs) + shiftStartSecs
      } else if (currentSecs < shiftStartSecs) {
        isBeforeShift = true
        nextActivity = firstAct
        remainingSeconds = shiftStartSecs - currentSecs
      } else {
        // Overtime! (Vardiya Bitiş Saati Aşıldı ama kullanıcı henüz manuel tamamlamadı)
        isOvertime = true
        currentActivity = null
        nextActivity = null
        overtimeSeconds = currentSecs - shiftEndSecs
        remainingSeconds = overtimeSeconds
      }
    } else {
      // We are inside the shift duration.
      //
      // Confirmation gate (MyShift templates): every WORK activity after the first
      // one only becomes current once the user confirms the transition into it.
      // Until then currentActivity stays null and the elapsed time counts as aşım
      // (idle). Breaks ("Mola mı?") are fully automatic — they start and end on
      // their schedule without confirmation, so a break that runs long falls into
      // the pending gate of the work activity that follows it.
      const confirmedSet = new Set(confirmedActivities)
      let previousEnded: Activity | null = null

      for (let i = 0; i < sorted.length; i++) {
        const act = sorted[i]
        const actStartSecs = timeToSeconds(`${act.startTime}:00`)
        const actEndSecs = timeToSeconds(`${act.endTime}:00`)
        const actOvernight = actStartSecs > actEndSecs

        // Check if this activity's window is fully over.
        // For overnight activities, "fully over" means we're past the end AND not in the window.
        const actFinished = actOvernight
          ? (!inWindow(currentSecs, actStartSecs, actEndSecs) && currentSecs > actEndSecs && currentSecs < actStartSecs)
          : (currentSecs >= actEndSecs)

        if (actFinished) {
          previousEnded = act
          continue
        }

        // Check if this activity hasn't started yet.
        const actNotStarted = actOvernight
          ? (!inWindow(currentSecs, actStartSecs, actEndSecs) && currentSecs < actStartSecs && currentSecs > actEndSecs)
          : (currentSecs < actStartSecs)

        if (actNotStarted) {
          nextActivity = act
          if (!act.isBreak && i > 0 && !confirmedSet.has(act.id)) {
            pendingActivity = act
            pendingAfter = previousEnded
          }
          break
        }

        // currentSecs is inside this activity's window.
        if (act.isBreak) {
          currentActivity = act
        } else if (i === 0 || confirmedSet.has(act.id)) {
          currentActivity = act
        } else {
          pendingActivity = act
          pendingAfter = previousEnded
        }

        if (currentActivity) {
          // Remaining seconds: handle overnight activity windows
          remainingSeconds = actOvernight
            ? (currentSecs <= actEndSecs ? actEndSecs - currentSecs : (86400 - currentSecs) + actEndSecs)
            : actEndSecs - currentSecs
          const durationSecs = act.duration * 60
          const elapsedSecs = actOvernight
            ? (currentSecs >= actStartSecs ? currentSecs - actStartSecs : (86400 - actStartSecs) + currentSecs)
            : currentSecs - actStartSecs
          activityProgress = durationSecs > 0 ? (elapsedSecs / durationSecs) * 100 : 0
          if (i + 1 < sorted.length) {
            nextActivity = sorted[i + 1]
          }
        }
        break
      }
    }

    // Calculate shift completion %
    let shiftProgress = 0
    if (isShiftFinished) {
      shiftProgress = 100
    } else if (durationMode) {
      shiftProgress = durationTargetSecs > 0 ? Math.min(100, (payWorkSecs / durationTargetSecs) * 100) : 0
    } else if (!isBeforeShift && !isOvertime) {
      // Inside the shift — compute elapsed time, handling overnight wrap.
      const totalShiftDuration = isOvernight
        ? (86400 - shiftStartSecs) + shiftEndSecs
        : shiftEndSecs - shiftStartSecs
      const elapsedShiftSecs = isOvernight
        ? (currentSecs >= shiftStartSecs ? currentSecs - shiftStartSecs : (86400 - shiftStartSecs) + currentSecs)
        : currentSecs - shiftStartSecs
      shiftProgress = totalShiftDuration > 0 ? Math.min(100, (elapsedShiftSecs / totalShiftDuration) * 100) : 0
    } else if (isOvertime) {
      shiftProgress = 100
    }

    // Determine status of each activity for the timeline
    const activitiesStatus: Record<string, 'completed' | 'active' | 'future'> = {}
    sorted.forEach((act) => {
      const actStartSecs = timeToSeconds(`${act.startTime}:00`)
      const actEndSecs = timeToSeconds(`${act.endTime}:00`)

      if (durationMode) {
        activitiesStatus[act.id] = isShiftFinished ? 'completed' : 'active'
      } else if (isManuallyCompleted) {
        activitiesStatus[act.id] = 'completed'
      } else if (inWindow(currentSecs, actStartSecs, actEndSecs)) {
        activitiesStatus[act.id] = 'active'
      } else {
        // Outside this activity's window — check if it's past or future.
        const actOvernight = actStartSecs > actEndSecs
        if (actOvernight) {
          // For overnight: past if we're between end and start (in the gap)
          activitiesStatus[act.id] = (!inWindow(currentSecs, actStartSecs, actEndSecs) && currentSecs > actEndSecs && currentSecs < actStartSecs) ? 'completed' : 'future'
        } else {
          activitiesStatus[act.id] = currentSecs >= actEndSecs ? 'completed' : 'future'
        }
      }
    })

    // An activity awaiting confirmation stays highlighted (active) even though its
    // clock window already ended — it is NOT finished until the user confirms it.
    if (pendingActivity) {
      activitiesStatus[pendingActivity.id] = 'active'
    }

    return {
      currentActivity,
      nextActivity,
      pendingActivity,
      pendingAfter,
      awaitingConfirmation: pendingActivity !== null,
      remainingSeconds,
      activityProgress,
      shiftProgress,
      activitiesStatus,
      isShiftFinished,
      isBeforeShift,
      isOvertime,
      overtimeSeconds,
      shiftStartSecs,
      shiftEndSecs,
      isChronoWork: false,
      isChronoBreak: false,
      chronoWorkSecs: 0,
      chronoBreakSecs: 0
    }
  }, [resolvedTemplate, effectiveSecs, completedShifts, confirmedActivities, currentDateStr, durationMode, payWorkSecs, durationTargetSecs, settings.mode, chronoMode, chronoWorkTotalMs, chronoBreakTotalMs])

  // ── Aşım (idle) stopwatch ────────────────────────────────────────────────────
  // Lives in the shared store (single source of truth) so Dashboard & Timeline
  // always show the SAME counter. Counts the REAL time actually spent idle (outside
  // activities), measured live — NOT derived from planned gaps. It auto-resets at
  // the start of each day (the day's first activity) and can be reset via resetIdle().
  const idleAccumMs = useShiftStore((state) => state.idleAccumMs)
  const idleStartTs = useShiftStore((state) => state.idleStartTs)
  const idleLogMs = useShiftStore((state) => state.idleLogMs)
  const paybackAccumMs = useShiftStore((state) => state.paybackAccumMs)
  const paybackStartTs = useShiftStore((state) => state.paybackStartTs)
  const updateIdle = useShiftStore((state) => state.updateIdle)
  const resetIdle = useShiftStore((state) => state.resetIdle)
  const startPayback = useShiftStore((state) => state.startPayback)
  const stopPayback = useShiftStore((state) => state.stopPayback)
  const finishPayback = useShiftStore((state) => state.finishPayback)
  const runningBreak = useShiftStore((state) => state.runningBreak)
  const breakUsage = useShiftStore((state) => state.breakUsage)
  const breakCount = useShiftStore((state) => state.breakCount)

  useEffect(() => {
    // Aşım only accrues while there IS an active shift with activities and the user
    // should be working but isn't (between activities / overtime). If there is no
    // shift for today, the user is simply free — NOT in aşım.
    // In Pay mode an over-budget break (bütçesi dolmuşken başlatılan mola) is NOT a
    // real break — it counts as aşım while it runs.
    // Chrono mode does NOT have aşım — "idle" just means paused/stopped.
    let idleNow: boolean
    if (settings.mode === 'chrono') {
      idleNow = false
    } else {
      const overBudgetBreak = settings.mode === 'pay' && !!runningBreak && runningBreak.overBudget
      idleNow = !!resolvedTemplate && resolvedTemplate.activities.length > 0
        && ((!engineState.currentActivity && !engineState.isBeforeShift && !engineState.isShiftFinished) || overBudgetBreak)
    }
    updateIdle(idleNow)
  }, [engineState, updateIdle, resolvedTemplate, settings.mode, runningBreak, chronoMode, chronoWorkAccumMs])

  // Duration mode: drive the live work accumulator. "Working" = there is a shift,
  // it isn't finished yet, not overtime, not before shift, the user is not on a break,
  // and the user hasn't manually paused.
  useEffect(() => {
    if (settings.mode !== 'pay') return
    const payPaused = useShiftStore.getState().payPaused
    const workingNow = !payPaused && !!resolvedTemplate && !engineState.isShiftFinished && !engineState.isOvertime && !engineState.isBeforeShift && runningBreak === null
    updatePayWork(workingNow)
  }, [settings.mode, resolvedTemplate, engineState.isShiftFinished, engineState.isOvertime, engineState.isBeforeShift, runningBreak, updatePayWork])

  // Payback auto-finish: as soon as the paid amount reaches the owed aşım, the
  // payback session ends on its own — it never stays open to over-pay.
  const finishPaybackRef = useRef(finishPayback)
  finishPaybackRef.current = finishPayback
  useEffect(() => {
    if (paybackStartTs === null) return
    const nowMs = Date.now()
    const owedMs = idleAccumMs + (idleStartTs !== null ? Math.max(0, nowMs - idleStartTs) : 0)
    const paidMs = paybackAccumMs + Math.max(0, nowMs - paybackStartTs)
    if (owedMs > 0 && paidMs >= owedMs) {
      finishPaybackRef.current()
    }
  }, [paybackStartTs, paybackAccumMs, idleAccumMs, idleStartTs, time])

  // ── Chrono work/break reminders ────────────────────────────────────────────
  const showReminder = useShiftStore((s) => s.showReminder)
  const chronoWorkReminderFired = useRef(false)
  const chronoBreakReminderFired = useRef(false)
  useEffect(() => {
    if (settings.mode !== 'chrono') return
    if (settings.chronoWorkReminderMin > 0 && engineState.isChronoWork && chronoStartedAt) {
      const elapsedMin = (Date.now() - chronoStartedAt) / 60000
      if (elapsedMin >= settings.chronoWorkReminderMin && !chronoWorkReminderFired.current) {
        chronoWorkReminderFired.current = true
        showReminder('work', `Sürekli ${settings.chronoWorkReminderMin} dk çalıştın — mola zamanı!`)
      }
    }
    if (!engineState.isChronoWork) chronoWorkReminderFired.current = false

    if (settings.chronoBreakReminderMin > 0 && engineState.isChronoBreak && chronoStartedAt) {
      const elapsedMin = (Date.now() - chronoStartedAt) / 60000
      if (elapsedMin >= settings.chronoBreakReminderMin && !chronoBreakReminderFired.current) {
        chronoBreakReminderFired.current = true
        showReminder('break', `Mola ${settings.chronoBreakReminderMin} dk'yı aştı — işe dönmelisin!`)
      }
    }
    if (!engineState.isChronoBreak) chronoBreakReminderFired.current = false
  }, [settings.mode, settings.chronoWorkReminderMin, settings.chronoBreakReminderMin, engineState.isChronoWork, engineState.isChronoBreak, chronoStartedAt, showReminder, time])

  const idleTotalMs = idleAccumMs + (idleStartTs !== null ? Math.max(0, Date.now() - idleStartTs) : 0)
  const paybackTotalMs = paybackAccumMs + (paybackStartTs !== null ? Math.max(0, Date.now() - paybackStartTs) : 0)
  // Net aşım — every second of an active payback subtracts from it
  const idleSeconds = Math.floor(Math.max(0, idleTotalMs - paybackTotalMs) / 1000)
  // Day's gross aşım log — grows with idle, never reduced by payback or reset (log purpose)
  const idleLogSeconds = Math.floor((idleLogMs + (idleStartTs !== null ? Math.max(0, Date.now() - idleStartTs) : 0)) / 1000)
  const paybackSeconds = Math.floor(paybackTotalMs / 1000)
  const paybackRunning = paybackStartTs !== null

  // Today's break seconds (never counted as working time):
  //  - Pay mode: closed sessions + the live running session (over-budget breaks are
  //    excluded — they accrue as aşım, not as break time).
  //  - MyShift: elapsed time inside planned break activities ("Mola mı?").
  const breakSeconds = useMemo(() => {
    if (settings.mode === 'chrono') {
      return Math.floor(chronoBreakTotalMs / 1000)
    }
    if (settings.mode === 'pay') {
      const closed = Object.values(breakUsage).reduce((a, b) => a + (b ?? 0), 0) * 60
      const runningInBudget = runningBreak && !runningBreak.overBudget
        ? Math.max(0, Math.floor((Date.now() - runningBreak.startedAt) / 1000))
        : 0
      return closed + runningInBudget
    }
    const realSecs = timeToSeconds(timeString)
    const sorted = [...(resolvedTemplate?.activities ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime))
    let s = 0
    for (const act of sorted) {
      if (!act.isBreak) continue
      const st = timeToSeconds(`${act.startTime}:00`)
      const en = timeToSeconds(`${act.endTime}:00`)
      if (realSecs >= en) {
        s += act.duration * 60
      } else if (realSecs >= st) {
        s += realSecs - st
        break
      } else {
        break
      }
    }
    return s
    // `time` ticks every second so a live break keeps growing on screen
  }, [settings.mode, breakUsage, runningBreak, resolvedTemplate, timeString, time, chronoBreakTotalMs])

  // Live worked-time estimate — driven by the accumulator which only counts real
  // work time (breaks excluded). In Pay mode the accumulator is gated by
  // isBeforeShift / isOvertime / runningBreak, so it only runs during the actual
  // work window. Duration mode also uses the same accumulator.
  const workedSeconds = useMemo(() => {
    if (settings.mode === 'chrono') {
      return Math.floor(chronoWorkTotalMs / 1000)
    }
    if (settings.mode === 'pay') {
      return Math.floor(payWorkTotalMs / 1000)
    }
    return resolvedTemplate && resolvedTemplate.activities.length > 0
      ? computeWorkedSeconds(resolvedTemplate.activities, timeToSeconds(timeString))
      : 0
  }, [settings.mode, payWorkTotalMs, resolvedTemplate, timeString, time, chronoWorkTotalMs])

  // Persist a daily snapshot for the History page + the hourly today log for the
  // "Bugünün Özeti" tab (both throttled to once a minute). Hourly idle/payback are
  // stored against a base cursor captured at the hour's first write so the values
  // stay correct across app restarts within the same hour.
  const updateDayLog = useShiftStore((state) => state.updateDayLog)
  const todayHourly = useShiftStore((state) => state.todayHourly)
  const setTodayHourly = useShiftStore((state) => state.setTodayHourly)
  const lastDayLogWrite = useRef(0)
  useEffect(() => {
    const nowMs = Date.now()
    if (nowMs - lastDayLogWrite.current < 60000) return
    lastDayLogWrite.current = nowMs
    updateDayLog(currentDateStr, { workedSeconds, idleSeconds: idleLogSeconds, paybackSeconds, breakSeconds, breakCount, mode: settings.mode })

    const hh = new Date(nowMs).getHours().toString().padStart(2, '0')
    const hourKey = `${hh}:00`
    const idleTotalMs = idleLogMs + (idleStartTs !== null ? Math.max(0, nowMs - idleStartTs) : 0)
    const pbTotalMs = paybackAccumMs + (paybackStartTs !== null ? Math.max(0, nowMs - paybackStartTs) : 0)
    const cur = todayHourly[hourKey]
    const baseIdle = cur?.cursorIdle ?? idleTotalMs
    const basePb = cur?.cursorPayback ?? pbTotalMs
    setTodayHourly(hourKey, {
      idleSeconds: Math.floor((idleTotalMs - baseIdle) / 1000),
      paybackSeconds: Math.floor((pbTotalMs - basePb) / 1000),
      cursorIdle: baseIdle,
      cursorPayback: basePb
    })
  }, [currentDateStr, workedSeconds, idleLogSeconds, paybackSeconds, breakSeconds, breakCount, updateDayLog, idleLogMs, idleStartTs, paybackAccumMs, paybackStartTs, todayHourly, setTodayHourly, settings.mode])

  // Push live status to the tray tooltip (refreshed ~once per second via timeString)
  useEffect(() => {
    if (!window.electronAPI?.tray?.updateInfo) return
    const { currentActivity, isBeforeShift, isShiftFinished, isOvertime } = engineState
    const clock = timeString.substring(0, 5)
    let status: string
    if (settings.mode === 'chrono') {
      if (engineState.isChronoWork) status = `⏱ Çalışma: ${formatRemaining(engineState.chronoWorkSecs)}`
      else if (engineState.isChronoBreak) status = `☕ Mola: ${formatRemaining(engineState.chronoBreakSecs)}`
      else status = '⏸ Duraklatıldı'
    } else if (currentActivity) {
      status = `${currentActivity.icon} ${currentActivity.name}`
    } else if (isBeforeShift) {
      status = 'Vardiya başlamadı'
    } else if (isShiftFinished) {
      status = 'Vardiya tamamlandı'
    } else if (isOvertime) {
      status = `Aşım: ${formatRemaining(idleSeconds)}`
    } else if (paybackRunning) {
      status = `Payback • Kalan aşım ${formatRemaining(idleSeconds)}`
    } else if (idleSeconds > 0) {
      const h = Math.floor(idleSeconds / 3600)
      const m = Math.floor((idleSeconds % 3600) / 60)
      const s = idleSeconds % 60
      status = `Aşım: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    } else {
      status = 'Aşım / Boşta'
    }
    window.electronAPI.tray.updateInfo(`${resolvedTemplate?.name || 'MyShift'} • ${clock} • ${status}`)
  }, [engineState, idleSeconds, timeString, resolvedTemplate])

  // Handle transitions and notifications (with spam-protection).
  // Dashboard AND Timeline each mount their own engine instance; only the first
  // one may own notifications, otherwise every transition fires duplicated toasts.
  useEffect(() => {
    if (notificationOwnerActive) return
    notificationOwnerActive = true
    const release = () => { notificationOwnerActive = false }

    if (!resolvedTemplate) return release

    const realSecs = timeToSeconds(timeString)
    const currentSecs = (realSecs + timeOffset + 86400) % 86400
    const { currentActivity, nextActivity, isShiftFinished, isBeforeShift, shiftStartSecs, isOvertime } = engineState
    const currentActivityId = currentActivity?.id || null

    // First Run spam protection: Sync states, disable actual notification show/sound
    if (isFirstRun.current) {
      setPrevActivityId(currentActivityId)
      if (currentSecs >= shiftStartSecs && !isBeforeShift && !isShiftFinished && !isOvertime) {
        setHasNotifiedShiftStart(true)
      }
      if (isShiftFinished || isOvertime) {
        setHasNotifiedShiftEnd(true)
      }
      isFirstRun.current = false
      return release
    }

    // Manual rewind happened → sync state without firing notifications
    if (prevOffset.current !== timeOffset) {
      prevOffset.current = timeOffset
      setPrevActivityId(currentActivityId)
      return release
    }

    // 1. Shift Started Notification
    let shiftStartedJustNow = false
    if (currentSecs >= shiftStartSecs && isBeforeShift === false && !hasNotifiedShiftStart && !isShiftFinished && !isOvertime) {
      window.electronAPI?.notification?.show('🌅 Vardiya Başladı', 'Bugünün planı başladı. İyi çalışmalar!')
      playSound(settings.defaultNotificationSound)
      setHasNotifiedShiftStart(true)
      shiftStartedJustNow = true
    }

    // 2. Activity Changed Notification — when the shift just started, the first
    //    activity's toast is redundant with the "Vardiya başladı" toast, so skip it.
    if (currentActivityId !== prevActivityId && !(shiftStartedJustNow && !prevActivityId)) {
      if (currentActivity) {
        if (currentActivity.notificationEnabled) {
          const mins = currentActivity.duration
          const durLabel = mins >= 60
            ? `${Math.floor(mins / 60)} sa ${mins % 60 > 0 ? `${mins % 60} dk` : ''}`.trim()
            : `${mins} dk`
          window.electronAPI?.notification?.show(
            `${currentActivity.icon} ${currentActivity.name}`,
            `Başlama vakti geldi — ${durLabel}. İyi geçsin!`
          )
          playSound(currentActivity.notificationSound)
        }
      } else if (prevActivityId && !isShiftFinished && !isBeforeShift && !isOvertime) {
        const nextLabel = nextActivity ? `${nextActivity.icon} ${nextActivity.name}` : 'sıradaki aktivite'
        window.electronAPI?.notification?.show(
          '🧘 Mola Vakti',
          `Aktivite bitti. Sıradaki: ${nextLabel}. Bu ara geçen süre aşım olarak sayılır.`
        )
        playSound('default')
      }
      setPrevActivityId(currentActivityId)
    }

    // 3. Shift Finished / Overtime Notification
    if ((isShiftFinished || isOvertime) && !hasNotifiedShiftEnd) {
      if (isOvertime) {
        window.electronAPI?.notification?.show(
          '⏰ Aşım Başladı',
          durationMode
            ? 'Hedef süre doldu — vardiyayı tamamlayana kadar geçen her saniye aşım olarak sayılıyor.'
            : 'Vardiya saati doldu — geçen her saniye aşım olarak sayılıyor.'
        )
      } else {
        window.electronAPI?.notification?.show(
          '🎉 Vardiya Tamamlandı',
          'Bugünün tüm aktivitelerini bitirdin. Dinlenme zamanı!'
        )
      }
      playSound('bell')
      setHasNotifiedShiftEnd(true)
      setPrevActivityId(null)
    }

    // Reset daily notifications state if we cross midnight
    if (realSecs === 0) {
      setTimeOffset(0)
      setHasNotifiedShiftStart(false)
      setHasNotifiedShiftEnd(false)
      setPrevActivityId(null)
      prevOffset.current = 0
      isFirstRun.current = true
    }

    return release
  }, [engineState, timeString, resolvedTemplate, prevActivityId, hasNotifiedShiftStart, hasNotifiedShiftEnd, settings, timeOffset, durationMode])

  return {
    currentTime: timeString.substring(0, 5), // "HH:mm" for display
    currentTimeSecs: timeString, // "HH:mm:ss"
    currentDateStr,
    activeTemplate: resolvedTemplate,
    ...engineState,
    remainingTimeStr: formatRemaining(engineState.remainingSeconds, engineState.isOvertime),
    effectiveTime: secondsToHHMM(effectiveSecs),
    effectiveSecs,
    durationMode,
    durationTargetSecs,
    payWorkSecs,
    idleSeconds,
    idleLogSeconds,
    paybackSeconds,
    paybackRunning,
    workedSeconds,
    breakSeconds,
    breakCount,
    breakRunning: runningBreak !== null,
    resetIdle,
    startPayback,
    stopPayback,
    finishPayback,
    timeOffset,
    chronoMode,
    chronoStartedAt,
  }
}
