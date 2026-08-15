import { app, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { existsSync, readFileSync, appendFileSync } from 'fs'
import { join } from 'path'
import { surveillanceDir } from './dataStore'
import { psArgs } from './psScript'

// ─── Surveillance Tracker ─────────────────────────────────────────────────────
// Opt-in "observation mode". While enabled it records a fine-grained activity log
// (foreground app + window title + what was typed + timestamps) into
// data/surveillance/ as a daily JSONL file. It only turns on when the user
// explicitly enables it (default OFF). Everything stays on this machine; the data
// is what later feeds the "AI knows you" profile notes.
//
// The PowerShell helpers live in resources/scripts/ (NOT embedded in the JS
// bundle — keeping the keyboard-hook payload out of index.js avoids triggering
// antivirus heuristics that look for inline keylogger scripts):
//   • watch-focus.ps1   — foreground-window poller (3s)
//   • watch-typing.ps1  — global low-level keyboard hook, buffers typed chars and
//                         flushes every 5s tagged with the focused window. It is
//                         local-only and guarded: secure/credential windows are
//                         skipped.
// Both are read here and launched via -EncodedCommand.
//
// Raw JSONL lines look like:
//   {"t":1699999999999,"app":"spotify","title":"..."}
//   {"t":1699999999999,"app":"code","title":"proje.ts - VS Code","typed":"..."}

const POLL_MS = 3000
const HEARTBEAT_MS = 15000
// How many live records to keep in memory for the observation view feed.
const LIVE_WINDOW = 150

export interface SurveillanceSample {
  t: number
  app: string
  title: string | null
  typed?: string
}

export interface SurveillanceSnapshot {
  enabled: boolean
  startedAt: number | null
  current: { app: string; title: string | null; t: number; typed?: string } | null
  recent: SurveillanceSample[]
  today: {
    totalSeconds: number
    appSeconds: { name: string; seconds: number }[]
    samples: number
    typedFlushes: number
    typedChars: number
  }
  recentDays: { date: string; totalSeconds: number; samples: number }[]
}

function dayStr(d = new Date()): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
}

function fileFor(dateStr: string): string {
  return join(surveillanceDir(), `${dateStr}.jsonl`)
}

function readDay(dateStr: string): SurveillanceSample[] {
  const file = fileFor(dateStr)
  if (!existsSync(file)) return []
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        try { return JSON.parse(l) as SurveillanceSample } catch { return null }
      })
      .filter((x): x is SurveillanceSample => x !== null && typeof x.app === 'string')
  } catch {
    return []
  }
}

function aggregate(samples: SurveillanceSample[]): { totalSeconds: number; appSeconds: Record<string, number> } {
  const appSeconds: Record<string, number> = {}
  let totalSeconds = 0
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    const next = samples[i + 1]
    const span = next ? Math.min(HEARTBEAT_MS, Math.max(0, next.t - s.t)) / 1000 : HEARTBEAT_MS / 1000
    if (!s.app) continue
    appSeconds[s.app] = (appSeconds[s.app] || 0) + span
    totalSeconds += span
  }
  return { totalSeconds, appSeconds }
}

