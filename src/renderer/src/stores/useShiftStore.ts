import { create } from 'zustand'

// The foreground-app snapshot push is registered once (guarded so hot-reloads or
// repeated loadFromStore calls don't stack listeners).
let appUsageSubscribed = false

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
  // "Mola mı?" — when ticked this activity is a break (logged as break time,
  // never counted as working time).
  isBreak?: boolean
}

// Pay-mode break categories (the two budgets the user configures in Settings).
// Subtype keys are stable identifiers used in breakUsage / DayLog stats.
export const SHORT_BREAK_SUBTYPES = ['cay', 'kahve', 'ihtiyac'] as const
export const MEAL_BREAK_SUBTYPES = ['kahvalti', 'ogle', 'aksam'] as const
export type BreakType = 'short' | 'meal'
export type BreakSubtype = 'cay' | 'kahve' | 'ihtiyac' | 'kahvalti' | 'ogle' | 'aksam'

// A live (running) break in Pay mode. `overBudget` marks breaks taken after the
// category budget was already spent — those count as aşım instead of a break.
export interface PayBreak {
  type: BreakType
  subtype: BreakSubtype
  startedAt: number // Date.now()
  overBudget: boolean
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

  // UI theme — one of the accent themes defined in index.css (e.g. 'mavi', 'zurut'...).
  // Defaults to 'mavi' (Gece Mavisi) so the app never drifts far from the classic look.
  theme: string

  // Comment engine — who writes the one-liner under the clock.
  // 'offline' = built-in generative engine (always works, no network).
  // 'ollama' / 'openai' / 'openrouter' = a local / remote LLM writes fresh lines instead.
  commentProvider: 'offline' | 'ollama' | 'openai' | 'openrouter'
  commentBaseUrl: string
  commentApiKey: string
  commentModel: string

  // Shift mode. 'myshift' = the activity-template mode (the classic MyShift behavior).
  // 'pay' = fixed start/end time with two daily break budgets (kısa mola + yemek molası).
  // 'chrono' = manual chronograph — user starts/stops work and breaks with buttons.
  mode: 'myshift' | 'pay' | 'chrono'

  // Pay mode configuration.
  // payTargetMode: 'window' = fixed start/end hours (classic); 'duration' = fixed
  // total work minutes owed today — remaining shrinks as the user works.
  payTargetMode: 'window' | 'duration'
  payShiftStart: string // "HH:mm"
  payShiftEnd: string // "HH:mm"
  payDurationMin: number // toplam çalışılacak süre (duration mode), e.g. 60
  payShortBreakMin: number // kısa mola (çay/kahve/ihtiyaç) daily budget in minutes
  payMealBreakMin: number // yemek molası (kahvaltı/öğle/akşam) daily budget in minutes
  payWorkReminderMin: number // 0=kapalı — bu kadar dk aralıksız çalışınca mola hatırlatır (örn. 50)
  payBreakReminderMin: number // 0=kapalı — kısa mola bu kadar dk sürünce "molayı aştın" uyarısı (örn. 15)

  // Chrono mode — manual chronograph timers.
  chronoWorkReminderMin: number // 0=kapalı — bu kadar dk aralıksız çalışınca mola hatırlatır
  chronoBreakReminderMin: number // 0=kapalı — mola bu kadar dk sürünce "molayı aştın" uyarısı

  // Özel Widget — hava durumu
  widgetEnabled: boolean
  widgetType: 'weather'
  widgetCity: string       // açık şehir adı, ör. "Istanbul"
  widgetCountry: string    // ISO-3166-1 alpha-2, ör. "TR"
  widgetDistrict: string   // ilçe/il, ör. "Kadıköy" (opsiyonel)
  widgetLat: number | null
  widgetLon: number | null

  // Saat fontu
  clockFont: string

  // UI Language
  language: 'en' | 'tr'

  // Debug mode — shows test/tooling affordances (e.g. "Deneme Şablonu Üret" in the
  // shift editor). Hidden during normal use.
  debugMode: boolean
}

export interface DayLog {
  workedSeconds: number
  idleSeconds: number
  paybackSeconds: number
  breakSeconds: number // planned (in-budget) break time, never counted as work
  breakCount: number // how many breaks were started
  completed: boolean
  mode?: 'myshift' | 'pay' | 'chrono' // which mode was active for this day
  updatedAt?: number // last local change (ms) — cloud sync "newer wins" per day
  detail?: DayLogDetail // rich per-day snapshot kept for cloud/calendar review
}

// Extra per-day information captured at sync/close: what happened through the day
// (break sessions, aşım/payback sessions, confirmed moves) and how it was planned,
// so a day can be reviewed like a calendar entry in the cloud.
export interface DayLogDetail {
  templateId?: string
  templateName?: string
  breakLog: BreakLogEntry[]
  idleLog: TimeSpanLog[]
  paybackLog: TimeSpanLog[]
  confirmedActivities: string[]
}

// A finished pay-mode break — the detailed "Bugünün Özeti" log. `overBudget`
// marks breaks taken after the category budget was already spent (aşım).
export interface BreakLogEntry {
  id: number
  type: BreakType
  subtype: BreakSubtype
  startedAt: number // Date.now()
  endedAt: number // Date.now()
  durationSec: number
  overBudget: boolean
}

// A closed idle (aşım) or payback session — logged with exact wall-clock times so
// the daily summary can show "nerede / ne zaman aşım yapıldı".
export interface TimeSpanLog {
  startedAt: number
  endedAt: number
  durationSec: number
}

// Hour-by-hour today's log (keyed "HH:00"). idle/payback are computed against a
// base cursor recorded at the hour's first write, so they survive app restarts.
export interface HourLog {
  idleSeconds: number
  paybackSeconds: number
  cursorIdle: number
  cursorPayback: number
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

