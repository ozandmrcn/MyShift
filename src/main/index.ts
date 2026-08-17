import { app, session, BrowserWindow, ipcMain, Tray, Menu, Notification, dialog } from 'electron'
import { join } from 'path'
import { execFile } from 'child_process'
import Store from 'electron-store'
import { startAppTracker, AppUsageSnapshot } from './appTracker'
import { generateAiComment, AiCommentConfig, testAiConnection, getOpenRouterModels, extractMeaningfulTyped } from './aiComment'
import { AiCommentRequest, AiCommentResult } from '../shared/aiTypes'
import { startSurveillance, SurveillanceSnapshot } from './surveillanceTracker'
import { analyzeSurveillance } from './surveillanceAnalyzer'
import { dataDir, surveillanceDir, loadAiProfile, saveAiProfile, appendAiNote, AiProfile } from './dataStore'
import { existsSync, copyFileSync, readFileSync, readdirSync, writeFileSync, appendFileSync, rmSync } from 'fs'

// Initialize Electron Store — all settings live in the visible data/ folder.
// Migrate an old config.json from userData if present, so no settings are lost.
const store = new Store({ cwd: dataDir() })

function migrateLegacyStore(): void {
  if (existsSync(join(dataDir(), 'config.json'))) return
  const legacy = join(app.getPath('userData'), 'config.json')
  if (existsSync(legacy)) copyFileSync(legacy, join(dataDir(), 'config.json'))
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let trayMenu: Menu | null = null
let isQuitting = false
let stopAppTracker: (() => void) | null = null
let getAppUsageSnapshot: (() => AppUsageSnapshot) | null = null
let setAppUsagePaused: ((paused: boolean) => void) | null = null
let stopSurveillance: (() => void) | null = null
let getSurveillanceSnapshot: (() => SurveillanceSnapshot) | null = null

// Windows toast notifications attribute themselves to the app via an
// AppUserModelID (AUMID). The NSIS installer registers `com.myshift.app` through
// the Start Menu shortcut, but dev / `pack --dir` runs have no shortcut, so
// Windows would otherwise show the raw exe path as the app name. Self-registering
// the AUMID's DisplayName makes every run show "MyShift" correctly.
function registerAppUserModelId(): void {
  const aumid = 'com.myshift.app'
  app.setAppUserModelId(aumid)
  if (process.platform !== 'win32') return
  const regPath = `HKCU\\Software\\Classes\\AppUserModelId\\${aumid}`
  execFile('reg', ['add', regPath, '/v', 'DisplayName', '/t', 'REG_EXPAND_SZ', '/d', 'MyShift', '/f'], () => {})
  execFile('reg', ['add', regPath, '/v', 'IconUri', '/t', 'REG_EXPAND_SZ', '/d', join(app.getAppPath(), 'resources/icon.png'), '/f'], () => {})
}

function createTray(): void {
  // Use a default system icon or fallback for tray icon (we'll provide a real icon path later)
  // For development, we'll try to find a system icon or use a dummy image.
  // In a packaged app, we should use a proper .ico file.
  const iconPath = join(__dirname, '../../resources/icon.png')
  
  try {
    tray = new Tray(iconPath)
  } catch (error) {
    // If the icon is missing during bootstrap, create a dummy or try/catch fallback
    console.error('Failed to load tray icon:', error)
    // We will initialize the tray anyway when the file is available
    return
  }

  const contextMenu = Menu.buildFromTemplate([
    { 
      id: 'status',
      label: 'MyShift',
      enabled: false
    },
    { type: 'separator' },
    { 
      label: 'Göster', 
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      } 
    },
    { 
      label: 'Vardiyayı Tamamla', 
      click: () => {
        mainWindow?.webContents.send('tray-action', 'complete-shift')
      } 
    },
    { 
      label: 'Aşımı Sıfırla', 
      click: () => {
        mainWindow?.webContents.send('tray-action', 'reset-idle')
      } 
    },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        isQuitting = true
        app.quit()
      } 
    }
  ])

  trayMenu = contextMenu
  tray.setToolTip('MyShift - Personal Shift Management')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow?.show()
  })
}

