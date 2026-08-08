import { app, session, BrowserWindow, ipcMain, Tray, Menu, Notification } from 'electron'
import { join } from 'path'
import Store from 'electron-store'

// Initialize Electron Store
const store = new Store()

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let trayMenu: Menu | null = null
let isQuitting = false

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
      nodeIntegration: false
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
    // Set App ID for Windows Native Notifications
    app.setAppUserModelId('com.myshift.app')

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
ipcMain.on('tray:update-info', (_event, text: string) => {
  if (tray) {
    // Windows tooltips are length-limited (~127 chars); keep it short
    const label = text ? String(text).slice(0, 120) : 'MyShift - Personal Shift Management'
    tray.setToolTip(label)
    // Mirror the live status into the (disabled) first menu row
    if (trayMenu) {
      const statusItem = trayMenu.getMenuItemById('status')
      if (statusItem) {
        statusItem.label = label
        tray.setContextMenu(trayMenu)
      }
    }
  }
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