  // MyShift confirmation gate — work activities the user confirmed as finished.
  // A work activity (after the first of the day) only advances once confirmed;
  // until then every extra second counts as aşım. Breaks never need confirmation.
  confirmedActivities: string[] // activity ids confirmed today

  // MyShift "kaydırma" — per-day standing shift (seconds). Positive = schedule
  // shifted FORWARD (effective time runs that many seconds behind real time), so a
  // late start or a pause pushes the whole day forward while the template is untouched.
  // Effective time = real time + timeOffset(rewind) - dayShiftSecs - pausedElapsed.
  dayShiftSecs: number
  shiftDay: string // "YYYY-MM-DD" this shift belongs to (drives the daily auto-reset)
  myshiftPaused: boolean // day paused — effective time frozen (no aşım, no cuts)
  pauseWallAt: number | null // Date.now() when the pause began (live elapsed growth)

  // MyShift planned breaks — per-activity seconds consumed by the scheduled break
  // clock. Each "Mola mı?" window auto-consumes as the effective clock passes through
  // it (no manual toggle): following the plan marks a break as spent for the day.
  planUsedBy: Record<string, number>

  // Set by the engine once the day's schedule has run past its last activity WITHOUT
  // the user completing it ("aşım"). A later kaydırma on such a day must renew the
  // break ledger just like it does for a manually completed day.
  scheduleElapsedToday: boolean
  payShiftOffset: number // seconds offset applied to Pay mode's window start/end (manual shift in Pay mode)

  // Day's GROSS aşım log — keeps accruing, is never reduced by payback or by resetIdle,
  // and resets only at the day change. It exists purely to record how much aşım was
  // accrued today (the live net counter, by contrast, goes down while payback runs).
  idleLogMs: number

  // Payback (geri ödeme) — work sessions that pay back aşım time. Each second of an
  // active payback subtracts from the aşım counter; its own stopwatch stays independent.
  paybackAccumMs: number // accumulated payback ms (closed sessions)
  paybackStartTs: number | null // Date.now() while a payback session is running (null = not running)

  // Pay duration mode (settings.payTargetMode === 'duration') — live work
  // accumulator. Mirrors the idle stopwatch: work accrues while the user is NOT on
  // a break, and the "ödenen" work time shrinks the owed total.
  payWorkAccumMs: number
  payWorkStartTs: number | null
  payWorkDay: string
  payPaused: boolean

  // Chrono mode — manual chronograph state.
  // The user manually starts/stops work and break sessions via dashboard buttons.
  chronoMode: 'idle' | 'work' | 'break' // current chrono activity
  chronoStartedAt: number | null // Date.now() when the current chrono session started
  chronoWorkAccumMs: number // accumulated work ms (closed sessions)
  chronoBreakAccumMs: number // accumulated break ms (closed sessions)
  chronoDay: string // "YYYY-MM-DD" the counters belong to

  // Pay-mode breaks. `breakDay` is the date the usage/count belong to (drives the
  // daily auto-reset). `breakUsage` maps subtype -> minutes already used today.
  runningBreak: PayBreak | null
  breakDay: string
  breakUsage: Partial<Record<BreakSubtype, number>>
  breakCount: number
  // When the last break ended (Date.now()) — drives the pay-mode "X dakikadır mola
  // yapmadın" work-stretch reminder. null = no break taken yet today.
  lastBreakEndedAt: number | null

  // Pay-mode break reminders (shown as a global banner for ~60s, then auto-dismiss).
  reminder: { id: number; kind: 'work' | 'break'; message: string } | null

  // Detailed today's logs — the "Bugünün Özeti" tab.
  breakLog: BreakLogEntry[] // every finished pay-mode break with exact times
  idleLog: TimeSpanLog[] // closed aşım sessions (when idle started/ended)
  paybackLog: TimeSpanLog[] // closed payback sessions (when it ran)
  todayHourly: Record<string, HourLog> // per-hour idle/payback ("HH:00" -> stats)

  // Daily history — one snapshot record per date, kept for the History page
  dailyLogs: Record<string, DayLog>

  // Foreground app usage (tracked by the main process) — feeds the personalized
  // motivation lines on the Dashboard
  appUsage: AppUsageSnapshot
  
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
  confirmActivity: (activityId: string) => void
  setTimeOffset: (offset: number) => void
  setDayShift: (secs: number) => void
  pauseDay: () => void
  resumeDay: () => void
  shiftToActivity: (activityId: string, activities: Activity[]) => void
  setPayShiftOffset: (offset: number) => void
  syncPlanUsed: (usedBy: Record<string, number>) => void
  markScheduleElapsed: (elapsed: boolean) => void
  updateIdle: (isIdleNow: boolean) => void
  resetIdle: () => void
  startPayback: () => void
  stopPayback: () => void
  finishPayback: () => void
  updatePayWork: (isWorkingNow: boolean) => void
  togglePayPause: () => void
  resetToday: () => void
  startBreak: (type: BreakType, subtype: BreakSubtype, overBudget: boolean) => void
  stopBreak: () => void
  resetBreaks: () => void
  chronoStartWork: () => void
  chronoStartBreak: () => void
  chronoStop: () => void
  showReminder: (kind: 'work' | 'break', message: string) => void
  dismissReminder: () => void
  clearHistory: () => void
  setTodayHourly: (hourKey: string, entry: HourLog) => void
  updateDayLog: (dateStr: string, log: Partial<DayLog>) => void
  deleteDayLog: (dateStr: string) => void
  updateAppUsage: (snapshot: AppUsageSnapshot) => void
  // Cloud sync imports — the cloudSync module pushes/pulls through these so every
  // write still goes through the normal persist path (electron-store / localStorage).
  cloudImportMeta: (meta: { settings: Settings; templates: ShiftTemplate[]; completedShifts: string[] }) => Promise<void>
  cloudImportDay: (dateStr: string, log: DayLog) => void
  cloudImportDays: (days: Record<string, DayLog>) => void
  cloudReplaceDays: (days: Record<string, DayLog>) => Promise<void>
  factoryReset: () => Promise<void>
  flushState: () => void
}

