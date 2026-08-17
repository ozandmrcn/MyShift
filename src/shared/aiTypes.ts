// Shared types for the AI comment engine — used by main, preload and renderer.

export interface AiCommentRequest {
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
  // Keyboard activity (from observation mode): the most recent typed snippet and
  // total characters typed today. The AI should ground its comment in this rather
  // than the raw app name. Empty while observation is off.
  typedText?: string | null
  typedCharsToday?: number
  // Recent typed content history — a chronological list of typed snippets from the
  // last ~10 surveillance samples. Gives the AI a window into the user's writing
  // patterns and topics over time, not just the last flush.
  typedHistory?: string[]
  // The "what the AI knows about the user" profile notes (from surveillance
  // analysis + manual additions). Only sent to a remote provider if one is
  // enabled; never stored off-device otherwise.
  profileNotes?: string[]
}

export interface AiCommentResult {
  text: string
  highlight: string | null
}
