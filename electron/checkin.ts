import { BrowserView, app, safeStorage } from 'electron'
import path from 'path'
import axios from 'axios'
import type { Account, AppSettings } from './types'
import { updateAccount, addLog, getSettings } from './store'
const { decryptCredential, encryptCredential, refreshCredential, publicCredentialStatus } = require('../electron/desktop-credentials.cjs') as {
  decryptCredential: (value: string, storage: typeof safeStorage) => any
  encryptCredential: (value: any, storage: typeof safeStorage) => string
  refreshCredential: (value: any) => Promise<any>
  publicCredentialStatus: (value: any) => { credentialStatus: 'valid' | 'expiring' | 'expired' }
}

const TRAE_CHECKIN_CLAIM_PATH = '/trae/api/v2/ug/checkin_credits/claim'
const TRAE_CREDITS_BALANCE_PATHS = [
  '/trae/api/v2/pay/user_current_entitlement_list',
  '/trae/api/v2/ug/credits/balance',
  '/trae/api/v2/ug/wallet/balance',
  '/trae/api/v2/ug/user/info',
  '/trae/api/v2/ug/credits',
  '/trae/api/v3/ug/credits/balance',
  '/trae/api/v3/ug/wallet/balance',
  '/trae/api/v3/ug/user/info'
]

type CheckinResult = { success: boolean; message: string; points?: number }

function apiSucceeded(data: any): boolean {
  return data?.code === 0 || data?.code === 200 || data?.success === true || data?.status === 'success'
}

