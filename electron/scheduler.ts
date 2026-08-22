import cron from 'node-cron'
import { Notification } from 'electron'
import { getSettings, getAccounts } from './store'
import { performAllCheckin, performCheckin } from './checkin'
import type { Account, AppSettings } from './types'

let cronJob: cron.ScheduledTask | null = null
let lastCronExpression: string = ''

// ===== 同日限流重试 =====
// TRAE 签到接口偶发服务端排队限流（code 9074"参与用户太多"），短间隔重试无效，
// 但当天晚些时候重试通常可成功。每日 cron 只跑一次，撞上限流就会丢掉当天签到，
// 因此这里维护一个当天内的低频重试循环，直到成功或跨天。
const TRANSIENT_RETRY_INTERVAL_MS = 10 * 60 * 1000
let transientRetryTimer: NodeJS.Timeout | null = null
const transientPendingIds = new Set<string>()
let transientRetryDay = ''

/**
 * 判断当前 cronJob 是否处于运行中
 */
function isCronRunning(): boolean {
  if (!cronJob) return false
  // node-cron ScheduledTask 没有直接的 running 字段，但可以通过 status 判断
  // 也可以通过校验是否存在且之前没有 stop：我们在 stopScheduler 中置 null，
  // 这里额外兜底：如果存在则认为是运行状态，配合日志判断。
  return !!cronJob
}

/**
 * 启动定时签到任务
 */
export function startScheduler() {
  stopScheduler()

  const settings: AppSettings = getSettings()
  console.log(
    `[Scheduler] startScheduler 被调用: autoCheckin=${settings.autoCheckin}, ` +
    `checkinTime=${settings.checkinTime}, retryCount=${settings.retryCount}, ` +
    `enabledAccounts=${getAccounts().filter((a: Account) => a.enabled).length}`
  )

  if (!settings.autoCheckin) {
    console.log('[Scheduler] autoCheckin=false，跳过启动定时任务')
    return
  }

  // 解析时间 HH:mm，做健壮性校验
  const timeParts = settings.checkinTime.split(':')
  if (timeParts.length !== 2) {
    console.error(`[Scheduler] checkinTime 格式无效: ${settings.checkinTime}，期望 HH:mm`)
    return
  }
  const hour = Number(timeParts[0])
  const minute = Number(timeParts[1])
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    console.error(`[Scheduler] checkinTime 解析值无效: hour=${hour}, minute=${minute}`)
    return
  }
  console.log(`[Scheduler] 解析成功: hour=${hour}, minute=${minute}`)

  // 创建 cron 表达式（分 时 日 月 周）
  lastCronExpression = `${minute} ${hour} * * *`

  cronJob = cron.schedule(lastCronExpression, () => {
    const startMs = Date.now()
    console.log(`[Scheduler] ===== Cron 触发 ===== 开始执行自动签到任务 @ ${new Date().toISOString()}`)
    Promise.resolve()
      .then(() => runAutoCheckin())
      .catch((err) => {
        console.error('[Scheduler] runAutoCheckin 外层兜底捕获异常:', err)
      })
      .finally(() => {
        const costMs = Date.now() - startMs
        console.log(`[Scheduler] ===== Cron 结束 ===== 总耗时 ${costMs}ms`)
      })
  }, {
    timezone: 'Asia/Shanghai',
    scheduled: true
  })

  console.log(
    `[Scheduler] 定时任务已启动: cronExpression="${lastCronExpression}", ` +
    `timezone=Asia/Shanghai, 每天 ${settings.checkinTime} 执行`
  )
  const nextByApi = (cronJob as any).nextDates?.(1)?.[0]
  if (nextByApi) {
    console.log(`[Scheduler] cron.nextDates 显示下次执行时间: ${nextByApi.toDate()?.toISOString?.() ?? nextByApi}`)
  }
}

/**
 * 停止定时任务
 */
