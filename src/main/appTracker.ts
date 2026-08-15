import { app, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import Store from 'electron-store'
import { psArgs } from './psScript'

// ─── Windows Foreground App Tracker ──────────────────────────────────────────
// Polls the foreground window (via a long-running PowerShell process using the
// Win32 API — no native module compilation needed) and accumulates how long the
// user spends in each app today. Powers the "personalized" motivation lines on
// the Dashboard (e.g. "X'e yarım saattir gömülmüşsün").
//
// Design notes:
//  - Runs even while the window is hidden in the tray, so break-time app usage
//    is captured too.
//  - The MyShift window itself is excluded from the stats.
//  - A daily snapshot lives in electron-store under `appUsage` (pruned to 30 days).

interface AppSession {
  pid: number
  name: string
  title: string | null
  startedAt: number
}

export interface AppUsageSnapshot {
  current: { name: string; title: string | null; seconds: number } | null
  today: { name: string; seconds: number }[]
  todayTotalSeconds: number
}

const PERSIST_INTERVAL_MS = 30000
const PUSH_INTERVAL_MS = 15000

function dayStr(d = new Date()): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
}

export function startAppTracker(getWindow: () => BrowserWindow | null, store: Store): {
  stop: () => void
  getSnapshot: () => AppUsageSnapshot
  setPaused: (paused: boolean) => void
} {
  let ps: ChildProcess | null = null
  let current: AppSession | null = null
  let lastSample = Date.now()
  let usageDay = dayStr()
  let usageToday: Record<string, number> = {}
  let pushing = false
  // While "observation mode" is recording, the tracker pauses so the background
  // shift stats don't keep counting (the observation session is its own thing).
  let paused = false

  const loadToday = () => {
    const saved = store.get('appUsage', {}) as Record<string, Record<string, number>>
    usageToday = saved[usageDay] || {}
  }
  loadToday()

  const ownPid = (): number | null => getWindow()?.webContents.getOSProcessId() ?? null

  const accumulate = () => {
    const now = Date.now()
    const elapsedSec = Math.floor((now - lastSample) / 1000)
    lastSample = now
    if (elapsedSec <= 0) return
    if (!current || !current.name) return
    if (current.pid === ownPid()) return
    usageToday[current.name] = (usageToday[current.name] || 0) + elapsedSec
  }

  const snapshot = (): AppUsageSnapshot => {
    const pid = ownPid()
    const today = Object.entries(usageToday)
      .map(([name, seconds]) => ({ name, seconds }))
      .sort((a, b) => b.seconds - a.seconds)
    const sess = current
    const isReal = !!sess && !!sess.name && sess.pid !== pid
    return {
      current: isReal && sess
        ? { name: sess.name, title: sess.title, seconds: Math.floor((Date.now() - sess.startedAt) / 1000) }
        : null,
      today,
      todayTotalSeconds: today.reduce((s, a) => s + a.seconds, 0)
    }
  }

  const push = () => {
    if (paused) return
    if (pushing) return
    pushing = true
    try {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('app-usage:snapshot', snapshot())
      }
    } finally {
      pushing = false
    }
  }

  const persist = () => {
    const all = store.get('appUsage', {}) as Record<string, Record<string, number>>
    all[usageDay] = usageToday
    // Prune entries older than 30 days
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = dayStr(cutoff)
    for (const key of Object.keys(all)) {
      if (key < cutoffStr) delete all[key]
    }
    store.set('appUsage', all)
  }

  const handleLine = (line: string) => {
    const parts = line.split('|')
    const pid = parseInt(parts[0] || '0', 10)
    const name = (parts[1] || '').trim()
    const title = (parts[2] || '').trim() || null

    accumulate()

    if (pid !== (current?.pid ?? -1) || name !== (current?.name ?? '')) {
      current = { pid, name, title, startedAt: Date.now() }
      push()
    }
  }

  const start = () => {
    if (paused) return
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
    ps.on('error', () => {
      ps = null
    })
    ps.on('exit', () => {
      ps = null
      setTimeout(start, 3000)
    })
  }
  start()

  const setPaused = (p: boolean) => {
    paused = p
    if (p) {
      // Drop the poller immediately; reset the elapsed-window anchor so the time
      // spent paused is never attributed to the previously focused app.
      if (ps && !ps.killed) ps.kill()
      ps = null
      lastSample = Date.now()
    } else {
      start()
    }
  }

  const heartbeat = setInterval(() => {
    if (paused) return
    if (dayStr() !== usageDay) {
      // New day → roll over
      persist()
      usageDay = dayStr()
      loadToday()
      current = null
      lastSample = Date.now()
    }
    push()
  }, PUSH_INTERVAL_MS)

  const persistTimer = setInterval(persist, PERSIST_INTERVAL_MS)

  app.on('will-quit', persist)

  return {
    stop: () => {
      clearInterval(heartbeat)
      clearInterval(persistTimer)
      app.removeListener('will-quit', persist)
      persist()
      if (ps && !ps.killed) ps.kill()
      ps = null
    },
    getSnapshot: snapshot,
    setPaused
  }
}