/** Use the current TRAE desktop client's local login to call its check-in API. */
export async function checkinByTraeDesktop(account: Account): Promise<CheckinResult> {
  try {
    if (!account.encryptedCredential) return { success: false, message: '该账号尚未导入 TRAE 桌面凭证' }
    if (!safeStorage.isEncryptionAvailable()) return { success: false, message: '系统加密服务不可用，无法读取 TRAE 凭证' }
    let credential = decryptCredential(account.encryptedCredential, safeStorage)
    if (credential.expiresAt - Date.now() <= 5 * 60 * 1000) {
      try {
        credential = await refreshCredential(credential)
        updateAccount(account.id, {
          encryptedCredential: encryptCredential(credential, safeStorage),
          credentialStatus: publicCredentialStatus(credential).credentialStatus
        })
      } catch {
        updateAccount(account.id, { credentialStatus: 'expired' })
        return { success: false, message: '凭证已失效，请重新导入' }
      }
    }
    const { token, deviceId, host, userId } = credential
    // 为每个账号使用独立的 x-device-id，避免 TRAE 后端基于设备 ID 的每日去重。
    // TRAE claim 接口会按 x-device-id 做"一设备一天一次"拦截，多账号共享
    // 同一个 deviceId 时，第一个账号成功后其余账号会被拒绝。这里在原始 deviceId
    // 后拼接账号 userId，保证同一台机器上不同账号看起来像不同设备。
    // （refreshCredential 仍使用原始 credential.deviceId，不影响 token 续期）
    const perAccountDeviceId = userId ? `${deviceId}-${userId}` : deviceId
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Cloud-IDE-JWT ${token}`,
      'x-device-id': perAccountDeviceId
    }

    const claim = await axios.post(`${host}${TRAE_CHECKIN_CLAIM_PATH}`, {}, { headers, timeout: 30000 })
    if (apiSucceeded(claim.data)) {
      return {
        success: true,
        message: claim.data?.message === 'success' || claim.data?.msg === 'success' ? '签到成功' : (claim.data?.message || claim.data?.msg || '签到成功'),
        points: claim.data?.data?.points || claim.data?.points || 200
      }
    }

    // 领取接口返回失败时，判断是否属于"该账号今日已签到"（不是设备级去重拦截）。
    // 关键区分：包含"设备"/"device" 等设备级措辞 = 拦截失败；仅包含"已签到"/
    // "明日再来"/"已领取"等用户级措辞 = 账号自己确实已签到（success=true）。
    const claimMsg = claim.data?.message || claim.data?.msg || ''
    const lowerMsg = claimMsg.toLowerCase()
    const isDeviceLevelBlock =
      claimMsg.includes('设备') ||
      lowerMsg.includes('device') ||
      lowerMsg.includes('machine')
    const userAlreadyChecked =
      claim.data?.code === 1001 ||
      (!isDeviceLevelBlock && (
        claimMsg.includes('已签到') ||
        claimMsg.includes('已经签到') ||
        claimMsg.includes('明日再来') ||
        claimMsg.includes('今日已完成') ||
        claimMsg.includes('已领取') ||
        lowerMsg.includes('already') ||
        lowerMsg.includes('checked') ||
        lowerMsg.includes('claimed')
      ))
    if (userAlreadyChecked) {
      return { success: true, message: '今日已签到' }
    }

    // 设备级去重提示：说明独立 deviceId 策略仍被识别，作为失败返回以便重试
    if (isDeviceLevelBlock) {
      return { success: false, message: claimMsg || '该设备今日签到次数已达上限，请稍后重试或检查账号凭证' }
    }

    return { success: false, message: claimMsg || '签到失败' }
  } catch (err: any) {
    return { success: false, message: 'TRAE 桌面端签到失败: ' + (err.response?.data?.message || err.message || err) }
  }
}

/**
 * 递归查找所有数值字段，用于提取积分
 */
function findAllNumbers(obj: any, prefix = ''): Array<{ path: string; value: number }> {
  const results: Array<{ path: string; value: number }> = []
  if (!obj || typeof obj !== 'object') return results

  for (const [key, val] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key
    if (typeof val === 'number') {
      results.push({ path: fullPath, value: val })
    } else if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
      results.push({ path: fullPath, value: Number(val) })
    } else if (val && typeof val === 'object') {
      results.push(...findAllNumbers(val, fullPath))
    }
  }
  return results
}

function logAllResponseFields(value: any, prefix = ''): void {
  if (value === null || value === undefined) {
    console.log(`[Points][Field] ${prefix} = ${value}`)
    return
  }
  if (typeof value !== 'object') {
    console.log(`[Points][Field] ${prefix} = ${String(value)}`)
    return
  }
  for (const [key, child] of Object.entries(value)) {
    logAllResponseFields(child, prefix ? `${prefix}.${key}` : key)
  }
}

function extractTraeRemainingCredits(data: any): number | null {
  const packs = data?.user_entitlement_pack_list
  if (!Array.isArray(packs) || packs.length === 0) return null
  let remaining = 0
  let found = false
  for (const pack of packs) {
    const limit = pack?.entitlement_base_info?.quota?.credits_limit
    const used = pack?.usage?.credits_amount ?? 0
    if (typeof limit === 'number' && limit > 0) {
      found = true
      remaining += Math.max(limit - (typeof used === 'number' ? used : 0), 0)
    }
  }
  return found ? Math.round(remaining) : null
}

/**
 * 从响应数据中提取积分数值
 */
function extractPointsFromData(data: any): { points: number; path: string } | null {
  if (!data) return null

  // 优先匹配包含积分关键词的字段
  const creditKeywords = ['credit', 'point', 'balance', 'total', 'available', '剩余', '积分', '总额']
  const allNumbers = findAllNumbers(data)

  // 先按关键词匹配排序
  const keywordMatches = allNumbers.filter(item => {
    const lowerPath = item.path.toLowerCase()
    if (/(quota|limit|usage|amount|expire|end_time|start_time)/i.test(lowerPath)) return false
    return creditKeywords.some(kw => lowerPath.includes(kw.toLowerCase()))
  })

  if (keywordMatches.length > 0) {
    // 优先选择值较大的（更可能是总积分）
    keywordMatches.sort((a, b) => b.value - a.value)
    if (keywordMatches[0].value >= 100) return { points: keywordMatches[0].value, path: keywordMatches[0].path }
  }

  // 如果没有关键词匹配，返回所有数字中较大的（排除时间戳等小值）
  const largeNumbers = allNumbers.filter(item => item.value >= 100 && item.value < 1_000_000)
  if (largeNumbers.length > 0) {
    largeNumbers.sort((a, b) => b.value - a.value)
    return { points: largeNumbers[0].value, path: largeNumbers[0].path }
  }

  return null
}

/**
 * 使用 TRAE 桌面凭证获取用户总积分
 */
export async function getTotalPointsByTraeDesktop(account: Account): Promise<{ success: boolean; message: string; totalPoints?: number }> {
  try {
    if (!account.encryptedCredential) return { success: false, message: '该账号尚未导入 TRAE 桌面凭证' }
    if (!safeStorage.isEncryptionAvailable()) return { success: false, message: '系统加密服务不可用，无法读取 TRAE 凭证' }

    let credential = decryptCredential(account.encryptedCredential, safeStorage)
    if (credential.expiresAt - Date.now() <= 5 * 60 * 1000) {
      try {
        credential = await refreshCredential(credential)
        updateAccount(account.id, {
          encryptedCredential: encryptCredential(credential, safeStorage),
          credentialStatus: publicCredentialStatus(credential).credentialStatus
        })
      } catch {
        updateAccount(account.id, { credentialStatus: 'expired' })
        return { success: false, message: '凭证已失效，请重新导入' }
      }
    }

    const { token, deviceId, host } = credential
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Cloud-IDE-JWT ${token}`,
      'x-device-id': deviceId
    }

    console.log('[Points] 使用 API Host:', host)
    const allResults: Array<{ url: string; data: any; points?: number; path?: string }> = []

    // 不使用 checkin_credits/status 的 credits 字段：那只是每日签到奖励，不是总积分。
    // 仅尝试余额接口，避免把每日 200 分误显示成账号总积分。
    for (const apiPath of TRAE_CREDITS_BALANCE_PATHS) {
      const url = `${host}${apiPath}`
      try {
        console.log('[Points] 尝试接口:', url)
        let response
        try {
          response = apiPath.includes('user_current_entitlement_list')
            ? await axios.post(url, { require_usage: true }, { headers, timeout: 15000 })
            : await axios.get(url, { headers, timeout: 15000 })
        } catch {
          response = await axios.post(url, {}, { headers, timeout: 15000 })
        }
        console.log('[Points] 接口完整响应:', url, '->', JSON.stringify(response.data))
        if (apiPath.includes('user_current_entitlement_list')) logAllResponseFields(response.data)
        const extracted = extractPointsFromData(response.data)
        if (apiPath.includes('user_current_entitlement_list')) {
          // This endpoint exposes entitlement quotas (2000/500/200), not the avatar-menu balance.
          const remaining = extractTraeRemainingCredits(response.data)
          if (remaining !== null) return { success: true, message: '获取积分成功', totalPoints: remaining }
          console.log('[Points] entitlement response is not account balance; skipping')
          allResults.push({ url, data: response.data })
          continue
        }
        if (extracted) {
          console.log('[Points] 提取到积分:', extracted.points, '路径:', extracted.path)
          return { success: true, message: '获取积分成功', totalPoints: extracted.points }
        }
        allResults.push({ url, data: response.data })
      } catch (e: any) {
        console.log('[Points] 接口失败:', url, '->', e?.message || e)
      }
    }

    // 输出所有接口的数值字段，帮助调试
    console.log('[Points] 所有接口返回的数值字段:')
    for (const result of allResults) {
      const nums = findAllNumbers(result.data)
      if (nums.length > 0) {
        console.log(`  ${result.url}:`)
        for (const num of nums.slice(0, 10)) {
          console.log(`    ${num.path} = ${num.value}`)
        }
      }
    }

    return { success: false, message: '未能获取到积分信息，请查看控制台日志' }
  } catch (err: any) {
    console.error('[Points] 获取积分异常:', err)
    return { success: false, message: '获取积分失败: ' + (err.response?.data?.message || err.message || err) }
  }
}