function createWindow(): void {
  // Retrieve window bounds from store if saved
  const windowBounds = store.get('windowBounds', { width: 960, height: 680 }) as { width: number; height: number }

  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false, // Frameless for Fluent Custom Titlebar
    transparent: true,
    backgroundMaterial: 'mica', // Windows 11 Mica backdrop effect
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Keep the renderer's 1s clock ticking even when the window is hidden in the
      // tray — otherwise Chromium throttles timers in background pages and activity /
      // aşım transition notifications arrive late or not at all while running in tray.
      backgroundThrottling: false
    }
  })

  // Set window background material if Mica is supported
  if (process.platform === 'win32') {
    mainWindow.setBackgroundMaterial('mica')
  }

  mainWindow.on('ready-to-show', () => {
    // If startMinimized setting is enabled (or launched with --minimized), hide the window initially
    const startMinimized = store.get('settings.startMinimized', false) as boolean
    const autoMinimizeToTray = store.get('settings.autoMinimizeToTray', true) as boolean
    const launchedMinimized = startMinimized || process.argv.includes('--minimized')
    if (!launchedMinimized) {
      mainWindow?.show()
      // "Show briefly, then collapse to tray": if the user does not interact with the
      // window within a few seconds after launch, minimize it to the system tray.
      if (autoMinimizeToTray && tray) {
        const shownAt = Date.now()
        let interacted = false
        const onFocus = () => {
          // Ignore the programmatic focus caused by our own show(); count only real
          // user focus that happens after the initial 200ms.
          if (Date.now() - shownAt > 200) interacted = true
        }
        mainWindow?.on('focus', onFocus)
        setTimeout(() => {
          mainWindow?.removeListener('focus', onFocus)
          if (!interacted && mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
            mainWindow.hide()
          }
        }, 4000)
      }
    } else {
      mainWindow?.hide()
    }
  })

  // Save window size on close
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      const minimizeToTray = store.get('settings.minimizeToTray', true) as boolean
      if (minimizeToTray) {
        e.preventDefault()
        mainWindow?.hide()
        return
      }
    }
    
    // Save window size before actual quit
    if (mainWindow) {
      const { width, height } = mainWindow.getBounds()
      store.set('windowBounds', { width, height })
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Load the local URL for development or the local file for production
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Single Instance Lock
const additionalData = { myKey: 'myshift-unique-lock' }
const gotTheLock = app.requestSingleInstanceLock(additionalData)

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    // Set a proper AppUserModelID for Windows Native Notifications so toasts are
    // attributed to "MyShift" instead of the raw executable path (see registerAppUserModelId).
    if (process.platform === 'win32') {
      registerAppUserModelId()
    }

    // Content-Security-Policy for the packaged renderer (file://). The dev server
    // (http://) is unaffected, so HMR keeps working during development.
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws:"
          ]
        }
      })
    })

    createWindow()
    createTray()

    // Migrate old userData config.json into the visible data/ folder (once).
    migrateLegacyStore()

    // Background foreground-app tracker (feeds the Dashboard motivation lines)
    const tracker = startAppTracker(() => mainWindow, store)
    stopAppTracker = tracker.stop
    getAppUsageSnapshot = tracker.getSnapshot
    setAppUsagePaused = tracker.setPaused

    // Opt-in activity recorder (data/ folder). Only active when the user enables it.
    const surveillance = startSurveillance(
      () => mainWindow,
      () => store.get('settings.surveillanceEnabled', false) as boolean
    )
    stopSurveillance = surveillance.stop
    getSurveillanceSnapshot = surveillance.getSnapshot

    // If observation is already enabled (e.g. app reopened while recording), the
    // background shift tracker must not run in parallel with it.
    if (store.get('settings.surveillanceEnabled', false) as boolean) {
      tracker.setPaused(true)
      // And the tray badge should reflect it right away.
      surveillanceRecording = true
      applyTrayLabel()
    }

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  const minimizeToTray = store.get('settings.minimizeToTray', true) as boolean
  if (minimizeToTray) {
    // If minimize to tray is enabled, do not quit when window is hidden/closed
    return
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Communication Handlers

// 1. Electron Store
ipcMain.handle('store:get', (_event, key, defaultValue) => {
  return store.get(key, defaultValue)
})

ipcMain.handle('store:set', (_event, key, value) => {
  store.set(key, value)
  return true
})

ipcMain.handle('store:delete', (_event, key) => {
  store.delete(key)
  return true
})

// 2. Window Controls
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.on('window:close', () => {
  const minimizeToTray = store.get('settings.minimizeToTray', true) as boolean
  if (minimizeToTray) {
    mainWindow?.hide()
  } else {
    mainWindow?.close()
  }
})

// 3. Windows Native Notifications
ipcMain.on('notification:show', (_event, title: string, body: string, silent = false) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      silent: silent // If silent, native system sound won't play (we might play custom sound in renderer)
    })
    notification.show()
    
    notification.on('click', () => {
      mainWindow?.show()
      mainWindow?.focus()
    })
  }
})

