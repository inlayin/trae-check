const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')

test('add account modal imports the current TRAE desktop account', () => {
  const source = fs.readFileSync('src/components/AddAccountModal.vue', 'utf8')

  assert.match(source, /导入当前 TRAE 桌面账号/)
  assert.match(source, /importDesktopAccount/)
  assert.doesNotMatch(source, /粘贴从浏览器开发者工具中复制的完整 Cookie/)
})
