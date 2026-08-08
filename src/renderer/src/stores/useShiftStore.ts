import { create } from 'zustand'

export interface Activity {
  id: string
  name: string
  icon: string
  color: string // Tailwind color names like 'blue', 'orange', 'emerald', 'indigo', etc.
  startTime: string // "HH:mm"
  endTime: string // "HH:mm"
  duration: number // in minutes
  notificationEnabled: boolean
  notificationSound: string // 'default', 'bell', 'digital', 'none'
  notes?: string
}

export interface ShiftTemplate {
  id: string
  name: string
  activities: Activity[]
  weekdays: number[] // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  customDates?: string[] // "YYYY-MM-DD"
  isActive: boolean
}

export interface Settings {
  launchWithWindows: boolean
  startMinimized: boolean
  minimizeToTray: boolean
  autoMinimizeToTray: boolean
  defaultNotificationSound: string
  birthday: string // "MM-DD"
}

export interface DayLog {
  workedSeconds: number
  idleSeconds: number
  paybackSeconds: number
  completed: boolean
}

interface ShiftStore {
  templates: ShiftTemplate[]
  settings: Settings
  completedShifts: string[] // List of dates "YYYY-MM-DD" completed by user
  isLoading: boolean
  timeOffset: number // seconds; 0 = live clock, negative = rewound to an earlier point of the day

  // Aşım (idle) stopwatch — shared single source so every view shows the same live value.
  idleAccumMs: number // accumulated idle ms (excluding the current ongoing session)
  idleStartTs: number | null // Date.now() when the current idle session started (null = not idle)
  idleDay: string // "YYYY-MM-DD" the counter currently belongs to (drives the daily auto-reset)

  // Day's GROSS aşım log — keeps accruing, is never reduced by payback or by resetIdle,
  // and resets only at the day change. It exists purely to record how much aşım was
  // accrued today (the live net counter, by contrast, goes down while payback runs).
  idleLogMs: number

  // Payback (geri ödeme) — work sessions that pay back aşım time. Each second of an
  // active payback subtracts from the aşım counter; its own stopwatch stays independent.
  paybackAccumMs: number // accumulated payback ms (closed sessions)
  paybackStartTs: number | null // Date.now() while a payback session is running (null = not running)

  // Daily history — one snapshot record per date, kept for the History page
  dailyLogs: Record<string, DayLog>
  
  // Actions
  loadFromStore: () => Promise<void>
  saveTemplate: (template: ShiftTemplate) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  duplicateTemplate: (id: string) => Promise<void>
  updateSettings: (settings: Partial<Settings>) => Promise<void>
  importTemplates: (importedJson: string) => Promise<{ success: boolean; count: number; error?: string }>
  exportTemplates: () => string
  addTurkishHolidays: (templateId: string) => Promise<void>
  extendActiveShift: (templateId: string, minutes: number) => Promise<void>
  completeShift: (dateStr: string) => Promise<void>
  uncompleteShift: (dateStr: string) => Promise<void>
  setTimeOffset: (offset: number) => void
  updateIdle: (isIdleNow: boolean) => void
  resetIdle: () => void
  startPayback: () => void
  stopPayback: () => void
  finishPayback: () => void
  updateDayLog: (dateStr: string, log: Partial<DayLog>) => void
}

const defaultSettings: Settings = {
  launchWithWindows: false,
  startMinimized: false,
  minimizeToTray: true,
  autoMinimizeToTray: true,
  defaultNotificationSound: 'default',
  birthday: ''
}

// Helper to calculate duration in minutes between HH:mm and HH:mm
export function calculateDuration(start: string, end: string): number {
  const [startH, startM] = start.split(':').map(Number)
  const [endH, endM] = end.split(':').map(Number)
  
  let startMinutes = startH * 60 + startM
  let endMinutes = endH * 60 + endM
  
  if (endMinutes < startMinutes) {
    // Over midnight shift handling
    endMinutes += 24 * 60
  }
  
  return endMinutes - startMinutes
}

