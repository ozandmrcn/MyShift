import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  store: {
    get: (key: string, defaultValue?: any) => ipcRenderer.invoke('store:get', key, defaultValue),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },
  notification: {
    show: (title: string, body: string, silent?: boolean) => ipcRenderer.send('notification:show', title, body, silent)
  },
  tray: {
    updateInfo: (text: string) => ipcRenderer.send('tray:update-info', text),
    onAction: (callback: (action: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
      ipcRenderer.on('tray-action', listener)
      return () => ipcRenderer.removeListener('tray-action', listener)
    }
  },
  startup: {
    set: (enabled: boolean) => ipcRenderer.invoke('startup:set', enabled),
    get: () => ipcRenderer.invoke('startup:get')
  },
  appUsage: {
    getSnapshot: () => ipcRenderer.invoke('app-usage:get'),
    onSnapshot: (callback: (snapshot: any) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: any) => callback(snapshot)
      ipcRenderer.on('app-usage:snapshot', listener)
      return () => ipcRenderer.removeListener('app-usage:snapshot', listener)
    }
  },
  ai: {
    generateComment: (req: any) => ipcRenderer.invoke('ai:generate-comment', req),
    test: () => ipcRenderer.invoke('ai:test'),
    getOpenRouterModels: () => ipcRenderer.invoke('ai:openrouter-models')
  },
  surveillance: {
    getStatus: () => ipcRenderer.invoke('surveillance:get-status'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('surveillance:set-enabled', enabled),
    analyze: (days?: number) => ipcRenderer.invoke('surveillance:analyze', days)
  },
  profile: {
    get: () => ipcRenderer.invoke('profile:get'),
    addNote: (text: string) => ipcRenderer.invoke('profile:add-note', text),
    removeNote: (index: number) => ipcRenderer.invoke('profile:remove-note', index),
    clear: () => ipcRenderer.invoke('profile:clear')
  },
  data: {
    export: () => ipcRenderer.invoke('data:export'),
    import: () => ipcRenderer.invoke('data:import'),
    clearSurveillance: () => ipcRenderer.invoke('data:clear-surveillance'),
    clearAll: () => ipcRenderer.invoke('data:clearAll'),
    onImported: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('data:imported', listener)
      return () => ipcRenderer.removeListener('data:imported', listener)
    }
  },
  cloud: {
    logError: (payload: any) => ipcRenderer.invoke('cloud:log-error', payload),
    logInfo: (payload: any) => ipcRenderer.invoke('cloud:log-info', payload)
  },
  onFlushState: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('flush-state', listener)
    return () => ipcRenderer.removeListener('flush-state', listener)
  }
})
