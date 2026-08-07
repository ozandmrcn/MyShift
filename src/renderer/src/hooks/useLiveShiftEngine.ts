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

export function useLiveShiftEngine() {
  const templates = useShiftStore((state) => state.templates)
  const settings = useShiftStore((state) => state.settings)
  const completedShifts = useShiftStore((state) => state.completedShifts)
  
  const [time, setTime] = useState<Date>(new Date())
  const [prevActivityId, setPrevActivityId] = useState<string | null>(null)
  const [hasNotifiedShiftStart, setHasNotifiedShiftStart] = useState<boolean>(false)
  const [hasNotifiedShiftEnd, setHasNotifiedShiftEnd] = useState<boolean>(false)

  // First run lock to prevent notification spam on startup / reload
  const isFirstRun = useRef(true)

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const timeString = useMemo(() => {
    return time.toTimeString().split(' ')[0] // "HH:mm:ss"
  }, [time])

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
    const activeTemplates = templates.filter(t => t.isActive)
    
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

    const currentSecs = timeToSeconds(timeString)
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
  }, [activeTemplate, timeString, completedShifts, currentDateStr])

  // Handle transitions and notifications (with spam-protection)
  useEffect(() => {
    if (!activeTemplate) return

    const currentSecs = timeToSeconds(timeString)
    const { currentActivity, isShiftFinished, isBeforeShift, shiftStartSecs, isOvertime } = engineState
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
      return
    }

    // 1. Shift Started Notification
    if (currentSecs >= shiftStartSecs && isBeforeShift === false && !hasNotifiedShiftStart && !isShiftFinished && !isOvertime) {
      window.electronAPI?.notification?.show('MyShift', 'Vardiyanız başladı. İyi çalışmalar!')
      playSound(settings.defaultNotificationSound)
      setHasNotifiedShiftStart(true)
    }

    // 2. Activity Changed Notification
    if (currentActivityId !== prevActivityId) {
      if (currentActivity) {
        if (currentActivity.notificationEnabled) {
          const body = `${currentActivity.icon} ${currentActivity.name} başladı.`
          window.electronAPI?.notification?.show('Aktivite Başladı', body)
          playSound(currentActivity.notificationSound)
        }
      } else if (prevActivityId && !isShiftFinished && !isBeforeShift && !isOvertime) {
        window.electronAPI?.notification?.show('Aktivite Tamamlandı', 'Mevcut aktivite bitti, sıradaki aktiviteye kadar serbest zaman.')
        playSound('default')
      }
      setPrevActivityId(currentActivityId)
    }

    // 3. Shift Finished Notification
    if ((isShiftFinished || isOvertime) && !hasNotifiedShiftEnd) {
      window.electronAPI?.notification?.show('MyShift', 'Tebrikler! Bugünün vardiya saatleri tamamlandı.')
      playSound('bell')
      setHasNotifiedShiftEnd(true)
      setPrevActivityId(null)
    }

    // Reset daily notifications state if we cross midnight
    if (currentSecs === 0) {
      setHasNotifiedShiftStart(false)
      setHasNotifiedShiftEnd(false)
      setPrevActivityId(null)
      isFirstRun.current = true
    }

  }, [engineState, timeString, activeTemplate, prevActivityId, hasNotifiedShiftStart, hasNotifiedShiftEnd, settings])

  return {
    currentTime: timeString.substring(0, 5), // "HH:mm" for display
    currentTimeSecs: timeString, // "HH:mm:ss"
    currentDateStr,
    activeTemplate,
    ...engineState,
    remainingTimeStr: formatRemaining(engineState.remainingSeconds, engineState.isOvertime)
  }
}
