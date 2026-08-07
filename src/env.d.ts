/// <reference types="vite/client" />

// 由 vite.config.ts 的 define 注入，值为 package.json 的 version
declare const __APP_VERSION__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  electronAPI: {
    windowControls: {
      minimize: () => Promise<void>
      toggleMaximize: () => Promise<void>
      close: () => Promise<void>
      isMaximized: () => Promise<boolean>
      onMaximizedChanged: (listener: (isMaximized: boolean) => void) => () => void
    }
    getAccounts: () => Promise<any[]>
    importDesktopAccount: () => Promise<any>
    addAccount: (name: string, cookie: string) => Promise<any>
    updateAccount: (id: string, updates: any) => Promise<any>
    deleteAccount: (id: string) => Promise<boolean>
    checkinAccount: (id: string) => Promise<any>
    checkinAll: () => Promise<any[]>
    getLogs: (limit?: number) => Promise<any[]>
    clearLogs: () => Promise<boolean>
    getSettings: () => Promise<any>
    saveSettings: (settings: any) => Promise<any>
    getNextRunTime: () => Promise<string | null>
    startScheduler: () => Promise<boolean>
    stopScheduler: () => Promise<boolean>
    getCookieFromLoginWindow: () => Promise<any>
    notifyLoginComplete: () => void
    updater: {
      check: () => Promise<void>
      download: () => Promise<void>
      cancel: () => Promise<boolean>
      install: () => Promise<boolean>
      onAvailable: (listener: (info: { version: string; releaseNotes: string; releaseDate: string }) => void) => () => void
      onNotAvailable: (listener: () => void) => () => void
      onProgress: (listener: (progress: { percent: number; transferred: number; total: number }) => void) => () => void
      onDownloaded: (listener: () => void) => () => void
      onError: (listener: (message: string) => void) => () => void
    }
  }
}
