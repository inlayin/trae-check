const assert = require('node:assert/strict')
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
