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
  defaultNotificationSound: string
  birthday: string // "MM-DD"
}

interface ShiftStore {
  templates: ShiftTemplate[]
  settings: Settings
  completedShifts: string[] // List of dates "YYYY-MM-DD" completed by user
  isLoading: boolean
  
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
}

const defaultSettings: Settings = {
  launchWithWindows: false,
  startMinimized: false,
  minimizeToTray: true,
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

export const useShiftStore = create<ShiftStore>((set, get) => ({
  templates: [],
  settings: defaultSettings,
  completedShifts: [],
  isLoading: true,

  loadFromStore: async () => {
    set({ isLoading: true })
    try {
      const api = window.electronAPI
      if (api && api.store) {
        const savedTemplates = await api.store.get('templates', [])
        const savedSettings = await api.store.get('settings', defaultSettings)
        const savedCompleted = await api.store.get('completedShifts', [])
        const isStartupEnabled = await api.startup.get()

        set({ 
          templates: savedTemplates, 
          settings: { ...defaultSettings, ...savedSettings, launchWithWindows: isStartupEnabled },
          completedShifts: savedCompleted,
          isLoading: false 
        })
      } else {
        // Fallback for browser-only preview if run outside Electron
        const localTemplates = localStorage.getItem('templates')
        const localSettings = localStorage.getItem('settings')
        const localCompleted = localStorage.getItem('completedShifts')
        set({
          templates: localTemplates ? JSON.parse(localTemplates) : [],
          settings: localSettings ? JSON.parse(localSettings) : defaultSettings,
          completedShifts: localCompleted ? JSON.parse(localCompleted) : [],
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
    const { completedShifts } = get()
    if (completedShifts.includes(dateStr)) return

    const newCompleted = [...completedShifts, dateStr]
    set({ completedShifts: newCompleted })

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

    const api = window.electronAPI
    if (api && api.store) {
      await api.store.set('completedShifts', newCompleted)
    } else {
      localStorage.setItem('completedShifts', JSON.stringify(newCompleted))
    }
  }
}))
