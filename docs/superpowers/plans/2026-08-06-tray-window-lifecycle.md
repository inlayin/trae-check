# Tray Window Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the desktop application menu and keep TraeCheck running in the tray until the user explicitly chooses Exit.

**Architecture:** A small CommonJS helper owns the testable decisions for hiding, restoring, and allowing quit. `electron/main.ts` delegates Electron events to it, then owns only Tray and menu wiring.

**Tech Stack:** Electron 29, TypeScript, Node.js built-in test runner, Vite Electron plugin.

---

### Task 1: Define and test window lifecycle decisions

**Files:**
- Create: `tests/window-lifecycle.test.cjs`
- Create: `electron/window-lifecycle.cjs`

- [ ] **Step 1: Write the failing test**

```js
const assert = require('node:assert/strict')
const test = require('node:test')
const { createWindowLifecycle } = require('../electron/window-lifecycle.cjs')

test('hides a normal close and restores a minimized window from the tray', () => {
  let prevented = false
  let hidden = false
  let restored = false
  let shown = false
  let focused = false
  const lifecycle = createWindowLifecycle(() => ({
    isMinimized: () => true,
    restore: () => { restored = true },
    show: () => { shown = true },
    focus: () => { focused = true },
    hide: () => { hidden = true }
  }))
  lifecycle.handleClose({ preventDefault: () => { prevented = true } })
  lifecycle.showWindow()
  assert.equal(prevented, true)
  assert.equal(hidden, true)
  assert.equal(restored, true)
  assert.equal(shown, true)
  assert.equal(focused, true)
})

test('allows close only after explicit exit', () => {
  let prevented = false
  let quit = false
  const lifecycle = createWindowLifecycle(() => ({ hide: () => {} }), () => { quit = true })
  lifecycle.exit()
  lifecycle.handleClose({ preventDefault: () => { prevented = true } })
  assert.equal(quit, true)
  assert.equal(prevented, false)
})
```

- [ ] **Step 2: Verify red**

Run: `node --test tests/window-lifecycle.test.cjs`

Expected: FAIL because `electron/window-lifecycle.cjs` is absent.

- [ ] **Step 3: Implement the minimum helper**

```js
function createWindowLifecycle(getWindow, quit = () => {}) {
  let isQuitting = false
  function showWindow() {
    const window = getWindow()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }
  function handleClose(event) {
    if (isQuitting) return
    event.preventDefault()
    const window = getWindow()
    if (window) window.hide()
  }
  function exit() { isQuitting = true; quit() }
  return { exit, handleClose, showWindow }
}
module.exports = { createWindowLifecycle }
```

- [ ] **Step 4: Verify green**

Run: `node --test tests/window-lifecycle.test.cjs`

Expected: PASS with two passing subtests.

- [ ] **Step 5: Commit**

Run: `git add tests/window-lifecycle.test.cjs electron/window-lifecycle.cjs; git commit -m "test: cover tray window lifecycle"`

### Task 2: Wire lifecycle to Electron and tray controls

**Files:**
- Modify: `electron/main.ts`
- Modify: `tests/window-lifecycle.test.cjs`

- [ ] **Step 1: Add a failing null-window test**

```js
test('showWindow tolerates the main window being unavailable', () => {
  const lifecycle = createWindowLifecycle(() => null)
  lifecycle.showWindow()
})
```

- [ ] **Step 2: Verify red**

Run: `node --test tests/window-lifecycle.test.cjs`

Expected: FAIL until `showWindow` checks for a missing window.

- [ ] **Step 3: Wire the tested operations**

In `main.ts`, import `Menu` and `Tray`; retain a module-level `tray`; load the CommonJS lifecycle helper; and create it using `mainWindow` and `app.quit`. In `whenReady`, invoke `Menu.setApplicationMenu(null)`, create the main window, and create a tray using `assets/icon.png`. Add tray click and a “显示 TraeCheck” menu item that call `showWindow`, plus a “退出” item that calls `exit`. Bind `mainWindow.on('close', lifecycle.handleClose)`. On `activate`, restore an existing main window and create one only if none exists. Remove the non-macOS `window-all-closed` quit handler.

- [ ] **Step 4: Verify green and type safety**

Run: `node --test tests/window-lifecycle.test.cjs; pnpm exec vue-tsc --noEmit`

Expected: all lifecycle subtests pass and TypeScript emits no diagnostics.

- [ ] **Step 5: Commit**

Run: `git add electron/main.ts electron/window-lifecycle.cjs tests/window-lifecycle.test.cjs; git commit -m "feat: keep app running in tray"`

### Task 3: Validate the package

**Files:**
- Modify: none

- [ ] **Step 1: Build**

Run: `pnpm build:dir`

Expected: compilation and electron-builder complete successfully.

- [ ] **Step 2: Manually inspect lifecycle**

Run: launch `release/win-unpacked/TraeCheck.exe`.

Expected: no File menu; × hides the window; tray click restores and focuses it; tray Exit ends the process.

- [ ] **Step 3: Check source-only changes**

Run: `git status --short`

Expected: generated `dist/`, `dist-electron/`, and `release/` outputs are not staged.
