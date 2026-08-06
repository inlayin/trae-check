function registerWindowControls(ipcMain, getWindow) {
  const withWindow = (callback) => {
    const window = getWindow()
    if (window) callback(window)
  }

  ipcMain.handle('window:minimize', () => withWindow((window) => window.minimize()))
  ipcMain.handle('window:toggle-maximize', () => withWindow((window) => {
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  }))
  ipcMain.handle('window:close', () => withWindow((window) => window.close()))
  ipcMain.handle('window:is-maximized', () => {
    const window = getWindow()
    return window ? window.isMaximized() : false
  })

  const window = getWindow()
  if (!window) return

  window.on('maximize', () => window.webContents.send('window:maximized-changed', true))
  window.on('unmaximize', () => window.webContents.send('window:maximized-changed', false))
}

module.exports = { registerWindowControls }