const defaultSettings: Settings = {
  launchWithWindows: false,
  startMinimized: false,
  minimizeToTray: true,
  autoMinimizeToTray: false,
  defaultNotificationSound: 'default',
  birthday: '',
  theme: 'dark',
  commentProvider: 'offline',
  commentBaseUrl: 'http://127.0.0.1:11434',
  commentApiKey: '',
  commentModel: 'qwen2.5',
  mode: 'myshift',
  payTargetMode: 'window',
  payShiftStart: '07:00',
  payShiftEnd: '16:00',
  payDurationMin: 420,
  payShortBreakMin: 90,
  payMealBreakMin: 30,
  payWorkReminderMin: 50,
  payBreakReminderMin: 15,
  chronoWorkReminderMin: 50,
  chronoBreakReminderMin: 15,
  widgetEnabled: false,
  widgetType: 'weather' as const,
  widgetCity: '',
  widgetCountry: 'TR',
  widgetDistrict: '',
  widgetLat: null,
  widgetLon: null,
  clockFont: 'jetbrains',
  language: 'en',
  debugMode: false,
}

// Today's date as "YYYY-MM-DD" — used by the per-day guards of the shift state
function todayStr(d = new Date()): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
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
      paybackStartTs: s.paybackStartTs,
      payWorkAccumMs: s.payWorkAccumMs,
      payWorkStartTs: s.payWorkStartTs,
      payWorkDay: s.payWorkDay,
      payPaused: s.payPaused,
      chronoMode: s.chronoMode,
      chronoStartedAt: s.chronoStartedAt,
      chronoWorkAccumMs: s.chronoWorkAccumMs,
      chronoBreakAccumMs: s.chronoBreakAccumMs,
      chronoDay: s.chronoDay,
      dayShiftSecs: s.dayShiftSecs,
      shiftDay: s.shiftDay,
      myshiftPaused: s.myshiftPaused,
      pauseWallAt: s.pauseWallAt,
      planUsedBy: s.planUsedBy
    }
    const api = window.electronAPI
    if (api && api.store) {
      api.store.set('idleState', payload)
    } else {
      localStorage.setItem('idleState', JSON.stringify(payload))
    }
  }

  const persistBreak = () => {
    const s = get()
    const payload = {
      runningBreak: s.runningBreak,
      breakDay: s.breakDay,
      breakUsage: s.breakUsage,
      breakCount: s.breakCount,
      lastBreakEndedAt: s.lastBreakEndedAt
    }
    const api = window.electronAPI
    if (api && api.store) {
      api.store.set('breakState', payload)
    } else {
      localStorage.setItem('breakState', JSON.stringify(payload))
    }
  }

  const persistToday = () => {
    const s = get()
    const payload = {
      breakLog: s.breakLog,
      idleLog: s.idleLog,
      paybackLog: s.paybackLog,
      todayHourly: s.todayHourly,
      confirmedActivities: s.confirmedActivities
    }
    const api = window.electronAPI
    if (api && api.store) {
      api.store.set('todayDetail', payload)
    } else {
      localStorage.setItem('todayDetail', JSON.stringify(payload))
    }
  }

  return {
  templates: [],
  settings: defaultSettings,
  completedShifts: [],
  isLoading: true,
  timeOffset: 0,
  dayShiftSecs: 0,
  shiftDay: '',
  myshiftPaused: false,
  pauseWallAt: null,
  planUsedBy: {},
  payShiftOffset: 0,
  scheduleElapsedToday: false,
  confirmedActivities: [],
  idleAccumMs: 0,
  idleStartTs: null,
  idleDay: '',
  idleLogMs: 0,
  paybackAccumMs: 0,
  paybackStartTs: null,
  payWorkAccumMs: 0,
  payWorkStartTs: null,
  payWorkDay: '',
  payPaused: false,
  chronoMode: 'idle' as const,
  chronoStartedAt: null,
  chronoWorkAccumMs: 0,
  chronoBreakAccumMs: 0,
  chronoDay: '',
  runningBreak: null,
  breakDay: '',
  breakUsage: {},
  breakCount: 0,
  lastBreakEndedAt: null,
  reminder: null,
  breakLog: [],
  idleLog: [],
  paybackLog: [],
  todayHourly: {},
  dailyLogs: {},
  appUsage: { current: null, today: [], todayTotalSeconds: 0 },

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

        // Live foreground-app snapshot for the motivation lines
        let appUsage = { current: null as AppUsageSnapshot['current'], today: [] as AppUsageSnapshot['today'], todayTotalSeconds: 0 }
        if (api.appUsage) {
          try { appUsage = await api.appUsage.getSnapshot() } catch { /* non-fatal */ }
          if (!appUsageSubscribed) {
            appUsageSubscribed = true
            api.appUsage.onSnapshot((snap) => {
              useShiftStore.getState().updateAppUsage(snap)
            })
          }
        }

        const savedIdle = (await api.store.get('idleState', null)) as {
          idleAccumMs?: number
          idleLogMs?: number
          idleStartTs?: number | null
          paybackAccumMs?: number
          paybackStartTs?: number | null
          payWorkAccumMs?: number
          payWorkStartTs?: number | null
          payWorkDay?: string
          payPaused?: boolean
          idleDay?: string
          chronoMode?: 'idle' | 'work' | 'break'
          chronoStartedAt?: number | null
          chronoWorkAccumMs?: number
          chronoBreakAccumMs?: number
          chronoDay?: string
          dayShiftSecs?: number
          shiftDay?: string
          myshiftPaused?: boolean
          pauseWallAt?: number | null
          planUsedBy?: Record<string, number>
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

        const savedBreak = (await api.store.get('breakState', null)) as {
          runningBreak?: PayBreak | null
          breakDay?: string
          breakUsage?: Partial<Record<BreakSubtype, number>>
          breakCount?: number
          lastBreakEndedAt?: number | null
        } | null
        const breakSameDay = !!savedBreak && savedBreak.breakDay === todayStr

        const savedToday = (await api.store.get('todayDetail', null)) as {
          breakLog?: BreakLogEntry[]
          idleLog?: TimeSpanLog[]
          paybackLog?: TimeSpanLog[]
          todayHourly?: Record<string, HourLog>
          confirmedActivities?: string[]
        } | null

        set({ 
          templates: savedTemplates, 
          settings: { ...defaultSettings, ...savedSettings, launchWithWindows: isStartupEnabled },
          completedShifts: prunedCompleted,
          dailyLogs: prunedDayLogs,
          idleAccumMs: sameDay ? savedIdle.idleAccumMs ?? 0 : 0,
          // Never restore live idleStartTs — the engine re-detects idle state
          // on its own. Restoring it caused "Aşımda" flash on every startup.
          idleStartTs: null,
          idleDay: todayStr,
          idleLogMs: sameDay ? savedIdle.idleLogMs ?? 0 : 0,
          paybackAccumMs: sameDay ? savedIdle.paybackAccumMs ?? 0 : 0,
          paybackStartTs: sameDay ? savedIdle.paybackStartTs ?? null : null,
          payWorkAccumMs: sameDay ? savedIdle.payWorkAccumMs ?? 0 : 0,
          payWorkStartTs: sameDay ? savedIdle.payWorkStartTs ?? null : null,
          payWorkDay: todayStr,
          payPaused: sameDay ? savedIdle.payPaused ?? false : false,
          chronoMode: sameDay ? savedIdle.chronoMode ?? 'idle' : 'idle',
          chronoStartedAt: sameDay ? savedIdle.chronoStartedAt ?? null : null,
          chronoWorkAccumMs: sameDay ? savedIdle.chronoWorkAccumMs ?? 0 : 0,
          chronoBreakAccumMs: sameDay ? savedIdle.chronoBreakAccumMs ?? 0 : 0,
          chronoDay: todayStr,
          dayShiftSecs: sameDay ? savedIdle.dayShiftSecs ?? 0 : 0,
          shiftDay: todayStr,
          myshiftPaused: sameDay ? savedIdle.myshiftPaused ?? false : false,
          pauseWallAt: sameDay ? savedIdle.pauseWallAt ?? null : null,
          planUsedBy: sameDay ? savedIdle.planUsedBy ?? {} : {},
          runningBreak: breakSameDay ? savedBreak.runningBreak ?? null : null,
          breakDay: todayStr,
          breakUsage: breakSameDay ? savedBreak.breakUsage ?? {} : {},
          breakCount: breakSameDay ? savedBreak.breakCount ?? 0 : 0,
          lastBreakEndedAt: breakSameDay ? savedBreak.lastBreakEndedAt ?? null : null,
          reminder: null,
          breakLog: breakSameDay ? savedToday?.breakLog ?? [] : [],
          idleLog: sameDay ? savedToday?.idleLog ?? [] : [],
          paybackLog: sameDay ? savedToday?.paybackLog ?? [] : [],
          todayHourly: breakSameDay ? savedToday?.todayHourly ?? {} : {},
          confirmedActivities: sameDay ? savedToday?.confirmedActivities ?? [] : [],
          appUsage,
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
        const localBreak = localStorage.getItem('breakState')
        const breakParsed = localBreak ? JSON.parse(localBreak) : null
        const bBreakSameDay = !!breakParsed && breakParsed.breakDay === bToday
        const localToday = localStorage.getItem('todayDetail')
        const todayParsed = localToday ? JSON.parse(localToday) : null
        set({
          templates: localTemplates ? JSON.parse(localTemplates) : [],
          settings: localSettings ? JSON.parse(localSettings) : defaultSettings,
          completedShifts: localCompleted ? JSON.parse(localCompleted) : [],
          idleAccumMs: bSameDay ? idleParsed.idleAccumMs ?? 0 : 0,
          idleStartTs: bSameDay ? idleParsed.idleStartTs ?? null : null,
          idleDay: bToday,
          idleLogMs: bSameDay ? idleParsed.idleLogMs ?? 0 : 0,
          paybackAccumMs: bSameDay ? idleParsed.paybackAccumMs ?? 0 : 0,
          paybackStartTs: bSameDay ? idleParsed.paybackStartTs ?? null : null,
          payWorkAccumMs: bSameDay ? idleParsed.payWorkAccumMs ?? 0 : 0,
          payWorkStartTs: bSameDay ? idleParsed.payWorkStartTs ?? null : null,
          payWorkDay: bToday,
          payPaused: bSameDay ? idleParsed.payPaused ?? false : false,
          chronoMode: bSameDay ? idleParsed.chronoMode ?? 'idle' : 'idle',
          chronoStartedAt: bSameDay ? idleParsed.chronoStartedAt ?? null : null,
          chronoWorkAccumMs: bSameDay ? idleParsed.chronoWorkAccumMs ?? 0 : 0,
          chronoBreakAccumMs: bSameDay ? idleParsed.chronoBreakAccumMs ?? 0 : 0,
          chronoDay: bToday,
          dayShiftSecs: bSameDay ? idleParsed.dayShiftSecs ?? 0 : 0,
          shiftDay: bToday,
          myshiftPaused: bSameDay ? idleParsed.myshiftPaused ?? false : false,
          pauseWallAt: bSameDay ? idleParsed.pauseWallAt ?? null : null,
          planUsedBy: bSameDay ? idleParsed.planUsedBy ?? {} : {},
          runningBreak: bBreakSameDay ? breakParsed.runningBreak ?? null : null,
          breakDay: bToday,
          breakUsage: bBreakSameDay ? breakParsed.breakUsage ?? {} : {},
          breakCount: bBreakSameDay ? breakParsed.breakCount ?? 0 : 0,
          lastBreakEndedAt: bBreakSameDay ? breakParsed.lastBreakEndedAt ?? null : null,
          reminder: null,
          breakLog: bBreakSameDay ? todayParsed?.breakLog ?? [] : [],
          idleLog: bSameDay ? todayParsed?.idleLog ?? [] : [],
          paybackLog: bSameDay ? todayParsed?.paybackLog ?? [] : [],
          todayHourly: bBreakSameDay ? todayParsed?.todayHourly ?? {} : {},
          confirmedActivities: bSameDay ? todayParsed?.confirmedActivities ?? [] : [],
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
            notes: act.notes || '',
            isBreak: !!act.isBreak
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

    // 2026 Turkey Public Holidays (Ramazan/Kurban dates are approximate — update yearly)
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
    const newPaybackLog = paybackStartTs !== null
      ? [...get().paybackLog, { startedAt: paybackStartTs, endedAt: now, durationSec: Math.max(1, Math.round((now - paybackStartTs) / 1000)) }]
      : get().paybackLog

    set({ completedShifts: newCompleted, paybackAccumMs: newPaybackAccum, paybackStartTs: null, paybackLog: newPaybackLog })
    persistIdle()
    persistToday()
    get().updateDayLog(dateStr, { completed: true })

    const api = window.electronAPI
    if (api && api.store) {
      await api.store.set('completedShifts', newCompleted)
    } else {
      localStorage.setItem('completedShifts', JSON.stringify(newCompleted))
    }
  },

  uncompleteShift: async (dateStr) => {
    const s = get()
    const { completedShifts } = s
    const newCompleted = completedShifts.filter((d) => d !== dateStr)
    // Re-opening a finished day renews its break allowances — the planned ledger
    // starts fresh so the continued shift keeps the scheduled breaks usable.
    set({
      completedShifts: newCompleted,
      confirmedActivities: [],
      planUsedBy: {},
      scheduleElapsedToday: false
    })
    get().updateDayLog(dateStr, { completed: false })
    persistIdle()

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

// MyShift "kaydırma" — a standing shift (see dayShiftSecs). Passing 0 clears it.
  // When the day was already finished (completed OR its schedule ran out into aşım),
  // kaydırma re-opens the schedule — the break ledger starts fresh so breaks are
  // usable again instead of staying "tükendi" from the finished day.
  setDayShift: (secs) => {
    const s = get()
    const day = todayStr()
    // "Done" = the day is either manually completed OR its schedule already ran past
    // the last activity (aşım) without completion. Either way a kaydırma means the
    // user keeps the day going — the break ledger starts fresh so breaks stay usable.
    const done = s.completedShifts.includes(day) || (s.dailyLogs[day]?.completed ?? false) || s.scheduleElapsedToday
    if (secs > 0 && done) {
      // A kaydırma re-opens the finished day: the planned break ledger starts FRESH
      // (never "tükendi" from the finished day).
      set({
        planUsedBy: {},
        scheduleElapsedToday: false
      })
      const newCompleted = s.completedShifts.filter(d => d !== day)
      set({ completedShifts: newCompleted })
      const api = window.electronAPI
      if (api && api.store) {
        api.store.set('completedShifts', newCompleted)
      } else {
        localStorage.setItem('completedShifts', JSON.stringify(newCompleted))
      }
      get().updateDayLog(day, { completed: false })
    }
    set({ dayShiftSecs: Math.max(0, Math.round(secs)), shiftDay: day, myshiftPaused: false, pauseWallAt: null })
    persistIdle()
  },

  // Pausing freezes effective time where it stands (no aşım, no cuts into breaks).
  // The paused elapsed time is folded back into the standing shift on resume.
  pauseDay: () => {
    const s = get()
    if (s.myshiftPaused) return
    const day = todayStr()
    set({
      myshiftPaused: true,
      pauseWallAt: Date.now(),
      shiftDay: day,
      dayShiftSecs: s.shiftDay === day ? s.dayShiftSecs : 0
    })
    persistIdle()
  },

  resumeDay: () => {
    const s = get()
    const day = todayStr()
    if (!s.myshiftPaused) {
      set({ myshiftPaused: false, pauseWallAt: null, shiftDay: day })
      persistIdle()
      return
    }
    const base = s.shiftDay === day ? s.dayShiftSecs : 0
    const elapsed = s.pauseWallAt !== null ? Math.max(0, (Date.now() - s.pauseWallAt) / 1000) : 0
    set({ myshiftPaused: false, pauseWallAt: null, shiftDay: day, dayShiftSecs: base + elapsed })
    persistIdle()
  },

  // MyShift manual "⇄" jump — shift the day so the selected activity becomes the
  // currently running one. The standing shift is recomputed so effective time
  // lands exactly at the activity's start; any breaks whose windows we jumped past
  // get consumed by the engine's plan-ledger sync right after (their windows now
  // lie behind us).
  shiftToActivity: (activityId, activities) => {
    const s = get()
    const targetAct = (activities ?? []).find((a) => a.id === activityId)
    if (!targetAct) return
    const [h, m] = targetAct.startTime.split(':').map(Number)
    const targetSecs = h * 3600 + m * 60
    const now = new Date()
    const realSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
    const pauseSecs = s.myshiftPaused && s.pauseWallAt !== null ? (now.getTime() - s.pauseWallAt) / 1000 : 0
    const day = todayStr()
    const newDayShift = Math.max(0, realSecs + s.timeOffset - pauseSecs - targetSecs)
    set({
      dayShiftSecs: newDayShift,
      shiftDay: s.shiftDay === day ? s.shiftDay : day,
      myshiftPaused: false,
      pauseWallAt: null,
      scheduleElapsedToday: false
    })
    persistIdle()
  },

  syncPlanUsed: (usedBy) => {
    const s = get()
    const keys = Object.keys(usedBy)
    // When no breaks have been touched by the plan clock (map empty), clear any
    // leftover consumption from a previous session/day so a fresh shift never
    // shows stale "tükendi" breaks.
    if (keys.length === 0) {
      if (Object.keys(s.planUsedBy).length > 0) {
        set({ planUsedBy: {} })
        persistIdle()
      }
      return
    }
    const merged = { ...s.planUsedBy }
    let changed = false
    for (const [k, v] of Object.entries(usedBy)) {
      const cur = merged[k] ?? 0
      const next = Math.max(cur, Math.round(Math.max(0, v)))
      if (next !== cur) {
        merged[k] = next
        changed = true
      }
    }
    if (!changed) return
    set({ planUsedBy: merged })
    persistIdle()
  },

  // Written by the engine: once today's schedule ran past its last activity without
  // completion ("aşım"), a later kaydırma renews the break ledger just like a manual
  // completion does. Transient per-day flag — recomputed live every engine render,
  // so it always reflects the CURRENT day and self-corrects at midnight.
  markScheduleElapsed: (elapsed) => {
    if (get().scheduleElapsedToday === elapsed) return
    set({ scheduleElapsedToday: elapsed })
  },

  confirmActivity: (activityId) => {
    const { confirmedActivities } = get()
    if (confirmedActivities.includes(activityId)) return
    set({ confirmedActivities: [...confirmedActivities, activityId] })
    persistToday()
  },

  setPayShiftOffset: (offset: number) => {
    set({ payShiftOffset: offset })
    persistIdle()
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
        paybackStartTs: null,
        idleLog: [],
        paybackLog: [],
        breakLog: [],
        todayHourly: {},
        confirmedActivities: []
      })
      persistIdle()
      persistToday()
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
      const newIdleLog = [...get().idleLog, { startedAt: idleStartTs, endedAt: now, durationSec: Math.max(1, Math.round(delta / 1000)) }]
      set({ idleAccumMs: idleAccumMs + delta, idleLogMs: idleLogMs + delta, idleStartTs: null, idleLog: newIdleLog })
      persistIdle()
      persistToday()
    }
  },

  resetIdle: () => {
    set({ idleAccumMs: 0, idleStartTs: null })
    persistIdle()
  },

  // Duration mode: live "worked so far" stopwatch. Works whenever the user is NOT
  // on a break (and not finished) — the remaining target shrinks as they work.
  updatePayWork: (isWorkingNow) => {
    const now = Date.now()
    const d = new Date()
    const day = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
    const { payWorkAccumMs, payWorkStartTs, payWorkDay } = get()

    // New day — fresh accumulator (never count the gap since yesterday)
    if (payWorkDay !== day) {
      set({ payWorkAccumMs: 0, payWorkStartTs: isWorkingNow ? now : null, payWorkDay: day })
      persistIdle()
      return
    }

    if (isWorkingNow && payWorkStartTs === null) {
      set({ payWorkStartTs: now })
      persistIdle()
    } else if (!isWorkingNow && payWorkStartTs !== null) {
      const delta = Math.max(0, now - payWorkStartTs)
      set({ payWorkAccumMs: payWorkAccumMs + delta, payWorkStartTs: null })
      persistIdle()
    }
  },

  togglePayPause: () => {
    const { payPaused, payWorkAccumMs, payWorkStartTs, payWorkDay } = get()
    const now = Date.now()
    const d = new Date()
    const day = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`

    if (!payPaused) {
      // Pausing: close any active work session
      let accum = payWorkAccumMs
      if (payWorkStartTs !== null) {
        accum += Math.max(0, now - payWorkStartTs)
      }
      set({ payPaused: true, payWorkAccumMs: accum, payWorkStartTs: null, payWorkDay: day })
    } else {
      // Resuming: start a new work session if within same day
      const startTs = payWorkDay === day ? now : now
      set({ payPaused: false, payWorkStartTs: startTs, payWorkDay: day })
    }
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
    let newIdleLogList = get().idleLog
    if (idleStartTs !== null) {
      const delta = Math.max(0, now - idleStartTs)
      newIdleAccum += delta
      newIdleLog += delta
      newIdleStart = null
      newIdleLogList = [...newIdleLogList, { startedAt: idleStartTs, endedAt: now, durationSec: Math.max(1, Math.round(delta / 1000)) }]
    }

    set({ idleAccumMs: newIdleAccum, idleLogMs: newIdleLog, idleStartTs: newIdleStart, paybackStartTs: now, idleLog: newIdleLogList })
    persistIdle()
    persistToday()
  },

  stopPayback: () => {
    const now = Date.now()
    const { paybackAccumMs, paybackStartTs } = get()
    if (paybackStartTs === null) return
    const delta = Math.max(0, now - paybackStartTs)
    const newPaybackLog = [...get().paybackLog, { startedAt: paybackStartTs, endedAt: now, durationSec: Math.max(1, Math.round(delta / 1000)) }]
    set({ paybackAccumMs: paybackAccumMs + delta, paybackStartTs: null, paybackLog: newPaybackLog })
    persistIdle()
    persistToday()
  },

  finishPayback: () => {
    const now = Date.now()
    const { paybackAccumMs, paybackStartTs } = get()
    const newAccum = paybackAccumMs + (paybackStartTs !== null ? Math.max(0, now - paybackStartTs) : 0)
    const newPaybackLog = paybackStartTs !== null
      ? [...get().paybackLog, { startedAt: paybackStartTs, endedAt: now, durationSec: Math.max(1, Math.round((now - paybackStartTs) / 1000)) }]
      : get().paybackLog
    set({ paybackAccumMs: newAccum, paybackStartTs: null, paybackLog: newPaybackLog })
    persistIdle()
    persistToday()

    // Finishing the payback completes today's shift
    const d = new Date()
    const day = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
    get().completeShift(day)
  },

  startBreak: (type, subtype, overBudget) => {
    const now = Date.now()
    const { runningBreak, breakDay, breakUsage, breakCount, lastBreakEndedAt, breakLog } = get()
    if (runningBreak) return // already on a break

    const d = new Date()
    const day = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
    const sameDay = breakDay === day

    set({
      runningBreak: { type, subtype, startedAt: now, overBudget },
      breakDay: day,
      breakUsage: sameDay ? breakUsage : {},
      breakCount: sameDay ? breakCount : 0,
      lastBreakEndedAt: sameDay ? lastBreakEndedAt : null,
      breakLog: sameDay ? breakLog : []
    })
    persistBreak()
    if (!sameDay) persistToday()
  },

  stopBreak: () => {
    const now = Date.now()
    const { runningBreak, breakDay, breakUsage, breakCount } = get()
    if (!runningBreak) return

    const d = new Date()
    const day = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`

    // Break carried over midnight — drop it (does not belong to either day)
    if (breakDay !== day) {
      set({ runningBreak: null, breakDay: day, breakUsage: {}, breakCount: 0, lastBreakEndedAt: null, breakLog: [] })
      persistBreak()
      persistToday()
      return
    }

    const minutes = Math.max(0, Math.round((now - runningBreak.startedAt) / 60000))
    const newUsage = { ...breakUsage }
    const newCount = breakCount + 1

    // Over-budget breaks never consume the daily budget (they count as aşım instead)
    if (!runningBreak.overBudget && minutes > 0) {
      newUsage[runningBreak.subtype] = (newUsage[runningBreak.subtype] ?? 0) + minutes
    }

    const breakSeconds = Object.values(newUsage).reduce((a, b) => a + (b ?? 0), 0) * 60
    const newBreakLog = [...get().breakLog, {
      id: Date.now(),
      type: runningBreak.type,
      subtype: runningBreak.subtype,
      startedAt: runningBreak.startedAt,
      endedAt: now,
      durationSec: Math.max(0, Math.round((now - runningBreak.startedAt) / 1000)),
      overBudget: runningBreak.overBudget
    }]
    set({ runningBreak: null, breakUsage: newUsage, breakCount: newCount, lastBreakEndedAt: now, breakLog: newBreakLog })
    persistBreak()
    persistToday()

    // Merge break time into today's DayLog so short breaks are never lost on close
    get().updateDayLog(day, { breakSeconds, breakCount: newCount })
  },

  resetBreaks: () => {
    set({ breakUsage: {}, breakCount: 0, breakLog: [], lastBreakEndedAt: null })
    persistBreak()
    persistToday()
  },

  // Full "today" reset — wipes today's live counters, logs and break budgets, and
  // un-completes the day so a fresh shift can start. Past days are untouched.
  resetToday: () => {
    const d = new Date()
    const day = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
    set({
      idleAccumMs: 0,
      idleStartTs: null,
      idleDay: day,
      idleLogMs: 0,
      paybackAccumMs: 0,
      paybackStartTs: null,
      payWorkAccumMs: 0,
      payWorkStartTs: null,
      payWorkDay: day,
      payPaused: false,
      idleLog: [],
      paybackLog: [],
      breakLog: [],
      todayHourly: {},
      breakUsage: {},
      breakCount: 0,
      runningBreak: null,
      breakDay: day,
      lastBreakEndedAt: null,
      confirmedActivities: [],
      reminder: null,
      chronoMode: 'idle',
      chronoStartedAt: null,
      chronoWorkAccumMs: 0,
      chronoBreakAccumMs: 0,
      dayShiftSecs: 0,
      shiftDay: day,
      myshiftPaused: false,
      pauseWallAt: null,
      planUsedBy: {},
    })
    persistIdle()
    persistBreak()
    persistToday()

    // Start today's DayLog fresh. Do NOT un-complete the day — clearing today's
    // counters should not re-open the shift and trigger aşım.
    const freshLog: DayLog = { workedSeconds: 0, idleSeconds: 0, paybackSeconds: 0, breakSeconds: 0, breakCount: 0, completed: false, updatedAt: Date.now() }
    const newLogs = { ...get().dailyLogs, [day]: freshLog }
    set({ dailyLogs: newLogs })
    const api = window.electronAPI
    if (api?.store) api.store.set('dailyLogs', newLogs)
    else localStorage.setItem('dailyLogs', JSON.stringify(newLogs))
  },

  showReminder: (kind, message) => {
    set({ reminder: { id: Date.now(), kind, message } })
  },

  dismissReminder: () => {
    set({ reminder: null })
  },

  setTodayHourly: (hourKey, entry) => {
    const { todayHourly } = get()
    set({ todayHourly: { ...todayHourly, [hourKey]: entry } })
    persistToday()
  },

  clearHistory: () => {
    const d = new Date()
    const today = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
    const { dailyLogs, completedShifts } = get()
    const newLogs: Record<string, DayLog> = {}
    // Keep today's log AND today's completed status — only wipe the past.
    const todayLog = dailyLogs[today]
    if (todayLog) newLogs[today] = todayLog
    const newCompleted = completedShifts.filter(d => d === today)

    set({ dailyLogs: newLogs, completedShifts: newCompleted })

    const api = window.electronAPI
    if (api && api.store) {
      api.store.set('dailyLogs', newLogs)
      api.store.set('completedShifts', newCompleted)
    } else {
      localStorage.setItem('dailyLogs', JSON.stringify(newLogs))
      localStorage.setItem('completedShifts', JSON.stringify(newCompleted))
    }
  },

  updateDayLog: (dateStr, log) => {
    const { dailyLogs } = get()
    const current = dailyLogs[dateStr] || { workedSeconds: 0, idleSeconds: 0, paybackSeconds: 0, breakSeconds: 0, breakCount: 0, completed: false }
    const updated = { ...current, ...log, updatedAt: Date.now() }
    const newLogs = { ...dailyLogs, [dateStr]: updated }
    set({ dailyLogs: newLogs })

    const api = window.electronAPI
    if (api && api.store) {
      api.store.set('dailyLogs', newLogs)
    } else {
      localStorage.setItem('dailyLogs', JSON.stringify(newLogs))
    }
  },

  deleteDayLog: (dateStr) => {
    const { dailyLogs } = get()
    if (!dailyLogs[dateStr]) return
    const newLogs = { ...dailyLogs }
    delete newLogs[dateStr]
    set({ dailyLogs: newLogs })

    const api = window.electronAPI
    if (api && api.store) {
      api.store.set('dailyLogs', newLogs)
    } else {
      localStorage.setItem('dailyLogs', JSON.stringify(newLogs))
    }
  },

  updateAppUsage: (snapshot) => {
    set({ appUsage: snapshot })
  },

  cloudImportMeta: async (meta) => {
    set({ settings: meta.settings, templates: meta.templates, completedShifts: meta.completedShifts })
    const api = window.electronAPI
    if (api?.store) {
      await api.store.set('settings', meta.settings)
      await api.store.set('templates', meta.templates)
      await api.store.set('completedShifts', meta.completedShifts)
    } else {
      localStorage.setItem('settings', JSON.stringify(meta.settings))
      localStorage.setItem('templates', JSON.stringify(meta.templates))
      localStorage.setItem('completedShifts', JSON.stringify(meta.completedShifts))
    }
  },

  cloudImportDay: (dateStr, log) => {
    const { dailyLogs } = get()
    const updated = { ...(dailyLogs[dateStr] ?? {}), ...log, updatedAt: log.updatedAt ?? Date.now() }
    const newLogs = { ...dailyLogs, [dateStr]: updated }
    set({ dailyLogs: newLogs })
    const api = window.electronAPI
    if (api?.store) {
      api.store.set('dailyLogs', newLogs)
    } else {
      localStorage.setItem('dailyLogs', JSON.stringify(newLogs))
    }
  },

  cloudImportDays: (days) => {
    const { dailyLogs } = get()
    const newLogs = { ...dailyLogs }
    for (const [date, log] of Object.entries(days)) {
      newLogs[date] = { ...(newLogs[date] ?? {}), ...log, updatedAt: log.updatedAt ?? Date.now() }
    }
    set({ dailyLogs: newLogs })
    const api = window.electronAPI
    if (api?.store) {
      api.store.set('dailyLogs', newLogs)
    } else {
      localStorage.setItem('dailyLogs', JSON.stringify(newLogs))
    }
  },

  cloudReplaceDays: async (days) => {
    set({ dailyLogs: days })
    const api = window.electronAPI
    if (api?.store) {
      await api.store.set('dailyLogs', days)
    } else {
      localStorage.setItem('dailyLogs', JSON.stringify(days))
    }
  },

  factoryReset: async () => {
    // Sign out of Firebase FIRST so the cleared (empty) local state is never
    // pushed to the cloud and the cloud copy isn't pulled back on next launch.
    try {
      const { signOutUser, isFirebaseEnabled } = await import('../firebase/firebase')
      if (isFirebaseEnabled) await signOutUser()
    } catch { /* reset must proceed even if cloud fails */ }
    const api = window.electronAPI
    if (api?.data?.clearAll) {
      await api.data.clearAll()
    } else {
      localStorage.clear()
    }
    // Reload the entire app so every component starts fresh
    window.location.reload()
  },

  // Called on before-quit to flush all live timers to disk
  flushState: () => {
    persistIdle()
    persistBreak()
    persistToday()
  },

  chronoStartWork: () => {
    const s = get()
    const now = new Date()
    const day = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`

    // If we were on a break, close it first
    let extraBreakAccum = s.chronoBreakAccumMs
    if (s.chronoMode === 'break' && s.chronoStartedAt) {
      extraBreakAccum += Date.now() - s.chronoStartedAt
    }

    set({
      chronoMode: 'work',
      chronoStartedAt: Date.now(),
      chronoBreakAccumMs: extraBreakAccum,
      chronoDay: day,
      lastBreakEndedAt: s.chronoMode === 'break' ? Date.now() : s.lastBreakEndedAt,
    })
    persistIdle()
  },

  chronoStartBreak: () => {
    const s = get()
    const now = new Date()
    const day = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`

    // Close current work session
    let extraWorkAccum = s.chronoWorkAccumMs
    if (s.chronoMode === 'work' && s.chronoStartedAt) {
      extraWorkAccum += Date.now() - s.chronoStartedAt
    }

    set({
      chronoMode: 'break',
      chronoStartedAt: Date.now(),
      chronoWorkAccumMs: extraWorkAccum,
      chronoDay: day,
    })
    persistIdle()
  },

  chronoStop: () => {
    const s = get()
    let extraWorkAccum = s.chronoWorkAccumMs
    let extraBreakAccum = s.chronoBreakAccumMs

    if (s.chronoStartedAt) {
      const elapsed = Date.now() - s.chronoStartedAt
      if (s.chronoMode === 'work') {
        extraWorkAccum += elapsed
      } else if (s.chronoMode === 'break') {
        extraBreakAccum += elapsed
      }
    }

    set({
      chronoMode: 'idle',
      chronoStartedAt: null,
      chronoWorkAccumMs: extraWorkAccum,
      chronoBreakAccumMs: extraBreakAccum,
    })
    persistIdle()
  }
  }
})

// When the main process finishes a full data import, reload everything so the
// renderer reflects the freshly restored templates, settings, logs, etc.
if (typeof window !== 'undefined') {
  const api = window.electronAPI
  api?.data?.onImported?.(() => {
    useShiftStore.getState().loadFromStore()
  })
  // Flush all live timers when the app is about to quit
  api?.onFlushState?.(() => {
    useShiftStore.getState().flushState()
  })
}