// 生成唯一 ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

/**
 * Webview 模式签到
 * 使用 BrowserView 加载页面，注入 JS 执行签到
 */
export async function checkinByWebview(account: Account): Promise<{ success: boolean; message: string; points?: number }> {
  return new Promise((resolve) => {
    const settings = getSettings()
    let resolved = false

    // 创建隐藏的 BrowserView
    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: `persist:trae-${account.id}`
      }
    })

    // 设置 cookie
    if (account.cookie) {
      const cookies = parseCookieString(account.cookie)
      cookies.forEach(cookie => {
        view.webContents.session.cookies.set({
          url: 'https://work.trae.cn',
          name: cookie.name,
          value: cookie.value,
          domain: '.trae.cn',
          path: '/'
        }).catch(() => {})
      })
    }

    // 超时处理
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        cleanup()
        resolve({ success: false, message: '签到超时（120秒）' })
      }
    }, 120000)

    function cleanup() {
      clearTimeout(timeout)
    }

    // 页面加载完成后执行签到逻辑
    view.webContents.on('did-finish-load', async () => {
      try {
        // 等待页面渲染完成
        await sleep(3000)

        // 注入 JS 查找并点击签到按钮
        const result = await view.webContents.executeJavaScript(`
          (function() {
            // 尝试多种选择器查找签到按钮
            const selectors = [
              '[class*="checkin"]',
              '[class*="signin"]',
              '[class*="sign-in"]',
              '.checkin-btn',
              '.signin-btn',
              '#checkin-btn',
              '#signin-btn'
            ];

            let checkinBtn = null;

            // 方法1: 通过文本内容查找
            const allButtons = document.querySelectorAll('button, div[role="button"], a');
            for (const btn of allButtons) {
              const text = btn.textContent?.trim() || '';
              if (text.includes('签到') || text.includes('立即签到') || text.includes('每日签到')) {
                checkinBtn = btn;
                break;
              }
            }

            // 方法2: 通过 class 名查找
            if (!checkinBtn) {
              for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el) {
                  checkinBtn = el;
                  break;
                }
              }
            }

            if (!checkinBtn) {
              return { found: false, message: '未找到签到按钮' };
            }

            // 检查是否已经签到
            const btnText = checkinBtn.textContent?.trim() || '';
            if (btnText.includes('已签到') || btnText.includes('明日再来') || btnText.includes('已完成')) {
              return { found: true, alreadyChecked: true, message: '今日已签到' };
            }

            // 点击签到按钮
            checkinBtn.click();

            return { found: true, alreadyChecked: false, message: '已点击签到按钮' };
          })()
        `)

        if (!result.found) {
          // 尝试在更多位置查找，比如弹窗、侧边栏等
          await sleep(2000)
          const result2 = await view.webContents.executeJavaScript(`
            (function() {
              // 查找所有包含"签到"的元素
              const allElements = document.querySelectorAll('*');
              for (const el of allElements) {
                if (el.children.length === 0) {
                  const text = el.textContent?.trim() || '';
                  if ((text === '签到' || text === '立即签到') && el.offsetParent !== null) {
                    el.click();
                    return { found: true, message: '找到并点击签到按钮' };
                  }
                }
              }
              return { found: false, message: '未找到签到按钮' };
            })()
          `)

          if (!result2.found) {
            if (!resolved) {
              resolved = true
              cleanup()
              resolve({ success: false, message: '未找到签到按钮，请确认页面是否正确或使用 API 模式' })
            }
            return
          }
        }

        if (result.alreadyChecked) {
          if (!resolved) {
            resolved = true
            cleanup()
            resolve({ success: true, message: '今日已签到' })
          }
          return
        }

        // 等待签到结果
        await sleep(3000)

        // 检查签到结果
        const checkResult = await view.webContents.executeJavaScript(`
          (function() {
            // 查找成功提示
            const successTexts = ['签到成功', '签到完成', '+200', '获得', '积分'];
            const allElements = document.querySelectorAll('*');

            for (const el of allElements) {
              if (el.children.length <= 2) {
                const text = el.textContent?.trim() || '';
                if (text.includes('签到成功') || text.includes('签到完成')) {
                  return { success: true, message: text };
                }
                if (text.includes('已签到') || text.includes('明日再来')) {
                  return { success: true, message: '签到成功（已签到状态）' };
                }
              }
            }

            // 检查按钮状态变化
            const buttons = document.querySelectorAll('button, div[role="button"]');
            for (const btn of buttons) {
              const text = btn.textContent?.trim() || '';
              if (text.includes('已签到') || text.includes('明日再来')) {
                return { success: true, message: '签到成功' };
              }
            }

            return { success: false, message: '未检测到签到结果' };
          })()
        `)

        if (!resolved) {
          resolved = true
          cleanup()
          resolve({
            success: checkResult.success,
            message: checkResult.message,
            points: checkResult.success ? 200 : undefined
          })
        }

      } catch (err: any) {
        if (!resolved) {
          resolved = true
          cleanup()
          resolve({ success: false, message: '签到执行出错: ' + (err.message || err) })
        }
      }
    })

    // 加载 Trae Work 页面
    view.webContents.loadURL('https://work.trae.cn/').catch((err) => {
      if (!resolved) {
        resolved = true
        cleanup()
        resolve({ success: false, message: '页面加载失败: ' + err.message })
      }
    })
  })
}

