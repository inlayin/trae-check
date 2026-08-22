/**
 * Classify the payload returned by TRAE's check-in claim endpoint.
 *
 * Extracted as a pure module so the decision table is unit-testable and
 * shared by every check-in mode.
 */
function classifyCheckinClaim(data) {
  const d = data || {}
  const msg = String(d.message || d.msg || '')
  const lower = msg.toLowerCase()

  if (d.code === 0 || d.code === 200 || d.success === true || d.status === 'success') {
    return {
      kind: 'success',
      message: msg === 'success' || msg === '' ? '签到成功' : msg,
      points: d.data?.points || d.points || 200
    }
  }

  if (d.code === 1001) {
    return { kind: 'already', message: '今日已签到' }
  }

  // Server-side capacity/queue rejection (observed in the wild:
  // HTTP 200 {"code":9074,"message":"当前参与用户太多，请稍后再试"}).
  // This is transient: retrying later the same day succeeds.
  if (d.code === 9074 || msg.includes('参与用户太多') || lower.includes('too many')) {
    return { kind: 'transient', message: '签到排队限流，将在当天稍后自动重试', code: d.code }
  }

  const isDeviceLevelBlock =
    msg.includes('设备') ||
    lower.includes('device') ||
    lower.includes('machine')

  if (isDeviceLevelBlock) {
    return { kind: 'device_blocked', message: msg || '该设备今日签到次数已达上限，请稍后重试或检查账号凭证' }
  }

  const userAlreadyChecked =
    msg.includes('已签到') ||
    msg.includes('已经签到') ||
    msg.includes('明日再来') ||
    msg.includes('今日已完成') ||
    msg.includes('已领取') ||
    lower.includes('already') ||
    lower.includes('checked') ||
    lower.includes('claimed')

  if (userAlreadyChecked) {
    return { kind: 'already', message: '今日已签到' }
  }

  return { kind: 'failed', message: msg || '签到失败' }
}

module.exports = { classifyCheckinClaim }