export const useShiftStore = create<ShiftStore>((set, get) => {
  const persistIdle = () => {
    const s = get()
    const payload = {
      idleAccumMs: s.idleAccumMs,
      idleStartTs: s.idleStartTs,
      idleDay: s.idleDay,
      idleLogMs: s.idleLogMs,
      paybackAccumMs: s.paybackAccumMs,
      paybackStartTs: s.paybackStartTs
    }
    const api = window.electronAPI
    if (api && api.store) {
      api.store.set('idleState', payload)
    } else {
      localStorage.setItem('idleState', JSON.stringify(payload))
    }
  }

  return {
  templates: [],
  settings: defaultSettings,
  completedShifts: [],
  isLoading: true,
  timeOffset: 0,
  idleAccumMs: 0,
  idleStartTs: null,
  idleDay: '',
  idleLogMs: 0,
  paybackAccumMs: 0,
  paybackStartTs: null,
  dailyLogs: {},

  loadFromStore: async () => {
    set({ isLoading: true })
    try {
      const api = window.electronAPI
      if (api && api.store) {
        const savedTemplates = await api.store.get('templates', [])
        const savedSettings = await api.store.get('settings', defaultSettings)
        const savedCompleted = await api.store.get('completedShifts', [])

        // Keep the completion history bounded — drop records older than 90 days
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 90)
        const cutoffStr = `${cutoff.getFullYear()}-${(cutoff.getMonth() + 1).toString().padStart(2, '0')}-${cutoff.getDate().toString().padStart(2, '0')}`
        const prunedCompleted = (savedCompleted as string[]).filter(d => d >= cutoffStr)
        if (prunedCompleted.length !== (savedCompleted as string[]).length) {
          api.store.set('completedShifts', prunedCompleted)
        }

        const isStartupEnabled = await api.startup.get()

        const savedIdle = (await api.store.get('idleState', null)) as {
          idleAccumMs?: number
          idleLogMs?: number
          paybackAccumMs?: number
          idleDay?: string
        } | null

        const savedDayLogs = (await api.store.get('dailyLogs', {})) as Record<string, DayLog>
        const prunedDayLogs: Record<string, DayLog> = {}
        for (const [date, log] of Object.entries(savedDayLogs)) {
          if (date >= cutoffStr) prunedDayLogs[date] = log
        }
        if (Object.keys(prunedDayLogs).length !== Object.keys(savedDayLogs).length) {
          api.store.set('dailyLogs', prunedDayLogs)
        }

        const now = new Date()
        const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
        const sameDay = !!savedIdle && savedIdle.idleDay === todayStr

        set({ 
          templates: savedTemplates, 
          settings: { ...defaultSettings, ...savedSettings, launchWithWindows: isStartupEnabled },
          completedShifts: prunedCompleted,
          dailyLogs: prunedDayLogs,
          idleAccumMs: sameDay ? savedIdle.idleAccumMs ?? 0 : 0,
          idleStartTs: null,
          idleDay: todayStr,
          idleLogMs: sameDay ? savedIdle.idleLogMs ?? 0 : 0,
          paybackAccumMs: sameDay ? savedIdle.paybackAccumMs ?? 0 : 0,
          paybackStartTs: null,
          isLoading: false 
        })
      } else {
        // Fallback for browser-only preview if run outside Electron
        const localTemplates = localStorage.getItem('templates')
        const localSettings = localStorage.getItem('settings')
        const localCompleted = localStorage.getItem('completedShifts')
        const localIdle = localStorage.getItem('idleState')
        const idleParsed = localIdle ? JSON.parse(localIdle) : null
        const bNow = new Date()
        const bToday = `${bNow.getFullYear()}-${(bNow.getMonth() + 1).toString().padStart(2, '0')}-${bNow.getDate().toString().padStart(2, '0')}`
        const bSameDay = !!idleParsed && idleParsed.idleDay === bToday
        set({
          templates: localTemplates ? JSON.parse(localTemplates) : [],
          settings: localSettings ? JSON.parse(localSettings) : defaultSettings,
          completedShifts: localCompleted ? JSON.parse(localCompleted) : [],
          idleAccumMs: bSameDay ? idleParsed.idleAccumMs ?? 0 : 0,
          idleStartTs: null,
          idleDay: bToday,
          idleLogMs: bSameDay ? idleParsed.idleLogMs ?? 0 : 0,
          paybackAccumMs: bSameDay ? idleParsed.paybackAccumMs ?? 0 : 0,
          paybackStartTs: null,
          isLoading: false
        })
      }
    } catch (error) {
      console.error('Failed to load store data:', error)
      set({ isLoading: false })
    }
  },

  saveTemplate: async (template) => {
    // Sort activities by start time before saving
    const sortedActivities = [...template.activities].sort((a, b) => {
      return a.startTime.localeCompare(b.startTime)
    })
    
    const updatedTemplate = { ...template, activities: sortedActivities }
    const { templates } = get()
    
    let newTemplates: ShiftTemplate[]
    const exists = templates.some(t => t.id === template.id)
    
    if (exists) {
      newTemplates = templates.map(t => t.id === template.id ? updatedTemplate : t)
    } else {
      newTemplates = [...templates, updatedTemplate]
    }

    set({ templates: newTemplates })

    const api = window.electronAPI
    if (api && api.store) {
      await api.store.set('templates', newTemplates)
    } else {
      localStorage.setItem('templates', JSON.stringify(newTemplates))
    }
  },

  deleteTemplate: async (id) => {
    const { templates } = get()
    const newTemplates = templates.filter(t => t.id !== id)
    set({ templates: newTemplates })

    const api = window.electronAPI
    if (api && api.store) {
      await api.store.set('templates', newTemplates)
    } else {
      localStorage.setItem('templates', JSON.stringify(newTemplates))
    }
  },

  duplicateTemplate: async (id) => {
    const { templates } = get()
    const target = templates.find(t => t.id === id)
    if (!target) return

    const duplicated: ShiftTemplate = {
      ...target,
      id: crypto.randomUUID(),
      name: `${target.name} (Copy)`,
      isActive: false // Default to false for duplicates
    }

    const newTemplates = [...templates, duplicated]
    set({ templates: newTemplates })

    const api = window.electronAPI
    if (api && api.store) {
      await api.store.set('templates', newTemplates)
    } else {
      localStorage.setItem('templates', JSON.stringify(newTemplates))
    }
  },

  updateSettings: async (newSettings) => {
    const currentSettings = get().settings
    const updated = { ...currentSettings, ...newSettings }
    set({ settings: updated })

    const api = window.electronAPI
    if (api) {
      if (api.store) {
        await api.store.set('settings', updated)
      }
      
      // Update startup registry if launchWithWindows changed
      if (newSettings.launchWithWindows !== undefined) {
        await api.startup.set(newSettings.launchWithWindows)
      }
    } else {
      localStorage.setItem('settings', JSON.stringify(updated))
    }
  },

  importTemplates: async (importedJson) => {
    try {
      const parsed = JSON.parse(importedJson)
      if (!Array.isArray(parsed)) {
        return { success: false, count: 0, error: 'İçe aktarılan veri bir dizi (array) olmalıdır.' }
      }

      // Simple validation of structure
      const validTemplates: ShiftTemplate[] = []
      for (const item of parsed) {
        if (item.name && Array.isArray(item.activities)) {
          // Normalize and regenerate UUIDs to prevent collisions
          const activities: Activity[] = item.activities.map((act: any) => ({
            id: act.id || crypto.randomUUID(),
            name: act.name || 'Untitled Activity',
            icon: act.icon || '📅',
            color: act.color || 'blue',
            startTime: act.startTime || '09:00',
            endTime: act.endTime || '17:00',
            duration: act.duration || calculateDuration(act.startTime || '09:00', act.endTime || '17:00'),
            notificationEnabled: act.notificationEnabled !== undefined ? act.notificationEnabled : true,
            notificationSound: act.notificationSound || 'default',
            notes: act.notes || ''
          }))

          validTemplates.push({
            id: crypto.randomUUID(),
            name: item.name,
            activities,
            weekdays: Array.isArray(item.weekdays) ? item.weekdays : [1, 2, 3, 4, 5],
            customDates: Array.isArray(item.customDates) ? item.customDates : [],
            isActive: item.isActive !== undefined ? item.isActive : false
          })
        }
      }

      if (validTemplates.length === 0) {
        return { success: false, count: 0, error: 'Veri içinde geçerli bir şablon bulunamadı.' }
      }

      const { templates } = get()
      const newTemplates = [...templates, ...validTemplates]
      set({ templates: newTemplates })

      const api = window.electronAPI
      if (api && api.store) {
        await api.store.set('templates', newTemplates)
      } else {
        localStorage.setItem('templates', JSON.stringify(newTemplates))
      }

      return { success: true, count: validTemplates.length }
    } catch (e) {
      return { success: false, count: 0, error: 'JSON Ayrıştırma Hatası: Geçersiz dosya formatı.' }
    }
  },

  exportTemplates: () => {
    return JSON.stringify(get().templates, null, 2)
  },

  addTurkishHolidays: async (templateId) => {
    const { templates, saveTemplate } = get()
    const target = templates.find(t => t.id === templateId)
    if (!target) return

    // 2026 Turkey Public Holidays
    const holidays = [
      '2026-01-01', // Yılbaşı
      '2026-03-19', '2026-03-20', '2026-03-21', '2026-03-22', // Ramazan Bayramı Arefesi & Bayramı
      '2026-04-23', // Ulusal Egemenlik ve Çocuk Bayramı
      '2026-05-01', // Emek ve Dayanışma Günü
      '2026-05-19', // Atatürk'ü Anma, Gençlik ve Spor Bayramı
      '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', // Kurban Bayramı Arefesi & Bayramı
      '2026-07-15', // Demokrasi ve Milli Birlik Günü
      '2026-08-30', // Zafer Bayramı
      '2026-10-28', '2026-10-29' // Cumhuriyet Bayramı
    ]

    const currentCustomDates = target.customDates || []
    // Merge without duplicates
    const merged = Array.from(new Set([...currentCustomDates, ...holidays])).sort()
    
    await saveTemplate({ ...target, customDates: merged })
  },

  extendActiveShift: async (templateId, minutes) => {
    const { templates, saveTemplate } = get()
    const target = templates.find(t => t.id === templateId)
    if (!target || target.activities.length === 0) return

    // Find last activity
    const sorted = [...target.activities].sort((a, b) => a.startTime.localeCompare(b.startTime))
    const lastAct = sorted[sorted.length - 1]

    // Calculate new end time
    const [h, m] = lastAct.endTime.split(':').map(Number)
    let totalMins = h * 60 + m + minutes
    
    // Clamped within 24h
    if (totalMins >= 24 * 60) {
      totalMins = 24 * 60 - 1 // 23:59
    }
    
    const newH = Math.floor(totalMins / 60)
    const newM = totalMins % 60
    const newEndTime = `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`

    const updatedActivities = target.activities.map(act => {
      if (act.id === lastAct.id) {
        return {
          ...act,
          endTime: newEndTime,
          duration: calculateDuration(act.startTime, newEndTime)
        }
      }
      return act
    })

    await saveTemplate({ ...target, activities: updatedActivities })
  },

  completeShift: async (dateStr) => {
    const { completedShifts, paybackAccumMs, paybackStartTs } = get()
    if (completedShifts.includes(dateStr)) return

    const newCompleted = [...completedShifts, dateStr]

    // A running payback session ends together with the shift
    const now = Date.now()
    const newPaybackAccum = paybackAccumMs + (paybackStartTs !== null ? Math.max(0, now - paybackStartTs) : 0)

    set({ completedShifts: newCompleted, paybackAccumMs: newPaybackAccum, paybackStartTs: null })
    persistIdle()
    get().updateDayLog(dateStr, { completed: true })

    const api = window.electronAPI
    if (api && api.store) {
      await api.store.set('completedShifts', newCompleted)
    } else {
      localStorage.setItem('completedShifts', JSON.stringify(newCompleted))
    }
  },

  uncompleteShift: async (dateStr) => {
    const { completedShifts } = get()
    const newCompleted = completedShifts.filter(d => d !== dateStr)
    set({ completedShifts: newCompleted })
    get().updateDayLog(dateStr, { completed: false })

    const api = window.electronAPI
    if (api && api.store) {
      await api.store.set('completedShifts', newCompleted)
    } else {
      localStorage.setItem('completedShifts', JSON.stringify(newCompleted))
    }
  },

  setTimeOffset: (offset) => {
    set({ timeOffset: offset })
  },

  updateIdle: (isIdleNow) => {
    const now = Date.now()
    const d = new Date()
    const day = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
    const { idleAccumMs, idleLogMs, idleStartTs, idleDay, paybackStartTs } = get()

    // Auto-reset at the start of each day (the day's first activity)
    if (idleDay !== day) {
      set({
        idleAccumMs: 0,
        idleLogMs: 0,
        idleStartTs: isIdleNow && paybackStartTs === null ? now : null,
        idleDay: day,
        paybackAccumMs: 0,
        paybackStartTs: null
      })
      persistIdle()
      return
    }

    // During an active payback session the user counts as working, not idle —
    // so aşım is NOT accrued (it is being paid back instead).
    const effectivelyIdle = isIdleNow && paybackStartTs === null
    if (effectivelyIdle && idleStartTs === null) {
      set({ idleStartTs: now })
      persistIdle()
    } else if (!effectivelyIdle && idleStartTs !== null) {
      const delta = Math.max(0, now - idleStartTs)
      // The log records the gross aşım accrued — it grows even across resets and is
      // never reduced by payback (payback only lowers the live net counter).
      set({ idleAccumMs: idleAccumMs + delta, idleLogMs: idleLogMs + delta, idleStartTs: null })
      persistIdle()
    }
  },

  resetIdle: () => {
    set({ idleAccumMs: 0, idleStartTs: null })
    persistIdle()
  },

  startPayback: () => {
    const now = Date.now()
    const { paybackStartTs, idleAccumMs, idleLogMs, idleStartTs } = get()
    if (paybackStartTs !== null) return // already running

    // If an idle session is in progress, close it first — payback counts as working
    let newIdleAccum = idleAccumMs
    let newIdleLog = idleLogMs
    let newIdleStart = idleStartTs
    if (idleStartTs !== null) {
      const delta = Math.max(0, now - idleStartTs)
      newIdleAccum += delta
      newIdleLog += delta
      newIdleStart = null
    }

    set({ idleAccumMs: newIdleAccum, idleLogMs: newIdleLog, idleStartTs: newIdleStart, paybackStartTs: now })
    persistIdle()
  },

  stopPayback: () => {
    const now = Date.now()
    const { paybackAccumMs, paybackStartTs } = get()
    if (paybackStartTs === null) return
    set({ paybackAccumMs: paybackAccumMs + Math.max(0, now - paybackStartTs), paybackStartTs: null })
    persistIdle()
  },

  finishPayback: () => {
    const now = Date.now()
    const { paybackAccumMs, paybackStartTs } = get()
    const newAccum = paybackAccumMs + (paybackStartTs !== null ? Math.max(0, now - paybackStartTs) : 0)
    set({ paybackAccumMs: newAccum, paybackStartTs: null })
    persistIdle()

    // Finishing the payback completes today's shift
    const d = new Date()
    const day = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
    get().completeShift(day)
  },

  updateDayLog: (dateStr, log) => {
    const { dailyLogs } = get()
    const current = dailyLogs[dateStr] || { workedSeconds: 0, idleSeconds: 0, paybackSeconds: 0, completed: false }
    const updated = { ...current, ...log }
    const newLogs = { ...dailyLogs, [dateStr]: updated }
    set({ dailyLogs: newLogs })

    const api = window.electronAPI
    if (api && api.store) {
      api.store.set('dailyLogs', newLogs)
    } else {
      localStorage.setItem('dailyLogs', JSON.stringify(newLogs))
    }
  }
  }
})