export function stopScheduler() {
  stopTransientRetry()
  if (cronJob) {
    try {
      cronJob.stop()
      console.log('[Scheduler] 已调用 cronJob.stop()')
    } catch (e) {
      console.error('[Scheduler] cronJob.stop() 异常:', e)
    }
    cronJob = null
    lastCronExpression = ''
    console.log('[Scheduler] 定时任务已停止，已清空 cronJob 引用')
  }
}

/**
 * 重启定时任务（设置变更后调用）
 */
export function restartScheduler() {
  console.log('[Scheduler] restartScheduler 被调用（settings 变更触发）')
  startScheduler()
}

function stopTransientRetry() {
  if (transientRetryTimer) {
    clearInterval(transientRetryTimer)
    transientRetryTimer = null
    console.log('[Scheduler][TransientRetry] 同日限流重试循环已停止')
  }
}

function ensureTransientRetry() {
  const settings: AppSettings = getSettings()
  if (!settings.autoCheckin) {
    stopTransientRetry()
    return
  }
  if (transientRetryTimer) return

  transientRetryDay = new Date().toISOString().slice(0, 10)
  console.log(
    `[Scheduler][TransientRetry] 启动同日限流重试: 账号 ${transientPendingIds.size} 个, ` +
    `间隔 ${TRANSIENT_RETRY_INTERVAL_MS / 60000} 分钟, 截止当日 23:45`
  )
  transientRetryTimer = setInterval(() => {
    void runTransientRetryPass()
  }, TRANSIENT_RETRY_INTERVAL_MS)
}

async function runTransientRetryPass() {
  const now = new Date()
  const day = now.toISOString().slice(0, 10)
  if (day !== transientRetryDay || (now.getHours() === 23 && now.getMinutes() >= 45)) {
    console.log('[Scheduler][TransientRetry] 当日重试窗口结束，停止重试')
    stopTransientRetry()
    transientPendingIds.clear()
    return
  }

  const settings: AppSettings = getSettings()
  if (!settings.autoCheckin) {
    stopTransientRetry()
    return
  }

  const accounts = getAccounts().filter((a: Account) => transientPendingIds.has(a.id) && a.enabled)
  if (accounts.length === 0) {
    stopTransientRetry()
    transientPendingIds.clear()
    return
  }

  console.log(`[Scheduler][TransientRetry] 重试 ${accounts.length} 个限流账号`)
  try {
    const results = await performAllCheckin(accounts as Account[])
    for (const r of results) {
      if ((r.result as any)?.transient && !r.result.success) continue
      // 成功或确定性失败都不再重试
      transientPendingIds.delete(r.account.id)
    }
    if (transientPendingIds.size === 0) {
      console.log('[Scheduler][TransientRetry] 全部账号已处理完毕，停止重试')
      stopTransientRetry()
    }
  } catch (e) {
    console.error('[Scheduler][TransientRetry] 重试执行异常:', e)
  }
}

/**
 * 执行自动签到
 */
