export interface IElectronAPI {
  store: {
    get: (key: string, defaultValue?: any) => Promise<any>
    set: (key: string, value: any) => Promise<boolean>
    delete: (key: string) => Promise<boolean>
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }
  notification: {
    show: (title: string, body: string, silent?: boolean) => void
  }
  tray: {
    updateInfo: (text: string) => void
    onAction: (callback: (action: string) => void) => () => void
  }
  startup: {
    set: (enabled: boolean) => Promise<boolean>
    get: () => Promise<boolean>
  }
  appUsage: {
    getSnapshot: () => Promise<AppUsageSnapshot>
    onSnapshot: (callback: (snapshot: AppUsageSnapshot) => void) => () => void
  }
  ai: {
    generateComment: (req: AiCommentRequest) => Promise<AiCommentResult | null>
    test: () => Promise<AiTestResult>
    getOpenRouterModels: () => Promise<OpenRouterModelInfo[]>
  }
  surveillance: {
    getStatus: () => Promise<SurveillanceSnapshot>
    setEnabled: (enabled: boolean) => Promise<boolean>
    analyze: (days?: number) => Promise<AiProfile>
  }
  profile: {
    get: () => Promise<AiProfile>
    addNote: (text: string) => Promise<AiProfile>
    removeNote: (index: number) => Promise<AiProfile>
    clear: () => Promise<AiProfile>
  }
  data: {
    export: () => Promise<{ ok: boolean; file?: string; error?: string }>
    import: () => Promise<{ ok: boolean; notes?: number; files?: number; storeKeys?: number; error?: string }>
    clearSurveillance: () => Promise<{ ok: boolean; error?: string }>
    clearAll: () => Promise<{ ok: boolean; error?: string }>
    onImported?: (callback: () => void) => () => void
  }
  onFlushState: (callback: () => void) => () => void
}

declare global {
  interface AppUsageSnapshot {
    current: { name: string; title: string | null; seconds: number } | null
    today: { name: string; seconds: number }[]
    todayTotalSeconds: number
  }

  interface AiCommentRequest {
    state: string
    activityName?: string
    activityIcon?: string
    nextLabel?: string
    isLastActivity: boolean
    shiftProgress: number
    shiftName?: string
    idleSeconds: number
    workedSeconds: number
    breakSeconds: number
    hour: number
    currentApp?: string | null
    currentAppTitle?: string | null
    currentAppSeconds?: number
    topApps?: { name: string; seconds: number }[]
    recentLines?: string[]
    typedText?: string | null
    typedCharsToday?: number
    typedHistory?: string[]
    profileNotes?: string[]
  }

  interface AiCommentResult {
    text: string
    highlight: string | null
  }

  interface AiTestResult {
    ok: boolean
    detail: string
    elapsedMs: number
  }

  interface OpenRouterModelInfo {
    id: string
    name: string
    context_length: number
  }

  interface AiNote {
    text: string
    addedAt: string
  }

  interface AiProfile {
    notes: AiNote[]
    updatedAt: string
  }

  interface SurveillanceSnapshot {
    enabled: boolean
    startedAt: number | null
    current: { app: string; title: string | null; t: number; typed?: string } | null
    recent: { t: number; app: string; title: string | null; typed?: string }[]
    today: {
      totalSeconds: number
      appSeconds: { name: string; seconds: number }[]
      samples: number
      typedFlushes: number
      typedChars: number
    }
    recentDays: { date: string; totalSeconds: number; samples: number }[]
  }

  interface Window {
    electronAPI?: IElectronAPI
  }
}
