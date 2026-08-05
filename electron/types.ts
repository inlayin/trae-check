// 账号信息
export interface Account {
  id: string
  name: string // 账号备注名
  cookie: string // 登录 cookie
  createdAt: number
  lastCheckinAt?: number // 上次签到时间
  lastCheckinResult?: 'success' | 'failed' | 'pending'
  lastCheckinMessage?: string
  points?: number // 当前积分
  enabled: boolean // 是否启用自动签到
  desktopUserId?: string
  encryptedCredential?: string
  credentialStatus?: 'valid' | 'expiring' | 'expired'
}

// 签到日志
export interface CheckinLog {
  id: string
  accountId: string
  accountName: string
  time: number
  result: 'success' | 'failed'
  message: string
  pointsGained?: number
}

// 应用设置
export interface AppSettings {
  autoCheckin: boolean // 是否开启自动签到
  checkinTime: string // 自动签到时间 HH:mm
  retryCount: number // 失败重试次数
  retryDelay: number // 重试间隔（秒）
  notifyOnSuccess: boolean // 签到成功通知
  notifyOnFailed: boolean // 签到失败通知
  checkinMode: 'webview' | 'api' // 签到模式
  apiConfig?: {
    // API 模式配置（用户自行抓包填写）
    checkinUrl: string
    method: 'GET' | 'POST'
    headers: Record<string, string>
    body?: Record<string, any>
  }
}

// 默认设置
export const defaultSettings: AppSettings = {
  autoCheckin: false,
  checkinTime: '08:00',
  retryCount: 3,
  retryDelay: 60,
  notifyOnSuccess: true,
  notifyOnFailed: true,
  checkinMode: 'webview'
}
