// ─── MyShift Comment Engine (orchestrator) ───────────────────────────────────
// Decides who writes the one-liner under the clock:
//  - If the user enabled an LLM provider (Ollama / OpenAI-compatible) and it is
//    reachable, the AI writes a fresh, behavior-aware line with its own chosen
//    highlight word.
//  - Otherwise (default / unreachable / slow) it falls back to the offline
//    combinatorial engine, which is equally non-repeating.
// Every path returns the same shape { text, color, highlight }.

import { useShiftStore } from '../stores/useShiftStore'
import {
  generateMotivationLine,
  generateAmbientLine,
  MotivationContext,
  MotivationLine,
  COLD_COLORS,
  getMoodColor,
  TFunction
} from './motivationEngine'

function stripEmoji(t: string): string {
  return t
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F2FF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve(null) }
    }, ms)
    p.then((v) => {
      if (!done) { done = true; clearTimeout(timer); resolve(v) }
    }).catch(() => {
      if (!done) { done = true; resolve(null) }
    })
  })
}

function randomColdColor(): string {
  return COLD_COLORS[Math.floor(Math.random() * COLD_COLORS.length)]
}

export interface CommentOptions {
  ambient?: boolean
  lastText?: string
  recent?: string[]
}

export async function generateComment(t: TFunction, ctx: MotivationContext, opts: CommentOptions = {}): Promise<MotivationLine> {
  const recent = opts.recent ?? []
  const api = window.electronAPI
  const settings = useShiftStore.getState().settings

  if (api?.ai && settings.commentProvider !== 'offline') {
    try {
      const req: AiCommentRequest = {
        state: ctx.state,
        activityName: ctx.activityName,
        activityIcon: ctx.activityIcon,
        nextLabel: ctx.nextLabel,
        isLastActivity: ctx.isLastActivity,
        shiftProgress: ctx.shiftProgress,
        shiftName: ctx.shiftName,
        idleSeconds: ctx.idleSeconds,
        workedSeconds: ctx.workedSeconds,
        breakSeconds: ctx.breakSeconds,
        hour: ctx.hour,
        currentApp: ctx.currentApp ?? null,
        currentAppTitle: ctx.currentAppTitle ?? null,
        currentAppSeconds: ctx.currentAppSeconds,
        topApps: ctx.topApps ?? [],
        recentLines: recent.slice(-10)
      }
      const result = await withTimeout(api.ai.generateComment(req), 14000)
      if (result && typeof result.text === 'string') {
        const text = stripEmoji(result.text)
        if (text && text !== opts.lastText && !recent.includes(text)) {
          const highlight = result.highlight && text.includes(result.highlight) ? result.highlight : null
          // Mood-based muted color (no blues); ambient lines get a muted random tone.
          const color = opts.ambient ? randomColdColor() : getMoodColor(ctx.state)
          return { text, color, highlight }
        }
      }
    } catch {
      // AI unreachable / broken → offline engine below.
    }
  }

  return opts.ambient
    ? generateAmbientLine(t, ctx, opts.lastText, recent)
    : generateMotivationLine(t, ctx, opts.lastText, recent)
}