// 3.5 Tray Tooltip Updates (live status from renderer)
let lastTrayLabel = ''
let surveillanceRecording = false

function applyTrayLabel(): void {
  if (!tray) return
  const obs = surveillanceRecording ? '👁️ Gözlem modu aktif' : ''
  const label = (obs ? `${obs} • ` : '') + (lastTrayLabel || 'MyShift - Personal Shift Management')
  const final = label.slice(0, 120)
  tray.setToolTip(final)
  if (trayMenu) {
    const statusItem = trayMenu.getMenuItemById('status')
    if (statusItem) {
      statusItem.label = final
      tray.setContextMenu(trayMenu)
    }
  }
}

ipcMain.on('tray:update-info', (_event, text: string) => {
  // Windows tooltips are length-limited (~127 chars); keep it short
  lastTrayLabel = text ? String(text).slice(0, 120) : ''
  applyTrayLabel()
})

// 4. Windows Startup Configuration
ipcMain.handle('startup:set', (_event, enabled: boolean) => {
  // Config Windows startup
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe')
  })
  return true
})

ipcMain.handle('startup:get', () => {
  const settings = app.getLoginItemSettings()
  return settings.openAtLogin
})

// 5. Foreground App Usage (for the Dashboard motivation engine)
ipcMain.handle('app-usage:get', (): AppUsageSnapshot => {
  return getAppUsageSnapshot ? getAppUsageSnapshot() : { current: null, today: [], todayTotalSeconds: 0 }
})

// 6. AI Comment Writer (Ollama / OpenAI-compatible). Settings live in electron-store;
// the renderer only sends context, never the API key.
ipcMain.handle('ai:generate-comment', async (_event, req: AiCommentRequest): Promise<AiCommentResult | null> => {
  const cfg: AiCommentConfig = {
    provider: store.get('settings.commentProvider', 'offline') as AiCommentConfig['provider'],
    baseUrl: store.get('settings.commentBaseUrl', 'http://127.0.0.1:11434') as string,
    apiKey: store.get('settings.commentApiKey', '') as string,
    model: store.get('settings.commentModel', 'qwen2.5') as string
  }
  // Attach the accumulated profile notes ("what the AI knows about the user") and
  // the freshest keyboard activity from observation mode. The typed text is
  // pre-processed into complete, meaningful words (split flushes are re-joined,
  // half-typed trailing words are dropped) so the AI never latches onto a
  // meaningless fragment like "alt" while the user is typing "altyazı".
  // Additionally, extract a window of recent typed snippets (typedHistory) so the
  // AI can see the user's writing patterns over time, not just the last flush.
  const profile = loadAiProfile()
  const snap = getSurveillanceSnapshot?.()
  const typedText = snap ? extractMeaningfulTyped(snap.recent) : null
  const typedHistory = snap
    ? snap.recent
        .filter(s => typeof s.typed === 'string' && s.typed.trim().length > 3)
        .slice(-10)
        .map(s => s.typed!.trim().slice(0, 80))
    : []
  const enriched: AiCommentRequest = {
    ...req,
    typedText,
    typedCharsToday: snap?.today?.typedChars ?? 0,
    typedHistory,
    profileNotes: profile.notes.map(n => n.text)
  }
  return generateAiComment(enriched, cfg)
})