/**
 * API 模式签到
 * 用户自行配置 API 地址和参数
 */
export async function checkinByApi(account: Account, settings: AppSettings): Promise<{ success: boolean; message: string; points?: number }> {
  if (!settings.apiConfig) {
    return { success: false, message: '未配置 API 签到参数' }
  }

  try {
    const { checkinUrl, method, headers, body } = settings.apiConfig

    // 合并账号 cookie 到请求头
    const finalHeaders = {
      ...headers,
      'Cookie': account.cookie || headers['Cookie'] || ''
    }

    const response = await axios({
      url: checkinUrl,
      method: method.toLowerCase(),
      headers: finalHeaders,
      data: method === 'POST' ? body : undefined,
      params: method === 'GET' ? body : undefined,
      timeout: 30000
    })

    // 尝试解析返回结果
    const data = response.data

    // 常见成功判断
    if (data?.code === 0 || data?.code === 200 || data?.success === true || data?.status === 'success') {
      return {
        success: true,
        message: data?.message || data?.msg || '签到成功',
        points: data?.data?.points || data?.points || 200
      }
    }

    // 已签到判断
    if (data?.code === 1001 || data?.message?.includes('已签到') || data?.msg?.includes('已签到')) {
      return { success: true, message: '今日已签到' }
    }

    return {
      success: false,
      message: data?.message || data?.msg || '签到失败: ' + JSON.stringify(data).substring(0, 200)
    }

  } catch (err: any) {
    return {
      success: false,
      message: '请求失败: ' + (err.response?.data?.message || err.message || err)
    }
  }
}

