/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  electronAPI: {
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
  }
}