// 6.5 Live AI connection check (Settings page) — reports whether the configured
// API key / provider actually works, with a human-readable failure reason.
ipcMain.handle('ai:test', async (): Promise<ReturnType<typeof testAiConnection>> => {
  const cfg: AiCommentConfig = {
    provider: store.get('settings.commentProvider', 'offline') as AiCommentConfig['provider'],
    baseUrl: store.get('settings.commentBaseUrl', 'http://127.0.0.1:11434') as string,
    apiKey: store.get('settings.commentApiKey', '') as string,
    model: store.get('settings.commentModel', 'qwen2.5') as string
  }
  return testAiConnection(cfg)
})

// 6.6 Current OpenRouter free model list — lets the Settings page offer an
// always-fresh picker (free models come and go on OpenRouter).
ipcMain.handle('ai:openrouter-models', async () => getOpenRouterModels())

// 7. Surveillance ("Toplanan Veriler") — opt-in activity recording + analysis.
ipcMain.handle('surveillance:get-status', (): SurveillanceSnapshot => {
  return getSurveillanceSnapshot
    ? getSurveillanceSnapshot()
    : { enabled: false, startedAt: null, current: null, recent: [], today: { totalSeconds: 0, appSeconds: [], samples: 0, typedFlushes: 0, typedChars: 0 }, recentDays: [] }
})

ipcMain.handle('surveillance:set-enabled', (_event, enabled: boolean) => {
  store.set('settings.surveillanceEnabled', !!enabled)
  // While observation is recording, the background shift tracker is paused so
  // shift stats don't keep running alongside the pure observation session.
  setAppUsagePaused?.(!!enabled)
  // Surface the recording state on the tray tooltip so it's visible even when
  // the app is minimized to the tray ("👁️ Gözlem modu aktif").
  surveillanceRecording = !!enabled
  applyTrayLabel()
  return true
})

// 8. AI profile ("kullanıcıyı tanıyan notlar") — CRUD + on-demand analysis.
ipcMain.handle('profile:get', (): AiProfile => loadAiProfile())

ipcMain.handle('profile:add-note', (_event, text: string): AiProfile => appendAiNote(String(text)))

ipcMain.handle('profile:remove-note', (_event, index: number): AiProfile => {
  const profile = loadAiProfile()
  const i = Number(index)
  if (Number.isInteger(i) && i >= 0 && i < profile.notes.length) {
    profile.notes.splice(i, 1)
    profile.updatedAt = new Date().toISOString()
    saveAiProfile(profile)
  }
  return profile
})

ipcMain.handle('profile:clear', (): AiProfile => {
  const profile: AiProfile = { notes: [], updatedAt: new Date().toISOString() }
  saveAiProfile(profile)
  return profile
})

ipcMain.handle('surveillance:analyze', async (_event, days?: number): Promise<AiProfile> => {
  const cfg: AiCommentConfig = {
    provider: store.get('settings.commentProvider', 'offline') as AiCommentConfig['provider'],
    baseUrl: store.get('settings.commentBaseUrl', 'http://127.0.0.1:11434') as string,
    apiKey: store.get('settings.commentApiKey', '') as string,
    model: store.get('settings.commentModel', 'qwen2.5') as string
  }
  return analyzeSurveillance(cfg, Number(days) || 7)
})

// 9. Data export / import — bundles EVERYTHING (store, AI profile, surveillance)
// into one JSON file the user can back up, transfer, or restore on another machine.
export interface DataExportBundle {
  app: 'myshift'
  type: 'myshift-data-export'
  version: 2
  exportedAt: string
  data: {
    store: Record<string, unknown>   // entire electron-store content
    aiProfile: AiProfile
    surveillance: Record<string, string> // "YYYY-MM-DD.jsonl" -> file content
  }
}

