const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createWindowLifecycle } = require('../electron/window-lifecycle.cjs')

test('handleClose prevents normal close and hides the available window', () => {
  const calls = []
  const window = { hide: () => calls.push('hide') }
  const lifecycle = createWindowLifecycle(() => window)
  const event = { preventDefault: () => calls.push('preventDefault') }

  lifecycle.handleClose(event)

  assert.deepEqual(calls, ['preventDefault', 'hide'])
})

test('showWindow restores minimized windows before showing and focusing', () => {
  const calls = []
  const window = {
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus')
  }
  const lifecycle = createWindowLifecycle(() => window)

  lifecycle.showWindow()

  assert.deepEqual(calls, ['restore', 'show', 'focus'])
})

test('showWindow does nothing when a window is unavailable', () => {
  const lifecycle = createWindowLifecycle(() => undefined)

  assert.doesNotThrow(() => lifecycle.showWindow())
})

test('exit quits and allows subsequent close without preventing it', () => {
  const calls = []
  const window = { hide: () => calls.push('hide') }
  const lifecycle = createWindowLifecycle(() => window, () => calls.push('quit'))
  const event = { preventDefault: () => calls.push('preventDefault') }

  lifecycle.exit()
  lifecycle.handleClose(event)

  assert.deepEqual(calls, ['quit'])
})

test('main process wires lifecycle handling and a persistent tray menu', () => {
  const source = fs.readFileSync(path.join(__dirname, '../electron/main.ts'), 'utf8')

  assert.match(source, /Menu, Tray/)
  assert.match(source, /createWindowLifecycle/)
  assert.match(source, /let tray: Tray \| null = null/)
  assert.match(source, /Menu\.setApplicationMenu\(null\)/)
  assert.match(source, /new Tray\(path\.join\(__dirname, '\.\.\/assets\/icon\.png'\)\)/)
  assert.match(source, /tray\.setToolTip\('TraeCheck'\)/)
  assert.ok(source.includes(String.raw`label: '\u663e\u793a TraeCheck'`))
  assert.ok(source.includes(String.raw`label: '\u9000\u51fa'`))
  assert.match(source, /mainWindow\.on\('close', lifecycle\.handleClose\)/)
})
