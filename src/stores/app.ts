import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Account {
  id: string
  name: string
  cookie: string
  createdAt: number
  lastCheckinAt?: number
  lastCheckinResult?: 'success' | 'failed' | 'pending'
  lastCheckinMessage?: string
  points?: number
  enabled: boolean
  desktopUserId?: string
  credentialStatus?: 'valid' | 'expiring' | 'expired'
}

export interface CheckinLog {
  id: string
  accountId: string
  accountName: string
  time: number
  result: 'success' | 'failed'
  message: string
  pointsGained?: number
}

export interface AppSettings {
  autoCheckin: boolean
  checkinTime: string
  retryCount: number
  retryDelay: number
  notifyOnSuccess: boolean
  notifyOnFailed: boolean
  checkinMode: 'webview' | 'api'
  apiConfig?: {
    checkinUrl: string
    method: 'GET' | 'POST'
    headers: Record<string, string>
    body?: Record<string, any>
  }
}

export const useAppStore = defineStore('app', () => {
  // 状态
  const accounts = ref<Account[]>([])
  const logs = ref<CheckinLog[]>([])
  const settings = ref<AppSettings | null>(null)
  const loading = ref(false)
  const checkingIn = ref(false)
  const nextRunTime = ref<string | null>(null)

  // 计算属性
  const enabledAccounts = computed(() => accounts.value.filter(a => a.enabled))
  const todayCheckedCount = computed(() => {
    const today = new Date().toDateString()
    return accounts.value.filter(a => {
      if (!a.lastCheckinAt) return false
      return new Date(a.lastCheckinAt).toDateString() === today && a.lastCheckinResult === 'success'
    }).length
  })

  // 方法
  async function fetchAccounts() {
    try {
      const result = await (window as any).electronAPI.getAccounts()
      accounts.value = result || []
    } catch (e) {
      console.error('获取账号列表失败:', e)
    }
  }

  async function addAccount(name: string, cookie: string) {
    try {
      const result = await (window as any).electronAPI.addAccount(name, cookie)
      await fetchAccounts()
      return result
    } catch (e) {
      console.error('添加账号失败:', e)
      throw e
    }
  }

  async function importDesktopAccount() {
    const result = await (window as any).electronAPI.importDesktopAccount()
    await fetchAccounts()
    return result
  }

  async function updateAccount(id: string, updates: Partial<Account>) {
    try {
      const result = await (window as any).electronAPI.updateAccount(id, updates)
      await fetchAccounts()
      return result
    } catch (e) {
      console.error('更新账号失败:', e)
      throw e
    }
  }

  async function deleteAccount(id: string) {
    try {
      await (window as any).electronAPI.deleteAccount(id)
      await fetchAccounts()
    } catch (e) {
      console.error('删除账号失败:', e)
      throw e
    }
  }

  async function checkinAccount(id: string) {
    try {
      checkingIn.value = true
      const result = await (window as any).electronAPI.checkinAccount(id)
      await fetchAccounts()
      await fetchLogs()
      return result
    } finally {
      checkingIn.value = false
    }
  }

  async function checkinAll() {
    try {
      checkingIn.value = true
      const result = await (window as any).electronAPI.checkinAll()
      await fetchAccounts()
      await fetchLogs()
      return result
    } finally {
      checkingIn.value = false
    }
  }

  async function getAccountPoints(id: string) {
    try {
      const result = await (window as any).electronAPI.getAccountPoints(id)
      await fetchAccounts()
      return result
    } catch (e) {
      console.error('获取积分失败:', e)
      throw e
    }
  }

  async function fetchLogs(limit = 100) {
    try {
      const result = await (window as any).electronAPI.getLogs(limit)
      logs.value = result || []
    } catch (e) {
      console.error('获取日志失败:', e)
    }
  }

  async function clearLogs() {
    try {
      await (window as any).electronAPI.clearLogs()
      await fetchLogs()
    } catch (e) {
      console.error('清空日志失败:', e)
      throw e
    }
  }

  async function fetchSettings() {
    try {
      const result = await (window as any).electronAPI.getSettings()
      settings.value = result
    } catch (e) {
      console.error('获取设置失败:', e)
    }
  }

  async function saveSettings(newSettings: Partial<AppSettings>) {
    try {
      const result = await (window as any).electronAPI.saveSettings(newSettings)
      settings.value = result
      await fetchNextRunTime()
      return result
    } catch (e) {
      console.error('保存设置失败:', e)
      throw e
    }
  }

  async function fetchNextRunTime() {
    try {
      const result = await (window as any).electronAPI.getNextRunTime()
      nextRunTime.value = result
    } catch (e) {
      console.error('获取下次执行时间失败:', e)
    }
  }

  async function getCookieFromLoginWindow() {
    try {
      const result = await (window as any).electronAPI.getCookieFromLoginWindow()
      return result
    } catch (e) {
      console.error('获取 Cookie 失败:', e)
      throw e
    }
  }

  // 初始化
  async function init() {
    loading.value = true
    try {
      await Promise.all([
        fetchAccounts(),
        fetchLogs(),
        fetchSettings(),
        fetchNextRunTime()
      ])
    } finally {
      loading.value = false
    }
  }

  return {
    // 状态
    accounts,
    logs,
    settings,
    loading,
    checkingIn,
    nextRunTime,
    // 计算属性
    enabledAccounts,
    todayCheckedCount,
    // 方法
    fetchAccounts,
    addAccount,
    importDesktopAccount,
    updateAccount,
    deleteAccount,
    checkinAccount,
    checkinAll,
    getAccountPoints,
    fetchLogs,
    clearLogs,
    fetchSettings,
    saveSettings,
    fetchNextRunTime,
    getCookieFromLoginWindow,
    init
  }
})
