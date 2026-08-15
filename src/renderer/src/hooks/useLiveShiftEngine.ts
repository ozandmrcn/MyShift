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
  if (totalSecs <= 0) return '00:00'
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
// activities plus the partial time spent inside the current one.
export function computeWorkedSeconds(activities: Activity[], realSecs: number): number {
  let worked = 0
  const sorted = [...activities].sort((a, b) => a.startTime.localeCompare(b.startTime))
  for (const act of sorted) {
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

  // Get current and next activities
  const engineState = useMemo(() => {
    if (!activeTemplate || activeTemplate.activities.length === 0) {
      return {
        currentActivity: null,
        nextActivity: null,
        remainingSeconds: 0,
        activityProgress: 0,
        shiftProgress: 0,
        activitiesStatus: {} as Record<string, 'completed' | 'active' | 'future'>,
        isShiftFinished: false,
        isBeforeShift: false,
        isOvertime: false,
        overtimeSeconds: 0,
        shiftStartSecs: 0,
        shiftEndSecs: 0
      }
    }

    const currentSecs = effectiveSecs
    const activities = activeTemplate.activities

    // Sort activities (already sorted by saveTemplate)
    const sorted = [...activities].sort((a, b) => a.startTime.localeCompare(b.startTime))

    // Calculate boundary times in seconds
    const firstAct = sorted[0]
    const lastAct = sorted[sorted.length - 1]
    const shiftStartSecs = timeToSeconds(`${firstAct.startTime}:00`)
    const shiftEndSecs = timeToSeconds(`${lastAct.endTime}:00`)

    // Check if shift is manually completed by user for today
    const isManuallyCompleted = completedShifts.includes(currentDateStr)

    let currentActivity: Activity | null = null
    let nextActivity: Activity | null = null
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
    } else if (currentSecs < shiftStartSecs) {
      isBeforeShift = true
      nextActivity = firstAct
      remainingSeconds = shiftStartSecs - currentSecs
    } else if (currentSecs >= shiftEndSecs) {
      // Overtime! (Vardiya Bitiş Saati Aşıldı ama kullanıcı henüz manuel tamamlamadı)
      isOvertime = true
      currentActivity = null
      nextActivity = null
      overtimeSeconds = currentSecs - shiftEndSecs
      remainingSeconds = overtimeSeconds
    } else {
      // We are inside the shift duration
      for (let i = 0; i < sorted.length; i++) {
        const act = sorted[i]
        const actStartSecs = timeToSeconds(`${act.startTime}:00`)
        const actEndSecs = timeToSeconds(`${act.endTime}:00`)

        if (currentSecs >= actStartSecs && currentSecs < actEndSecs) {
          currentActivity = act
          remainingSeconds = actEndSecs - currentSecs
          const durationSecs = act.duration * 60
          const elapsedSecs = currentSecs - actStartSecs
          activityProgress = durationSecs > 0 ? (elapsedSecs / durationSecs) * 100 : 0
          
          if (i + 1 < sorted.length) {
            nextActivity = sorted[i + 1]
          }
          break
        }

        // Handle gaps
        if (i < sorted.length - 1) {
          const nextAct = sorted[i + 1]
          const nextActStartSecs = timeToSeconds(`${nextAct.startTime}:00`)
          if (currentSecs >= actEndSecs && currentSecs < nextActStartSecs) {
            currentActivity = null
            nextActivity = nextAct
            remainingSeconds = nextActStartSecs - currentSecs
            break
          }
        }
      }
    }

    // Calculate shift completion %
    let shiftProgress = 0
    if (isShiftFinished) {
      shiftProgress = 100
    } else if (!isBeforeShift && !isOvertime) {
      const totalShiftDuration = shiftEndSecs - shiftStartSecs
      const elapsedShiftSecs = currentSecs - shiftStartSecs
      shiftProgress = totalShiftDuration > 0 ? (elapsedShiftSecs / totalShiftDuration) * 100 : 0
    } else if (isOvertime) {
      shiftProgress = 100
    }

    // Determine status of each activity for the timeline
    const activitiesStatus: Record<string, 'completed' | 'active' | 'future'> = {}
    sorted.forEach((act) => {
      const actStartSecs = timeToSeconds(`${act.startTime}:00`)
      const actEndSecs = timeToSeconds(`${act.endTime}:00`)

      if (isManuallyCompleted) {
        activitiesStatus[act.id] = 'completed'
      } else if (currentSecs < actStartSecs) {
        activitiesStatus[act.id] = 'future'
      } else if (currentSecs >= actEndSecs) {
        activitiesStatus[act.id] = 'completed'
      } else {
        activitiesStatus[act.id] = 'active'
      }
    })

    return {
      currentActivity,
      nextActivity,
      remainingSeconds,
      activityProgress,
      shiftProgress,
      activitiesStatus,
      isShiftFinished,
      isBeforeShift,
      isOvertime,
      overtimeSeconds,
      shiftStartSecs,
      shiftEndSecs
    }
  }, [activeTemplate, effectiveSecs, completedShifts, currentDateStr])

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

  useEffect(() => {
    // Aşım only accrues while there IS an active shift with activities and the user
    // should be working but isn't (between activities / overtime). If there is no
    // shift for today, the user is simply free — NOT in aşım.
    const idleNow = !!activeTemplate && activeTemplate.activities.length > 0
      && !engineState.currentActivity && !engineState.isBeforeShift && !engineState.isShiftFinished
    updateIdle(idleNow)
  }, [engineState, updateIdle, activeTemplate])

  const idleTotalMs = idleAccumMs + (idleStartTs !== null ? Math.max(0, Date.now() - idleStartTs) : 0)
  const paybackTotalMs = paybackAccumMs + (paybackStartTs !== null ? Math.max(0, Date.now() - paybackStartTs) : 0)
  // Net aşım — every second of an active payback subtracts from it
  const idleSeconds = Math.floor(Math.max(0, idleTotalMs - paybackTotalMs) / 1000)
  // Day's gross aşım log — grows with idle, never reduced by payback or reset (log purpose)
  const idleLogSeconds = Math.floor((idleLogMs + (idleStartTs !== null ? Math.max(0, Date.now() - idleStartTs) : 0)) / 1000)
  const paybackSeconds = Math.floor(paybackTotalMs / 1000)
  const paybackRunning = paybackStartTs !== null

  // Live worked-time estimate (based on the real clock, ignoring manual rewind)
  const workedSeconds = activeTemplate && activeTemplate.activities.length > 0
    ? computeWorkedSeconds(activeTemplate.activities, timeToSeconds(timeString))
    : 0

  // Persist a daily snapshot for the History page (throttled to once a minute)
  const updateDayLog = useShiftStore((state) => state.updateDayLog)
  const lastDayLogWrite = useRef(0)
  useEffect(() => {
    const now = Date.now()
    if (now - lastDayLogWrite.current < 60000) return
    lastDayLogWrite.current = now
    updateDayLog(currentDateStr, { workedSeconds, idleSeconds: idleLogSeconds, paybackSeconds })
  }, [currentDateStr, workedSeconds, idleLogSeconds, paybackSeconds, updateDayLog])

  // Push live status to the tray tooltip (refreshed ~once per second via timeString)
  useEffect(() => {
    if (!window.electronAPI?.tray?.updateInfo) return
    const { currentActivity, isBeforeShift, isShiftFinished, isOvertime } = engineState
    const clock = timeString.substring(0, 5)
    let status: string
    if (currentActivity) {
      status = `${currentActivity.icon} ${currentActivity.name}`
    } else if (isBeforeShift) {
      status = 'Vardiya başlamadı'
    } else if (isShiftFinished || isOvertime) {
      status = 'Vardiya tamamlandı'
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
    window.electronAPI.tray.updateInfo(`${activeTemplate?.name || 'MyShift'} • ${clock} • ${status}`)
  }, [engineState, idleSeconds, timeString, activeTemplate])

  // Handle transitions and notifications (with spam-protection).
  // Dashboard AND Timeline each mount their own engine instance; only the first
  // one may own notifications, otherwise every transition fires duplicated toasts.
  useEffect(() => {
    if (notificationOwnerActive) return
    notificationOwnerActive = true
    const release = () => { notificationOwnerActive = false }

    if (!activeTemplate) return release

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
          '☕ Mola Vakti',
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
          'Vardiya saati doldu — geçen her saniye aşım olarak sayılıyor.'
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
  }, [engineState, timeString, activeTemplate, prevActivityId, hasNotifiedShiftStart, hasNotifiedShiftEnd, settings, timeOffset])

  return {
    currentTime: timeString.substring(0, 5), // "HH:mm" for display
    currentTimeSecs: timeString, // "HH:mm:ss"
    currentDateStr,
    activeTemplate,
    ...engineState,
    remainingTimeStr: formatRemaining(engineState.remainingSeconds, engineState.isOvertime),
    effectiveTime: secondsToHHMM(effectiveSecs),
    idleSeconds,
    idleLogSeconds,
    paybackSeconds,
    paybackRunning,
    workedSeconds,
    resetIdle,
    startPayback,
    stopPayback,
    finishPayback,
    timeOffset
  }
}
