const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('check-in page script uses only native CSS selectors', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'checkin.ts'), 'utf8')

  assert.doesNotMatch(
    source,
    /:contains\(/,
    'querySelector does not support the jQuery-only :contains pseudo-selector'
  )
})
