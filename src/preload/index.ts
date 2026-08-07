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
  startup: {
    set: (enabled: boolean) => ipcRenderer.invoke('startup:set', enabled),
    get: () => ipcRenderer.invoke('startup:get')
  }
})