function buildExportBundle(): DataExportBundle {
  // 1. Snapshot every key in electron-store (templates, settings, completedShifts,
  //    dailyLogs, todayDetail, idleState, breakState, windowBounds — everything).
  const storeData: Record<string, unknown> = {}
  try {
    const all = store.store  // electron-store's built-in full-object getter
    if (all && typeof all === 'object') {
      for (const [k, v] of Object.entries(all as Record<string, unknown>)) {
        storeData[k] = v
      }
    }
  } catch { /* empty store */ }

  // 2. Surveillance JSONL files.
  const files: Record<string, string> = {}
  let names: string[] = []
  try { names = readdirSync(surveillanceDir()).filter(n => n.endsWith('.jsonl')) } catch { /* no dir yet */ }
  for (const name of names) {
    try { files[name] = readFileSync(join(surveillanceDir(), name), 'utf8') } catch { /* skip */ }
  }

  return {
    app: 'myshift',
    type: 'myshift-data-export',
    version: 2,
    exportedAt: new Date().toISOString(),
    data: { store: storeData, aiProfile: loadAiProfile(), surveillance: files }
  }
}

ipcMain.handle('data:export', async (_event): Promise<{ ok: boolean; file?: string; error?: string }> => {
  try {
    const d = new Date()
    const defaultName = `myshift-data-${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}.json`
    const result = await dialog.showSaveDialog({
      title: 'MyShift Verilerini Dışa Aktar',
      defaultPath: defaultName,
      filters: [{ name: 'MyShift Data', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false, error: 'iptal' }
    writeFileSync(result.filePath, JSON.stringify(buildExportBundle(), null, 2), 'utf8')
    return { ok: true, file: result.filePath }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
})

ipcMain.handle('data:import', async (_event): Promise<{ ok: boolean; notes?: number; files?: number; storeKeys?: number; error?: string }> => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'MyShift Verilerini İçe Aktar',
      filters: [{ name: 'MyShift Data', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'iptal' }
    const raw = JSON.parse(readFileSync(result.filePaths[0], 'utf8'))
    if (raw?.type !== 'myshift-data-export') return { ok: false, error: 'Bu bir MyShift veri dosyası değil.' }
    const ver = raw.version ?? 1
    const data = raw.data ?? {}

    let storeKeys = 0

    // Version 2+: restore entire electron-store content.
    if (ver >= 2 && data.store && typeof data.store === 'object') {
      for (const [k, v] of Object.entries(data.store as Record<string, unknown>)) {
        store.set(k, v)
        storeKeys++
      }
      // Notify the renderer so it can call loadFromStore() and pick up changes.
      mainWindow?.webContents.send('data:imported')
    }

    // AI profile notes (dedupe handled inside appendAiNote).
    const before = loadAiProfile().notes.length
    for (const note of data.aiProfile?.notes ?? []) appendAiNote(String(note.text ?? ''))
    const after = loadAiProfile().notes.length

    // Surveillance day files — merge line-by-line (no duplicates).
    let files = 0
    const dir = surveillanceDir()
    for (const [name, content] of Object.entries(data.surveillance ?? {})) {
      if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) continue
      const file = join(dir, name)
      const existing = new Set<string>()
      if (existsSync(file)) {
        for (const l of readFileSync(file, 'utf8').split('\n')) existing.add(l.trim())
      }
      let added = 0
      for (const line of String(content).split('\n')) {
        const l = line.trim()
        if (l && !existing.has(l)) {
          appendFileSync(file, l + '\n', 'utf8')
          existing.add(l)
          added++
        }
      }
      if (added > 0) files++
    }

    return { ok: true, notes: after - before, files, storeKeys }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
})

// 10. Wipe all collected observation data (surveillance files only; keeps settings).
ipcMain.handle('data:clear-surveillance', async (): Promise<{ ok: boolean; error?: string }> => {
  try {
    let names: string[] = []
    try { names = readdirSync(surveillanceDir()).filter(n => n.endsWith('.jsonl')) } catch { /* none */ }
    for (const name of names) rmSync(join(surveillanceDir(), name), { force: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
})

// Cleanup on quit
app.on('will-quit', () => {
  if (stopAppTracker) {
    stopAppTracker()
    stopAppTracker = null
    setAppUsagePaused = null
  }
  if (stopSurveillance) {
    stopSurveillance()
    stopSurveillance = null
  }
})
