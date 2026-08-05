import cron from 'node-cron'
import { Notification } from 'electron'
import { getSettings, getAccounts } from './store'
import { performAllCheckin } from './checkin'
import type { Account } from './types'

let cronJob: cron.ScheduledTask | null = null

/**
 * 启动定时签到任务
 */
export function startScheduler() {
  stopScheduler()

  const settings = getSettings()

  if (!settings.autoCheckin) {
    return
  }

  // 解析时间 HH:mm
  const [hour, minute] = settings.checkinTime.split(':').map(Number)

  // 创建 cron 表达式（分 时 日 月 周）
  const cronExpression = `${minute} ${hour} * * *`

  cronJob = cron.schedule(cronExpression, async () => {
    console.log('[Scheduler] 开始执行自动签到任务')
    await runAutoCheckin()
  }, {
    timezone: 'Asia/Shanghai'
  })

  console.log(`[Scheduler] 定时任务已启动，每天 ${settings.checkinTime} 执行`)
}

/**
 * 停止定时任务
 */
export function stopScheduler() {
  if (cronJob) {
    cronJob.stop()
    cronJob = null
    console.log('[Scheduler] 定时任务已停止')
  }
}

/**
 * 重启定时任务（设置变更后调用）
 */
export function restartScheduler() {
  startScheduler()
}

/**
 * 执行自动签到
 */
async function runAutoCheckin() {
  const settings = getSettings()
  const accounts = getAccounts().filter((a: Account) => a.enabled)

  if (accounts.length === 0) {
    console.log('[Scheduler] 没有启用的账号，跳过签到')
    return
  }

  try {
    const results = await performAllCheckin()

    const successCount = results.filter(r => r.result.success).length
    const failedCount = results.filter(r => !r.result.success).length

    console.log(`[Scheduler] 签到完成: 成功 ${successCount} 个, 失败 ${failedCount} 个`)

    // 发送通知
    if (settings.notifyOnSuccess && successCount > 0) {
      new Notification({
        title: 'Trae 签到成功',
        body: `成功签到 ${successCount} 个账号${failedCount > 0 ? `，失败 ${failedCount} 个` : ''}`,
        silent: false
      }).show()
    }

    if (settings.notifyOnFailed && failedCount > 0) {
      new Notification({
        title: 'Trae 签到失败',
        body: `${failedCount} 个账号签到失败，请查看日志`,
        silent: false
      }).show()
    }

  } catch (err) {
    console.error('[Scheduler] 自动签到执行出错:', err)

    if (settings.notifyOnFailed) {
      new Notification({
        title: 'Trae 签到异常',
        body: '自动签到执行出错，请检查日志',
        silent: false
      }).show()
    }
  }
}

/**
 * 获取下次执行时间
 */
export function getNextRunTime(): Date | null {
  if (!cronJob) {
    return null
  }

  const settings = getSettings()
  const now = new Date()
  const [hour, minute] = settings.checkinTime.split(':').map(Number)

  const next = new Date()
  next.setHours(hour, minute, 0, 0)

  if (next <= now) {
    next.setDate(next.getDate() + 1)
  }

  return next
}
