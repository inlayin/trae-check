const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('custom titlebar provides branded draggable area and accessible window controls', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/AppTitleBar.vue'), 'utf8')

  assert.match(source, /assets\/icon\.png/)
  assert.match(source, /TraeCheck/)
  assert.match(source, /每日自动签到工具/)
  assert.match(source, /-webkit-app-region:\s*drag/)
  assert.match(source, /electronAPI\.windowControls\.minimize/)
  assert.match(source, /aria-label="最小化"/)
  assert.match(source, /aria-label=.*最大化/)
  assert.match(source, /aria-label="关闭"/)
  assert.match(source, /-webkit-app-region:\s*no-drag/)
})

test('sidebar does not duplicate the titlebar branding', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/App.vue'), 'utf8')

  assert.doesNotMatch(source, /class="sidebar-header"/)
  assert.doesNotMatch(source, /class="logo-text"/)
  assert.doesNotMatch(source, /class="logo-desc"/)
})

test('main-process build emits the window controls module required at runtime', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '../dist-electron/window-controls.cjs')))
})
