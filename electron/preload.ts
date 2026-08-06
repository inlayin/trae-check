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

  // 日志相关
  getLogs: (limit?: number) => ipcRenderer.invoke('logs:get', limit),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),

  // 设置相关
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: any) => ipcRenderer.invoke('settings:save', settings),

  // 定时任务
  getNextRunTime: () => ipcRenderer.invoke('scheduler:next-run'),
  startScheduler: () => ipcRenderer.invoke('scheduler:start'),
  stopScheduler: () => ipcRenderer.invoke('scheduler:stop'),

  // 认证相关
  getCookieFromLoginWindow: () => ipcRenderer.invoke('auth:get-cookie-from-window'),
  notifyLoginComplete: () => ipcRenderer.send('auth:login-complete')
})
