// ─── MyShift Comment Engine (offline) ────────────────────────────────────────
// The built-in generative engine that powers the one-liner under the clock.
// It never repeats: lines are composed combinatorially from openers + observations
// + closers (and the "used" set), so a single session produces a stream of fresh
// cold, dark, sarcastic lines. When the user enables an LLM provider,
// this engine acts as the always-available fallback.
//
// Colors are deliberately cold (slate / indigo / sky / cyan / blue / violet);
// occasionally one word in the line is marked for a contrasting cold highlight —
// the offline engine decides it, the AI decides it when an LLM is configured.

export type MotivationState = 'no-shift' | 'before' | 'active' | 'gap' | 'payback' | 'overtime' | 'finished'

export interface MotivationContext {
  state: MotivationState
  activityName?: string
  activityIcon?: string
  nextLabel?: string // "icon name" of the upcoming activity (empty if none)
  isLastActivity: boolean
  shiftProgress: number // 0-100
  shiftName?: string
  idleSeconds: number // net aşım (or overtime) in seconds
  workedSeconds: number
  breakSeconds: number // seconds spent in the current break / aşım session
  hour: number
  currentApp?: string | null
  currentAppTitle?: string | null
  currentAppSeconds?: number
  topApps?: { name: string; seconds: number }[]
}

export interface MotivationLine {
  text: string
  color: string
  highlight: string | null // a substring of `text` rendered in a contrasting cold color
}

import tr from '../i18n/tr'
import en from '../i18n/en'

export type Lang = 'tr' | 'en'
export type TFunction = (key: string, vars?: Record<string, string | number>) => string

export const locales = { tr, en } as const

const APP_NAMES_COMMON: Record<string, string> = {
  chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', opera: 'Opera', brave: 'Brave', vivaldi: 'Vivaldi',
  code: 'VS Code', cursor: 'Cursor', notepad: 'Notepad', winword: 'Word', word: 'Word',
  excel: 'Excel', powerpoint: 'PowerPoint', outlook: 'Outlook', teams: 'Teams', slack: 'Slack',
  discord: 'Discord', spotify: 'Spotify', youtube: 'YouTube', twitch: 'Twitch', steam: 'Steam',
  'epicgameslauncher': 'Epic Games', telegram: 'Telegram', whatsapp: 'WhatsApp',
  figma: 'Figma', photoshop: 'Photoshop', illustrator: 'Illustrator',
  'notepad++': 'Notepad++', paint: 'Paint',
  powershell: 'PowerShell', 'windows-terminal': 'Windows Terminal',
}

const APP_NAMES_LOCALIZED: Record<Lang, Record<string, string>> = {
  tr: { explorer: 'Dosya Gezgini', calculator: 'Hesap Makinesi', taskmgr: 'Görev Yöneticisi', cmd: 'Komut İstemi', lockapp: 'Kilit Ekranı' },
  en: { explorer: 'File Explorer', calculator: 'Calculator', taskmgr: 'Task Manager', cmd: 'Command Prompt', lockapp: 'Lock Screen' },
}

const STOP_WORDS: Record<Lang, string[]> = {
  tr: ['undefined', 'vardiya', 'zaman', 'sıradaki', 'bugünkü', 'biliyorsun'],
  en: ['undefined', 'shift', 'time', 'next', 'today', 'you'],
}

