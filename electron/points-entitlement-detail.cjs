function formatCredits(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function classifyEntitlement(name) {
  const lower = String(name || '').toLowerCase()
  if (lower.includes('签到') || lower.includes('checkin') || lower.includes('daily')) return 'checkin'
  if (lower.includes('赠送') || lower.includes('福利') || lower.includes('奖励') || lower.includes('bonus') || lower.includes('gift')) return 'gift'
  return 'other'
}

function extractEntitlementDetails(data) {
  const packs = data?.user_entitlement_pack_list
  if (!Array.isArray(packs)) return null

  const transactions = []
  let totalPoints = 0
  for (const pack of packs) {
    const base = pack?.entitlement_base_info
    const limit = Number(base?.quota?.credits_limit)
    if (!Number.isFinite(limit) || limit <= 0) continue
    const used = Number(pack?.usage?.credits_amount ?? 0)
    const normalizedUsed = Number.isFinite(used) && used > 0 ? used : 0
    const remaining = Math.max(limit - normalizedUsed, 0)
    const name = String(pack?.display_desc || pack?.group_name || base?.product_extra?.package_extra?.package_name || '积分权益')
    const startTime = Number(base?.start_time)
    const expireTime = Number(pack?.expire_time ?? base?.end_time)
    totalPoints += remaining
    transactions.push({
      type: classifyEntitlement(name),
      amount: Math.round(remaining),
      description: `${name}：总额 ${formatCredits(limit)} 分，已用 ${formatCredits(normalizedUsed)} 分，剩余 ${formatCredits(remaining)} 分`,
      timestamp: Number.isFinite(startTime) && startTime > 0
        ? startTime * 1000
        : (Number.isFinite(expireTime) && expireTime > 0 ? expireTime * 1000 : Date.now())
    })
  }
  return { totalPoints: Math.round(totalPoints), transactions }
}

module.exports = { extractEntitlementDetails }
