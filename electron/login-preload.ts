import { contextBridge, ipcRenderer } from 'electron'

// The remote login page needs only this one capability. Do not expose the
// main window's account and settings APIs to it.
contextBridge.exposeInMainWorld('electronAPI', {
  notifyLoginComplete: () => ipcRenderer.send('auth:login-complete')
})
