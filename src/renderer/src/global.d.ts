export interface IElectronAPI {
  store: {
    get: (key: string, defaultValue?: any) => Promise<any>
    set: (key: string, value: any) => Promise<boolean>
    delete: (key: string) => Promise<boolean>
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }
  notification: {
    show: (title: string, body: string, silent?: boolean) => void
  }
  tray: {
    updateInfo: (text: string) => void
    onAction: (callback: (action: string) => void) => () => void
  }
  startup: {
    set: (enabled: boolean) => Promise<boolean>
    get: () => Promise<boolean>
  }
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI
  }
}
