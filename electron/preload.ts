import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('electronAPI', {
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChanged: (listener: (isMaximized: boolean) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => listener(isMaximized)
      ipcRenderer.on('window:maximized-changed', subscription)
      return () => ipcRenderer.removeListener('window:maximized-changed', subscription)
    }
  },
  // 账号相关
  getAccounts: () => ipcRenderer.invoke('accounts:get-all'),
  importDesktopAccount: () => ipcRenderer.invoke('accounts:import-desktop'),
  addAccount: (name: string, cookie: string) => ipcRenderer.invoke('accounts:add', { name, cookie }),
  updateAccount: (id: string, updates: any) => ipcRenderer.invoke('accounts:update', id, updates),
  deleteAccount: (id: string) => ipcRenderer.invoke('accounts:delete', id),
  checkinAccount: (id: string) => ipcRenderer.invoke('accounts:checkin', id),
  checkinAll: () => ipcRenderer.invoke('accounts:checkin-all'),
  getAccountPoints: (id: string) => ipcRenderer.invoke('accounts:get-points', id),
  setLocalAccount: (id: string) => ipcRenderer.invoke('accounts:set-local', id),
  getPointsDetail: (id: string) => ipcRenderer.invoke('accounts:get-points-detail', id),

  // 账号导入导出（JSON 深拷贝穿透 Vue Proxy）
  exportAccounts: (ids: string[], includeCredentials: boolean, password: string) => {
    const safe = JSON.parse(JSON.stringify({ ids, includeCredentials, password }))
    return ipcRenderer.invoke('accounts:export-to-file', safe)
  },
  pickImportFile: () => ipcRenderer.invoke('accounts:pick-import-file'),
  importPreview: (filePath: string, password: string) => {
    const safe = JSON.parse(JSON.stringify({ filePath, password }))
    return ipcRenderer.invoke('accounts:import-preview', safe)
  },
  importAccounts: (data: { filePath: string; password: string; strategy: 'skip' | 'overwrite' }) => {
    const safe = JSON.parse(JSON.stringify(data))
    return ipcRenderer.invoke('accounts:import', safe)
  },

  // 日志相关
  getLogs: (limit?: number) => ipcRenderer.invoke('logs:get', limit),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),

  // 设置相关
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: any) => ipcRenderer.invoke('settings:save', settings),

  // 定时任务
  getNextRunTime: () => ipcRenderer.invoke('scheduler:next-run'),
  getSchedulerStatus: () => ipcRenderer.invoke('scheduler:status'),
  startScheduler: () => ipcRenderer.invoke('scheduler:start'),
  stopScheduler: () => ipcRenderer.invoke('scheduler:stop'),

  // 认证相关
  getCookieFromLoginWindow: () => ipcRenderer.invoke('auth:get-cookie-from-window'),
  notifyLoginComplete: () => ipcRenderer.send('auth:login-complete'),

  // 在线更新
  updater: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    cancel: () => ipcRenderer.invoke('update:cancel'),
    install: () => ipcRenderer.invoke('update:install'),
    onAvailable: (listener: (info: { version: string; releaseNotes: string; releaseDate: string }) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, info: any) => listener(info)
      ipcRenderer.on('update:available', subscription)
      return () => ipcRenderer.removeListener('update:available', subscription)
    },
    onNotAvailable: (listener: () => void) => {
      const subscription = () => listener()
      ipcRenderer.on('update:not-available', subscription)
      return () => ipcRenderer.removeListener('update:not-available', subscription)
    },
    onProgress: (listener: (progress: { percent: number; transferred: number; total: number }) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, progress: any) => listener(progress)
      ipcRenderer.on('update:progress', subscription)
      return () => ipcRenderer.removeListener('update:progress', subscription)
    },
    onDownloaded: (listener: () => void) => {
      const subscription = () => listener()
      ipcRenderer.on('update:downloaded', subscription)
      return () => ipcRenderer.removeListener('update:downloaded', subscription)
    },
    onError: (listener: (message: string) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, data: any) => listener(data?.message || '')
      ipcRenderer.on('update:error', subscription)
      return () => ipcRenderer.removeListener('update:error', subscription)
    }
  }
})
