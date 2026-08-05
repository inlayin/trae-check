const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('login window can notify the main process after clicking the cookie button', () => {
  const ipcSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ipc.ts'), 'utf8')

  assert.match(
    ipcSource,
    /preload:\s*path\.join\(__dirname,\s*['"]login-preload\.js['"]\)/,
    'the login window must load a dedicated preload bridge'
  )
})