export function friendlyAppName(raw: string, lang: Lang = 'tr'): string {
  const lower = raw.toLowerCase().trim()
  if (APP_NAMES_COMMON[lower]) return APP_NAMES_COMMON[lower]
  if (APP_NAMES_LOCALIZED[lang][lower]) return APP_NAMES_LOCALIZED[lang][lower]
  const cleaned = lower.replace(/[^a-z0-9]/gi, ' ')
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function fmtDur(t: TFunction, totalSec: number): string {
  if (totalSec <= 0) return `0 ${t('times.minutes')}`
  const mins = Math.round(totalSec / 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const hLabel = t('times.hours')
  const mLabel = t('times.minutes')
  if (h === 0) return `${m} ${mLabel}`
  if (m === 0) return `${h} ${hLabel}`
  return `${h} ${hLabel} ${m} ${mLabel}`
}

function pickFrom<T>(pool: T[], avoid: Set<string>, key?: (x: T) => string): T {
  const candidates = pool.filter(item => !avoid.has(key ? key(item) : String(item)))
  const arr = candidates.length ? candidates : pool
  return arr[Math.floor(Math.random() * arr.length)]
}

type Vars = Record<string, string>

function fill(text: string, v: Vars): string {
  return text
    .replace(/\{(\w+)\}/g, (_m, key) => v[key] ?? '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim()
}

function buildVars(t: TFunction, ctx: MotivationContext): Vars {
  const act = ctx.activityName ? `${ctx.activityIcon ?? ''} ${ctx.activityName}`.trim() : ''
  return {
    act: act || t('motivation.engine.noshift.obs3').split(' ')[0] || 'activity',
    icon: ctx.activityIcon ?? '',
    next: ctx.nextLabel || '',
    shift: ctx.shiftName || '',
    pct: `${Math.round(ctx.shiftProgress)}`,
    worked: fmtDur(t, ctx.workedSeconds),
    break: fmtDur(t, ctx.breakSeconds),
    idle: fmtDur(t, ctx.idleSeconds),
    hour: `${ctx.hour}`
  }
}

// ─── Muted, warm-neutral palette ─────────────────────────────────────────────
// No blues (no blue/sky/cyan/indigo). Colors follow the user's mood/state:
//   neutral  → slate          (no shift / finished)
//   waiting  → amber          (before the shift starts)
//   in-flow  → emerald        (actively working)
//   break    → orange         (gap / mola)
//   payback  → rose           (overdue / aşım telafisi)
//   overtime → violet         (overrun / tired & grumpy)
// Every tone is a soft -300 pastel so it stays "kapalı" against the dark UI.

const STATE_COLORS: Record<MotivationState, string> = {
  'no-shift': 'text-slate-400',
  before: 'text-amber-300',
  active: 'text-emerald-300',
  gap: 'text-orange-300',
  payback: 'text-rose-300',
  overtime: 'text-violet-300',
  finished: 'text-slate-400'
}

export function getMoodColor(state: MotivationState): string {
  return STATE_COLORS[state] ?? 'text-slate-400'
}

const AMBIENT_COLORS = ['text-slate-400', 'text-stone-400', 'text-amber-300', 'text-orange-300', 'text-emerald-300', 'text-rose-300', 'text-violet-300']
const HIGHLIGHT_COLOR = 'text-rose-300'

// ─── Combinatorial line pools ────────────────────────────────────────────────

interface SlotPool {
  openers: string[]
  obs: { text: string; when?: (ctx: MotivationContext) => boolean }[]
  closers: string[]
}

function buildPools(t: TFunction): Record<MotivationState, SlotPool> {
  const e = (key: string) => t(key)
  return {
    'no-shift': {
      openers: [
        e('motivation.engine.noshift.open1'),
        e('motivation.engine.noshift.open2'),
        e('motivation.engine.noshift.open3'),
        e('motivation.engine.noshift.open4'),
        e('motivation.engine.noshift.open5'),
      ],
      obs: [
        { text: ` ${e('motivation.engine.noshift.obs1')}` },
        { text: ` ${e('motivation.engine.noshift.obs2')}` },
        { text: ` ${e('motivation.engine.noshift.obs3')}` },
        { text: ` ${e('motivation.engine.noshift.obs4')}` },
        { text: ` ${e('motivation.engine.noshift.obs5')}` },
      ],
      closers: [
        '',
        ` ${e('motivation.engine.noshift.close2')}`,
        ` ${e('motivation.engine.noshift.close3')}`,
        ` ${e('motivation.engine.noshift.close4')}`,
      ]
    },
    before: {
      openers: [
        e('motivation.engine.before.open1'),
        e('motivation.engine.before.open2'),
        e('motivation.engine.before.open3'),
        e('motivation.engine.before.open4'),
        e('motivation.engine.before.open5'),
      ],
      obs: [
        { text: ` ${e('motivation.engine.before.obs1')}` },
        { text: ` ${e('motivation.engine.before.obs2')}` },
        { text: ` ${e('motivation.engine.before.obs3')}` },
        { text: ` ${e('motivation.engine.before.obs4')}` },
        { text: ` ${e('motivation.engine.before.obs5')}` },
      ],
      closers: [
        '',
        ` ${e('motivation.engine.before.close2')}`,
        ` ${e('motivation.engine.before.close3')}`,
        ` ${e('motivation.engine.before.close4')}`,
      ]
    },
    active: {
      openers: [
        e('motivation.engine.active.open1'),
        e('motivation.engine.active.open2'),
        e('motivation.engine.active.open3'),
        e('motivation.engine.active.open4'),
        e('motivation.engine.active.open5'),
      ],
      obs: [
        { text: ` ${e('motivation.engine.active.obs1')}` },
        { text: ` ${e('motivation.engine.active.obs2')}` },
        { text: ` ${e('motivation.engine.active.obs3')}` },
        { text: ` ${e('motivation.engine.active.obs4')}` },
        { text: ` ${e('motivation.engine.active.obs5')}` },
        { text: ` ${e('motivation.engine.active.obs6')}`, when: (c) => c.shiftProgress <= 25 },
        { text: ` ${e('motivation.engine.active.obs7')}` },
        { text: ` ${e('motivation.engine.active.obs8')}`, when: (c) => c.shiftProgress > 50 },
        { text: ` ${e('motivation.engine.active.obs9')}`, when: (c) => c.isLastActivity },
        { text: ` ${e('motivation.engine.active.obs10')}`, when: (c) => c.shiftProgress > 75 },
        { text: ` ${e('motivation.engine.active.obs11')}`, when: (c) => c.shiftProgress > 25 && c.shiftProgress <= 40 },
      ],
      closers: [
        '',
        ` ${e('motivation.engine.active.close2')}`,
        ` ${e('motivation.engine.active.close3')}`,
        ` ${e('motivation.engine.active.close4')}`,
        ` ${e('motivation.engine.active.close5')}`,
        ` ${e('motivation.engine.active.close6')}`,
        ` ${e('motivation.engine.active.close7')}`,
      ]
    },
    gap: {
      openers: [
        e('motivation.engine.gap.open1'),
        e('motivation.engine.gap.open2'),
        e('motivation.engine.gap.open3'),
        e('motivation.engine.gap.open4'),
        e('motivation.engine.gap.open5'),
      ],
      obs: [
        { text: ` ${e('motivation.engine.gap.obs1')}` },
        { text: ` ${e('motivation.engine.gap.obs2')}` },
        { text: ` ${e('motivation.engine.gap.obs3')}` },
        { text: ` ${e('motivation.engine.gap.obs4')}` },
        { text: ` ${e('motivation.engine.gap.obs5')}` },
      ],
      closers: [
        '',
        ` ${e('motivation.engine.gap.close2')}`,
        ` ${e('motivation.engine.gap.close3')}`,
        ` ${e('motivation.engine.gap.close4')}`,
        ` ${e('motivation.engine.gap.close5')}`,
      ]
    },
    payback: {
      openers: [
        e('motivation.engine.payback.open1'),
        e('motivation.engine.payback.open2'),
        e('motivation.engine.payback.open3'),
        e('motivation.engine.payback.open4'),
      ],
      obs: [
        { text: ` ${e('motivation.engine.payback.obs1')}` },
        { text: ` ${e('motivation.engine.payback.obs2')}` },
        { text: ` ${e('motivation.engine.payback.obs3')}` },
        { text: ` ${e('motivation.engine.payback.obs4')}` },
      ],
      closers: [
        '',
        ` ${e('motivation.engine.payback.close2')}`,
        ` ${e('motivation.engine.payback.close3')}`,
      ]
    },
    overtime: {
      openers: [
        e('motivation.engine.overtime.open1'),
        e('motivation.engine.overtime.open2'),
        e('motivation.engine.overtime.open3'),
      ],
      obs: [
        { text: ` ${e('motivation.engine.overtime.obs1')}` },
        { text: ` ${e('motivation.engine.overtime.obs2')}` },
        { text: ` ${e('motivation.engine.overtime.obs3')}` },
        { text: ` ${e('motivation.engine.overtime.obs4')}` },
      ],
      closers: [
        '',
        ` ${e('motivation.engine.overtime.close2')}`,
        ` ${e('motivation.engine.overtime.close3')}`,
      ]
    },
    finished: {
      openers: [
        e('motivation.engine.finished.open1'),
        e('motivation.engine.finished.open2'),
        e('motivation.engine.finished.open3'),
        e('motivation.engine.finished.open4'),
      ],
      obs: [
        { text: ` ${e('motivation.engine.finished.obs1')}` },
        { text: ` ${e('motivation.engine.finished.obs2')}` },
        { text: ` ${e('motivation.engine.finished.obs3')}` },
      ],
      closers: [
        '',
        ` ${e('motivation.engine.finished.close2')}`,
        ` ${e('motivation.engine.finished.close3')}`,
        ` ${e('motivation.engine.finished.close4')}`,
      ]
    },
  }
}

// ─── Composition ─────────────────────────────────────────────────────────────

// Session-scoped "used" set: once a state's combos are exhausted it resets, so
// within any realistic session the same sentence essentially never appears twice.
const usedSet = new Set<string>()

function composeLine(pool: SlotPool, ctx: MotivationContext, avoid: Set<string>, v: Vars): string {
  const opener = pickFrom(pool.openers, avoid)
  // ~1 in 5 times emit the opener alone — it reads as a complete dry remark.
  if (Math.random() < 0.2) return fill(opener, v)

  const obsPool = pool.obs.filter(o => !o.when || o.when(ctx))
  const obsList = obsPool.length ? obsPool : pool.obs
  const obs = pickFrom(obsList.map(o => o.text), avoid)

  let line = `${opener}${obs}`
  if (Math.random() < 0.55) {
    const closer = pickFrom(pool.closers, avoid)
    if (closer) line += closer
  }
  return fill(line, v)
}

// ─── Highlight selection ─────────────────────────────────────────────────────

function pickHighlight(text: string, ctx: MotivationContext, lang: Lang): string | null {
  // Only sometimes — "bazı kelimeler bazen farklı renk".
  if (Math.random() >= 0.45) return null
  const candidates: string[] = []
  if (ctx.currentApp) {
    const name = friendlyAppName(ctx.currentApp, lang)
    if (text.includes(name)) candidates.push(name)
  }
  if (ctx.activityName && text.includes(ctx.activityName)) candidates.push(ctx.activityName)
  if (candidates.length === 0) {
    const words = text.match(/[A-Za-zÇĞİÖŞÜçğıöşü]{5,}/g) || []
    const meaningful = words.filter(w => !STOP_WORDS[lang].includes(w.toLowerCase()))
    if (meaningful.length) candidates.push(meaningful[Math.floor(Math.random() * meaningful.length)])
  }
  if (!candidates.length) return null
  const token = candidates[Math.floor(Math.random() * candidates.length)]
  return text.includes(token) ? token : null
}

// ─── Ambient ("fresh comment") pools ─────────────────────────────────────────

function ambientPool(t: TFunction, ctx: MotivationContext, lang: Lang): { line: string; weight: number }[] {
  const v = buildVars(t, ctx)
  const app = ctx.currentApp ? friendlyAppName(ctx.currentApp, lang) : ''
  const appSec = ctx.currentAppSeconds ?? 0
  const pool: { line: string; weight: number }[] = []

  if (app && appSec >= 120) {
    const starters = [
      t('motivation.engine.ambient.a1', { app, duration: fmtDur(t, appSec) }),
      t('motivation.engine.ambient.a2', { app, duration: fmtDur(t, appSec) }),
      t('motivation.engine.ambient.a3', { app }),
    ]
    const tails = [
      ` ${t('motivation.engine.ambient.t1')}`,
      ` ${t('motivation.engine.ambient.t2')}`,
      ` ${t('motivation.engine.ambient.t3')}`,
      ` ${t('motivation.engine.ambient.t4')}`,
    ]
    for (const s of starters) for (const tail of tails) pool.push({ line: fill(s + tail, v), weight: 1 })
  }

  if (ctx.state === 'gap' || ctx.state === 'overtime') {
    if (ctx.breakSeconds > 120) {
      pool.push({ line: fill(t('motivation.engine.ambient.gap1'), v), weight: 1 })
    }
    pool.push({ line: fill(t('motivation.engine.ambient.gap2'), v), weight: 1 })
    pool.push({ line: fill(t('motivation.engine.ambient.gap3'), v), weight: 1 })
  }

  if (ctx.state === 'active') {
    pool.push({ line: fill(t('motivation.engine.ambient.active1'), v), weight: 1 })
    pool.push({ line: fill(t('motivation.engine.ambient.active2'), v), weight: 1 })
  }

  if (ctx.hour < 11) pool.push({ line: t('motivation.engine.ambient.h_early'), weight: 1 })
  if (ctx.hour >= 17 && ctx.hour < 20) pool.push({ line: fill(t('motivation.engine.ambient.h_evening'), v), weight: 1 })
  if (ctx.hour >= 20) pool.push({ line: fill(t('motivation.engine.ambient.h_night'), v), weight: 1 })

  if (pool.length === 0) {
    pool.push({ line: fill(t('motivation.engine.ambient.fallback1'), v), weight: 1 })
    pool.push({ line: fill(t('motivation.engine.ambient.fallback2'), v), weight: 1 })
  }

  return pool
}

// ─── Public API ──────────────────────────────────────────────────────────────

function buildAvoid(lastText?: string, recent?: string[]): Set<string> {
  const set = new Set<string>()
  if (lastText) set.add(lastText)
  for (const t of recent ?? []) if (t) set.add(t)
  return set
}

export function generateMotivationLine(t: TFunction, ctx: MotivationContext, lang: Lang = 'tr', lastText?: string, recent?: string[]): MotivationLine {
  const v = buildVars(t, ctx)
  const pools = buildPools(t)
  const pool = pools[ctx.state] ?? pools['no-shift']
  const avoid = buildAvoid(lastText, recent)
  const text = composeLine(pool, ctx, avoid, v)

  // Track used sentences; reset a state's history when it is fully exhausted.
  usedSet.add(text)
  if (usedSet.size > 400) usedSet.clear()

  return { text, color: STATE_COLORS[ctx.state] ?? 'text-slate-400', highlight: pickHighlight(text, ctx, lang) }
}

export function generateAmbientLine(t: TFunction, ctx: MotivationContext, lang: Lang = 'tr', lastText?: string, recent?: string[]): MotivationLine {
  const avoid = buildAvoid(lastText, recent)
  const weighted = ambientPool(t, ctx, lang)
  const candidates = weighted.filter(w => !avoid.has(w.line))
  const chosen = (candidates.length ? candidates : weighted)[Math.floor(Math.random() * (candidates.length ? candidates : weighted).length)]
  const text = chosen.line
  const color = AMBIENT_COLORS[Math.floor(Math.random() * AMBIENT_COLORS.length)]
  return { text, color, highlight: pickHighlight(text, ctx, lang) }
}

export const COLD_COLORS = ['text-slate-400', 'text-stone-400', 'text-amber-300', 'text-orange-300', 'text-emerald-300', 'text-rose-300', 'text-violet-300']
export const HIGHLIGHT = HIGHLIGHT_COLOR