async function runAutoCheckin() {
  let settings: AppSettings
  let accounts: Account[]
  try {
    settings = getSettings()
    accounts = getAccounts().filter((a: Account) => a.enabled)
  } catch (e) {
    console.error('[Scheduler] 读取 settings/accounts 失败，中止本次签到:', e)
    try {
      new Notification({
        title: 'Trae 签到异常',
        body: '读取本地配置失败，请检查数据文件或重启应用',
        silent: false
      }).show()
    } catch { /* ignore notification failure */ }
    return
  }

  if (accounts.length === 0) {
    console.log('[Scheduler] 没有启用的账号，跳过本次签到')
    return
  }
  console.log(`[Scheduler] 本次准备签到 ${accounts.length} 个启用账号`)

  try {
    const results = await performAllCheckin()

    const successCount = results.filter(r => r.result.success).length
    const failedCount = results.filter(r => !r.result.success).length

    console.log(`[Scheduler] 签到完成: 成功 ${successCount} 个, 失败 ${failedCount} 个`)
    results.forEach((r, i) => {
      console.log(
        `  [${i + 1}] ${r.account.name}: ${r.result.success ? '✅' : '❌'} ${r.result.message}` +
        (r.result.points ? ` (+${r.result.points}分)` : '')
      )
    })

    // 同日限流重试：把命中服务端限流的账号加入当天低频重试队列，
    // 已成功或确定性失败的账号移出队列
    const transientIds = results.filter(r => (r.result as any)?.transient && !r.result.success).map(r => r.account.id)
    for (const r of results) {
      if (!((r.result as any)?.transient && !r.result.success)) {
        transientPendingIds.delete(r.account.id)
      }
    }
    for (const id of transientIds) transientPendingIds.add(id)
    if (transientPendingIds.size > 0) {
      ensureTransientRetry()
    } else if (transientRetryTimer) {
      stopTransientRetry()
    }

    // 发送通知
    if (settings.notifyOnSuccess && successCount > 0) {
      try {
        new Notification({
          title: 'Trae 签到成功',
          body: `成功签到 ${successCount} 个账号${failedCount > 0 ? `，失败 ${failedCount} 个` : ''}`,
          silent: false
        }).show()
      } catch (e) {
        console.error('[Scheduler] 发送成功通知失败:', e)
      }
    }

    if (settings.notifyOnFailed && failedCount > 0) {
      try {
        new Notification({
          title: 'Trae 签到失败',
          body: `${failedCount} 个账号签到失败，请查看日志`,
          silent: false
        }).show()
      } catch (e) {
        console.error('[Scheduler] 发送失败通知失败:', e)
      }
    }

  } catch (err) {
    console.error('[Scheduler] 自动签到执行出错:', err)

    if (settings.notifyOnFailed) {
      try {
        new Notification({
          title: 'Trae 签到异常',
          body: '自动签到执行出错，请检查日志',
          silent: false
        }).show()
      } catch (e) {
        console.error('[Scheduler] 发送异常通知失败:', e)
      }
    }
  }
}

/**
 * 获取调度器完整健康状态（提供给前端诊断面板）
 */
export interface SchedulerStatus {
  running: boolean
  autoCheckin: boolean
  checkinTime: string
  cronExpression: string
  nextRunISO: string | null
}

export function getSchedulerStatus(): SchedulerStatus {
  const settings = getSettings()
  const nextRun = getNextRunTime()
  return {
    running: isCronRunning(),
    autoCheckin: !!settings.autoCheckin,
    checkinTime: settings.checkinTime,
    cronExpression: lastCronExpression,
    nextRunISO: nextRun ? nextRun.toISOString() : null
  }
}

/**
 * 获取下次执行时间
 * 优先使用 node-cron 提供的 nextDates() 作为权威值，
 * 回退到手动计算（基于 settings + Asia/Shanghai 时区）。
 */
export function getNextRunTime(): Date | null {
  const settings = getSettings()

  // 策略 1: 使用 node-cron 官方 API 计算（真实调度依据）
  if (cronJob) {
    try {
      const nextDates = (cronJob as any).nextDates?.(1)
      if (Array.isArray(nextDates) && nextDates.length > 0) {
        const nextDate = typeof nextDates[0].toDate === 'function'
          ? nextDates[0].toDate() as Date
          : new Date(nextDates[0])
        if (nextDate instanceof Date && !Number.isNaN(nextDate.getTime())) {
          return nextDate
        }
      }
    } catch (e) {
      console.warn('[Scheduler] 调用 cronJob.nextDates 失败，回退手动计算:', e)
    }
  }

  // 策略 2: 手动计算 fallback
  if (!settings.autoCheckin) {
    return null
  }
  const [hour, minute] = settings.checkinTime.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null
  }
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0)
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }
  return next
}
