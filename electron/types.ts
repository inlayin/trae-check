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

// 积分流水条目
export interface PointsTransaction {
  type: 'checkin' | 'usage' | 'gift' | 'other' // 按描述关键词分类
  amount: number // 正=获得, 负=消耗
  description: string
  timestamp: number
}

// 积分详情结果
export interface PointsDetailResult {
  success: boolean
  message: string
  source: 'api' | 'local' | 'none'
  totalPoints?: number
  transactions?: PointsTransaction[]
  localCheckinLogs?: CheckinLog[] // API 不可用时的回退
}

// 应用设置
export interface AppSettings {
  autoCheckin: boolean // 是否开启自动签到
  checkinTime: string // 自动签到时间 HH:mm
  retryCount: number // 失败重试次数
  retryDelay: number // 重试间隔（秒）
  notifyOnSuccess: boolean // 签到成功通知
  notifyOnFailed: boolean // 签到失败通知
  checkinMode: 'desktop' | 'webview' | 'api' // 签到模式：desktop=TRAE桌面凭证(推荐)，webview=浏览器模拟，api=自定义API
  apiConfig?: {
    // API 模式配置（用户自行抓包填写）
    checkinUrl: string
    method: 'GET' | 'POST'
    headers: Record<string, string>
    body?: Record<string, any>
  }
}

// 导出文件结构（version 2: 密码加密凭证）
export interface ExportData {
  version: number
  exportedAt: number
  appVersion: string
  containsCredentials: boolean
  credentialFormat?: 'encrypted' | 'plaintext'  // v2 新增，含凭证时为 'encrypted'
  count: number
  accounts: ExportAccount[]
}

// 导出文件中的账号（凭证字段用密码加密）
export interface ExportAccount {
  id: string
  name: string
  cookie: string
  createdAt: number
  enabled: boolean
  desktopUserId?: string
  credentialStatus?: string
  // v2: 用密码 AES-256-GCM 加密后的凭证密文（含 safeStorage 解密后的明文）
  encryptedCredentialData?: string
  // v1 兼容: safeStorage 密文（跨机器不可用）
  encryptedCredential?: string
}

// 导入预览结果（不含敏感凭证字段）
export interface ImportPreviewResult {
  success: boolean
  accounts?: ImportPreviewAccount[]
  invalidCount?: number
  message?: string
}

// 导入预览中的账号（不含 encryptedCredential，安全传给前端）
export interface ImportPreviewAccount {
  id: string
  name: string
  desktopUserId?: string
  createdAt: number
  enabled: boolean
  credentialStatus?: string
  hasCredential: boolean
  conflict: boolean
}

// 导入执行结果
export interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  message?: string
}

// 导出结果
export interface ExportResult {
  success: boolean
  path?: string
  message?: string
}

// 导入冲突处理策略
export type ImportStrategy = 'skip' | 'overwrite'

// 默认设置
export const defaultSettings: AppSettings = {
  autoCheckin: false,
  checkinTime: '08:00',
  retryCount: 3,
  retryDelay: 60,
  notifyOnSuccess: true,
  notifyOnFailed: true,
  checkinMode: 'desktop' // 默认使用 TRAE 桌面凭证 API 直连，避免 Webview 页面结构变化导致失效
}
