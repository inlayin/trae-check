const assert = require('node:assert/strict')
const test = require('node:test')

const { classifyCheckinClaim } = require('../electron/checkin-response.cjs')

test('classifies a successful claim', () => {
  const v = classifyCheckinClaim({ code: 0, message: 'success', data: { points: 200 } })
  assert.equal(v.kind, 'success')
  assert.equal(v.points, 200)
})

test('classifies success with explicit message text', () => {
  const v = classifyCheckinClaim({ code: 200, message: '签到成功，获得200积分' })
  assert.equal(v.kind, 'success')
  assert.equal(v.message, '签到成功，获得200积分')
})

test('classifies code 1001 as already checked', () => {
  const v = classifyCheckinClaim({ code: 1001 })
  assert.equal(v.kind, 'already')
})

test('classifies user-level already-checked wording as already checked', () => {
  for (const message of ['今日已签到', '明日再来', '已领取过了', 'already claimed']) {
    const v = classifyCheckinClaim({ code: -1, message })
    assert.equal(v.kind, 'already', message)
  }
})

test('classifies code 9074 capacity rejection as transient', () => {
  const v = classifyCheckinClaim({ code: 9074, message: '当前参与用户太多，请稍后再试' })
  assert.equal(v.kind, 'transient')
  assert.equal(v.code, 9074)
})

test('classifies capacity wording without known code as transient', () => {
  const v = classifyCheckinClaim({ code: -1, message: '当前参与用户太多，请稍后再试' })
  assert.equal(v.kind, 'transient')
})

test('device-level block still takes precedence over generic failure', () => {
  const v = classifyCheckinClaim({ code: -2, message: '该设备今日已签到过' })
  assert.equal(v.kind, 'device_blocked')
})

test('unknown failures stay failed with server message', () => {
  const v = classifyCheckinClaim({ code: -3, message: '账号异常' })
  assert.equal(v.kind, 'failed')
  assert.equal(v.message, '账号异常')
})
