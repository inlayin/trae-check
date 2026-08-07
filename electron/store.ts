import Store from 'electron-store'
import type { Account, CheckinLog, AppSettings, ImportStrategy } from './types'
import { defaultSettings } from './types'
const { upsertDesktopAccount: mergeDesktopAccount } = require('../electron/desktop-credentials.cjs') as { upsertDesktopAccount: (accounts: Account[], incoming: Account) => Account[] }

// 数据存储 schema
interface StoreSchema {
  accounts: Account[]
  logs: CheckinLog[]
  settings: AppSettings
}

let store: Store<StoreSchema> | null = null

export function initStore() {
  store = new Store<StoreSchema>({
    name: 'trae-check-data',
    defaults: {
      accounts: [],
      logs: [],
      settings: defaultSettings
    }
  })
  return store
}

export function getStore(): Store<StoreSchema> {
  if (!store) {
    return initStore()
  }
  return store
}

// 账号相关操作
export function getAccounts(): Account[] {
  return getStore().get('accounts', [])
}

export function saveAccount(account: Account): void {
  const accounts = getAccounts()
  const index = accounts.findIndex(a => a.id === account.id)
  if (index >= 0) {
    accounts[index] = account
  } else {
    accounts.push(account)
  }
  getStore().set('accounts', accounts)
}

export function upsertDesktopAccount(account: Account): Account {
  const accounts = mergeDesktopAccount(getAccounts(), account)
  getStore().set('accounts', accounts)
  return accounts.find((item: Account) => item.id === account.id || item.desktopUserId === account.desktopUserId)!
}

export function deleteAccount(id: string): void {
  const accounts = getAccounts().filter(a => a.id !== id)
  getStore().set('accounts', accounts)
}

export function updateAccount(id: string, updates: Partial<Account>): Account | null {
  const accounts = getAccounts()
  const index = accounts.findIndex(a => a.id === id)
  if (index >= 0) {
    accounts[index] = { ...accounts[index], ...updates }
    getStore().set('accounts', accounts)
    return accounts[index]
  }
  return null
}

// 判断导入账号是否与现有账号冲突
function isConflict(existing: Account[], incoming: Account): boolean {
  return existing.some(a => {
    if (a.desktopUserId && incoming.desktopUserId) {
      return a.desktopUserId === incoming.desktopUserId
    }
    return a.name === incoming.name && a.cookie.slice(0, 32) === incoming.cookie.slice(0, 32)
  })
}

// 标记导入账号的冲突状态（不写入 store）
export function checkImportConflicts(incoming: Account[]): (Account & { conflict: boolean })[] {
  const existing = getAccounts()
  return incoming.map(a => ({ ...a, conflict: isConflict(existing, a) }))
}

// 批量导入账号，支持冲突处理策略
export function bulkSaveAccounts(accounts: Account[], strategy: ImportStrategy): { imported: number; skipped: number } {
  const existing = getAccounts()
  let imported = 0
  let skipped = 0

  for (const account of accounts) {
    const conflict = isConflict(existing, account)
    if (conflict && strategy === 'skip') {
      skipped++
      continue
    }
    if (conflict && strategy === 'overwrite') {
      // 按 desktopUserId 或 name+cookie 定位并覆盖
      const index = existing.findIndex(a => {
        if (a.desktopUserId && account.desktopUserId) {
          return a.desktopUserId === account.desktopUserId
        }
        return a.name === account.name && a.cookie.slice(0, 32) === account.cookie.slice(0, 32)
      })
      if (index >= 0) {
        existing[index] = { ...existing[index], ...account, id: existing[index].id }
      } else {
        existing.push(account)
      }
    } else {
      // 无冲突，新增（生成新 id 避免碰撞）
      existing.push({ ...account, id: Date.now().toString(36) + Math.random().toString(36).substr(2) })
    }
    imported++
  }

  getStore().set('accounts', existing)
  return { imported, skipped }
}

// 日志相关操作
export function getLogs(limit = 100): CheckinLog[] {
  const logs = getStore().get('logs', [])
  return logs.slice(-limit).reverse()
}

export function addLog(log: CheckinLog): void {
  const logs = getStore().get('logs', [])
  logs.push(log)
  // 最多保留 500 条日志
  if (logs.length > 500) {
    logs.splice(0, logs.length - 500)
  }
  getStore().set('logs', logs)
}

export function clearLogs(): void {
  getStore().set('logs', [])
}

// 设置相关操作
export function getSettings(): AppSettings {
  return getStore().get('settings', defaultSettings)
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const updated = { ...current, ...settings }
  getStore().set('settings', updated)
  return updated
}