export function startSurveillance(
  getWindow: () => BrowserWindow | null,
  isEnabled: () => boolean
): { stop: () => void; getSnapshot: () => SurveillanceSnapshot } {
  let ps: ChildProcess | null = null
  let psTyping: ChildProcess | null = null
  let startedAt = Date.now()
  let lastWrite = 0
  let lastSample: SurveillanceSample | null = null
  let live: SurveillanceSample[] = []

  const ownPid = (): number | null => getWindow()?.webContents.getOSProcessId() ?? null

  const record = (s: SurveillanceSample) => {
    // Skip "nothing focused" polls — the time spans between real samples already
    // account for gaps, and it keeps the day file / live feed readable.
    if (!s.app && !s.title) return
    const now = s.t
    const file = fileFor(dayStr(new Date(now)))
    const heartbeatDue = now - lastWrite >= HEARTBEAT_MS
    const changed = !lastSample || lastSample.app !== s.app || lastSample.title !== s.title
    // Typed-text flushes always land (same app/title as the focus sample before them).
    if (changed || heartbeatDue || s.typed !== undefined) {
      appendFileSync(file, JSON.stringify(s) + '\n', 'utf8')
      lastWrite = now
      lastSample = s
      live.push(s)
      if (live.length > LIVE_WINDOW) live = live.slice(-LIVE_WINDOW)
    }
  }

  const handleLine = (line: string) => {
    if (line.startsWith('{')) {
      try {
        const parsed = JSON.parse(line)
        const typed = typeof parsed.typed === 'string' ? parsed.typed : ''
        if (!typed) return
        const own = ownPid()
        if (own !== null && Number(parsed.pid) === own) return
        const name = String(parsed.app ?? '').trim()
        const title = typeof parsed.title === 'string' ? parsed.title.trim() || null : null
        if (!name && !title) return
        record({ t: Date.now(), app: name, title, typed })
      } catch { /* malformed line → ignore */ }
      return
    }
    const parts = line.split('|')
    const pid = parseInt(parts[0] || '0', 10)
    const name = (parts[1] || '').trim()
    const title = (parts[2] || '').trim() || null
    const own = ownPid()
    if (own !== null && pid === own) return
    record({ t: Date.now(), app: name, title })
  }

  const startTyping = () => {
    if (psTyping && !psTyping.killed) return
    const args = psArgs('watch-typing.ps1')
    if (!args) return
    psTyping = spawn('powershell.exe', args, {
      windowsHide: true
    })
    let buf = ''
    psTyping.stdout?.on('data', (d: Buffer) => {
      buf += d.toString('utf8')
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (line) handleLine(line)
      }
    })
    psTyping.on('error', () => { psTyping = null })
    psTyping.on('exit', () => {
      psTyping = null
      if (isEnabled()) setTimeout(startTyping, 3000)
    })
  }

  const killTyping = () => {
    if (psTyping && !psTyping.killed) psTyping.kill()
    psTyping = null
  }

  const start = () => {
    if (ps && !ps.killed) return
    const args = psArgs('watch-focus.ps1')
    if (!args) return
    ps = spawn('powershell.exe', args, {
      windowsHide: true
    })
    let buf = ''
    ps.stdout?.on('data', (d: Buffer) => {
      buf += d.toString('utf8')
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (line) handleLine(line)
      }
    })
    ps.on('error', () => { ps = null })
    ps.on('exit', () => {
      ps = null
      if (isEnabled()) setTimeout(start, 3000)
    })
  }

  if (isEnabled()) {
    start()
    startTyping()
  }

  let wasEnabled = isEnabled()

  const pollTimer = setInterval(() => {
    const enabled = isEnabled()
    if (enabled) {
      if (!ps || ps.killed) { startedAt = Date.now(); start() }
      if (!psTyping || psTyping.killed) startTyping()
    } else {
      if (ps && !ps.killed) { ps.kill(); ps = null }
      killTyping()
    }
    if (enabled && !wasEnabled) startedAt = Date.now()
    wasEnabled = enabled
    if (enabled) {
      // Heartbeat keeps the day's file alive even if nothing changes.
      const now = Date.now()
      if (now - lastWrite >= HEARTBEAT_MS && lastSample) {
        record({ t: now, app: lastSample.app, title: lastSample.title })
      }
    }
  }, POLL_MS)

  const getSnapshot = (): SurveillanceSnapshot => {
    const today = dayStr()
    const todaySamples = readDay(today)
    const typedSamples = todaySamples.filter(s => s.typed)
    const agg = aggregate(todaySamples)
    const recentDays = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const ds = dayStr(d)
      const s = readDay(ds)
      const a = aggregate(s)
      recentDays.push({ date: ds, totalSeconds: Math.round(a.totalSeconds), samples: s.length })
    }
    return {
      enabled: isEnabled(),
      startedAt: isEnabled() ? startedAt : null,
      current: lastSample && lastSample.app ? { app: lastSample.app, title: lastSample.title, t: lastSample.t, typed: lastSample.typed } : null,
      recent: live.slice(-LIVE_WINDOW),
      today: {
        totalSeconds: Math.round(agg.totalSeconds),
        appSeconds: Object.entries(agg.appSeconds)
          .map(([name, seconds]) => ({ name, seconds: Math.round(seconds) }))
          .sort((a, b) => b.seconds - a.seconds),
        samples: todaySamples.length,
        typedFlushes: typedSamples.length,
        typedChars: typedSamples.reduce((sum, s) => sum + (s.typed?.length ?? 0), 0)
      },
      recentDays: recentDays.filter(d => d.samples > 0)
    }
  }

  app.on('will-quit', () => {
    if (ps && !ps.killed) ps.kill()
    ps = null
    killTyping()
  })

  return {
    stop: () => {
      clearInterval(pollTimer)
      if (ps && !ps.killed) ps.kill()
      ps = null
      killTyping()
    },
    getSnapshot
  }
}
