const assert = require('node:assert/strict')
const test = require('node:test')

const { registerWindowControls } = require('../electron/window-controls.cjs')

function createIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle: (channel, handler) => handlers.set(channel, handler)
  }
}

test('window control handlers delegate to the current main window and broadcast maximized state', () => {
  const ipcMain = createIpcMain()
  const sent = []
  const calls = []
  const listeners = new Map()
  const window = {
    minimize: () => calls.push('minimize'),
    isMaximized: () => false,
    maximize: () => calls.push('maximize'),
    unmaximize: () => calls.push('unmaximize'),
    close: () => calls.push('close'),
    webContents: { send: (channel, value) => sent.push([channel, value]) },
    on: (event, listener) => listeners.set(event, listener)
  }

  registerWindowControls(ipcMain, () => window)

  ipcMain.handlers.get('window:minimize')()
  ipcMain.handlers.get('window:toggle-maximize')()
  ipcMain.handlers.get('window:close')()
  assert.equal(ipcMain.handlers.get('window:is-maximized')(), false)
  listeners.get('maximize')()
  listeners.get('unmaximize')()

  assert.deepEqual(calls, ['minimize', 'maximize', 'close'])
  assert.deepEqual(sent, [
    ['window:maximized-changed', true],
    ['window:maximized-changed', false]
  ])
})

test('toggle maximize restores an already maximized window and handlers tolerate no window', () => {
  const ipcMain = createIpcMain()
  let isMaximized = true
  const calls = []
  const window = {
    minimize: () => calls.push('minimize'),
    isMaximized: () => isMaximized,
    maximize: () => calls.push('maximize'),
    unmaximize: () => calls.push('unmaximize'),
    close: () => calls.push('close'),
    webContents: { send: () => {} },
    on: () => {}
  }

  registerWindowControls(ipcMain, () => window)
  ipcMain.handlers.get('window:toggle-maximize')()
  isMaximized = false
  const unavailableIpcMain = createIpcMain()
  registerWindowControls(unavailableIpcMain, () => null)

  assert.deepEqual(calls, ['unmaximize'])
  assert.doesNotThrow(() => unavailableIpcMain.handlers.get('window:minimize')())
  assert.equal(unavailableIpcMain.handlers.get('window:is-maximized')(), false)
})