/**
 * 执行单个账号签到
 */
export async function performCheckin(account: Account): Promise<{ success: boolean; message: string; points?: number }> {
  const settings = getSettings()
  let result: { success: boolean; message: string; points?: number }

  if (settings.checkinMode === 'api' && settings.apiConfig) {
    result = await checkinByApi(account, settings)
  } else {
    result = await checkinByTraeDesktop(account)
  }

  // 更新账号状态（不更新 points，避免中间假值导致闪烁，真实积分由后续 getAccountPoints 统一更新）
  updateAccount(account.id, {
    lastCheckinAt: Date.now(),
    lastCheckinResult: result.success ? 'success' : 'failed',
    lastCheckinMessage: result.message
  })

  // 记录日志
  addLog({
    id: generateId(),
    accountId: account.id,
    accountName: account.name,
    time: Date.now(),
    result: result.success ? 'success' : 'failed',
    message: result.message,
    pointsGained: result.points
  })

  return result
}

/**
 * 执行所有启用的账号签到
 */
export async function performAllCheckin(): Promise<Array<{ account: Account; result: { success: boolean; message: string; points?: number } }>> {
  const { getAccounts } = require('./store')
  const accounts = getAccounts().filter((a: Account) => a.enabled)
  const results: Array<{ account: Account; result: any }> = []

  for (const account of accounts) {
    const settings = getSettings()
    let lastError = ''

    // 重试机制
    for (let i = 0; i <= settings.retryCount; i++) {
      const result = await performCheckin(account)
      if (result.success) {
        results.push({ account, result })
        lastError = ''
        break
      }
      lastError = result.message
      if (i < settings.retryCount) {
        await sleep(settings.retryDelay * 1000)
      }
    }

    if (lastError) {
      results.push({
        account,
        result: { success: false, message: lastError }
      })
    }

    // 账号之间间隔
    await sleep(2000)
  }

  return results
}

// 工具函数
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseCookieString(cookieStr: string): Array<{ name: string; value: string }> {
  return cookieStr.split(';').map(pair => {
    const [name, ...valueParts] = pair.trim().split('=')
    return {
      name: name?.trim() || '',
      value: valueParts.join('=')?.trim() || ''
    }
  }).filter(c => c.name)
}
