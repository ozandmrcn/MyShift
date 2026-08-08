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
  }
})
