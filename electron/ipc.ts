import { ipcMain, BrowserWindow, dialog, safeStorage, app } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  getAccounts,
  saveAccount,
  deleteAccount,
  updateAccount,
  getLogs,
  clearLogs,
  getSettings,
  saveSettings,
  upsertDesktopAccount,
  checkImportConflicts,
  bulkSaveAccounts
} from './store'
import { performCheckin, performAllCheckin, getTotalPointsByTraeDesktop } from './checkin'
import { startScheduler, stopScheduler, restartScheduler, getNextRunTime } from './scheduler'
import type { Account, AppSettings, ImportStrategy, ExportData } from './types'
const { getTraeDesktopCredentials } = require('../electron/trae-auth.cjs') as { getTraeDesktopCredentials: () => any }
const { encryptCredential, publicCredentialStatus } = require('../electron/desktop-credentials.cjs') as { encryptCredential: (credential: any, storage: typeof safeStorage) => string; publicCredentialStatus: (credential: any) => { type: string; credentialStatus: Account['credentialStatus'] } }
const { registerWindowControls } = require('./window-controls.cjs') as { registerWindowControls: (ipc: typeof ipcMain, getWindow: () => BrowserWindow | null) => void }

function toPublicAccount(account: Account) {
  const { encryptedCredential, ...publicAccount } = account
  return publicAccount
}

// 生成唯一 ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// 通过 JSON 编解码清洗对象，确保 IPC 返回值对 Structured Clone 安全
function cloneSafe<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  registerWindowControls(ipcMain, () => mainWindow)

  // ========== 账号相关 ==========

  // 获取所有账号
  ipcMain.handle('accounts:get-all', () => {
    return getAccounts().map(toPublicAccount)
  })

  ipcMain.handle('accounts:import-desktop', () => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密服务不可用，无法安全保存 TRAE 凭证')
    const credential = getTraeDesktopCredentials()
    const account: Account = {
      id: generateId(),
      name: credential.accountName,
      cookie: '',
      desktopUserId: credential.userId,
      encryptedCredential: encryptCredential(credential, safeStorage),
      ...publicCredentialStatus(credential),
      createdAt: Date.now(),
      enabled: true
    }
    return toPublicAccount(upsertDesktopAccount(account))
  })

  // 添加账号
  ipcMain.handle('accounts:add', (_event, data: { name: string; cookie: string }) => {
    const account: Account = {
      id: generateId(),
      name: data.name,
      cookie: data.cookie,
      createdAt: Date.now(),
      enabled: true
    }
    saveAccount(account)
    return account
  })

  // 更新账号
  ipcMain.handle('accounts:update', (_event, id: string, updates: Partial<Account>) => {
    return updateAccount(id, updates)
  })

  // 删除账号
  ipcMain.handle('accounts:delete', (_event, id: string) => {
    deleteAccount(id)
    return true
  })

  // 单个账号签到
  ipcMain.handle('accounts:checkin', async (_event, id: string) => {
    const accounts = getAccounts()
    const account = accounts.find(a => a.id === id)
    if (!account) {
      return { success: false, message: '账号不存在' }
    }
    return await performCheckin(account)
  })

  // 所有账号签到
  ipcMain.handle('accounts:checkin-all', async () => {
    return await performAllCheckin()
  })

  // 获取账号总积分
  ipcMain.handle('accounts:get-points', async (_event, id: string) => {
    const accounts = getAccounts()
    const account = accounts.find(a => a.id === id)
    if (!account) {
      return { success: false, message: '账号不存在' }
    }
    const result = await getTotalPointsByTraeDesktop(account)
    if (result.success && result.totalPoints !== undefined) {
      updateAccount(id, { points: result.totalPoints })
    }
    return result
  })

  // ========== 账号导入导出 ==========

  // 导出账号到文件
  ipcMain.handle('accounts:export-to-file', async (_event, data: { ids: string[]; includeCredentials: boolean }) => {
    try {
      const ids: string[] = Array.isArray(data?.ids) ? data.ids : []
      const includeCredentials: boolean = !!data?.includeCredentials
      const allAccounts = getAccounts()
      const selectedAccounts = allAccounts.filter(a => ids.includes(String(a.id)))

      if (selectedAccounts.length === 0) {
        return cloneSafe({ success: false, message: '没有选中的账号' })
      }

      const accountsToExport = selectedAccounts.map(a => {
        const base = {
          id: String(a.id),
          name: String(a.name),
          cookie: includeCredentials ? String(a.cookie || '') : '',
          createdAt: typeof a.createdAt === 'number' ? a.createdAt : Date.now(),
          enabled: a.enabled !== false,
          desktopUserId: a.desktopUserId ? String(a.desktopUserId) : undefined,
          credentialStatus: a.credentialStatus ? String(a.credentialStatus) : undefined
        } as any
        if (includeCredentials && a.encryptedCredential) {
          base.encryptedCredential = String(a.encryptedCredential)
        }
        return base
      })

      const exportData = {
        version: 1,
        exportedAt: Date.now(),
        appVersion: String(app.getVersion()),
        containsCredentials: includeCredentials,
        count: accountsToExport.length,
        accounts: accountsToExport
      }

      const now = new Date()
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      const defaultFilename = `trae-check-accounts-${dateStr}.json`

      const win = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null as any
      const dialogResult = await dialog.showSaveDialog(win, {
        title: '导出账号数据',
        defaultPath: defaultFilename,
        filters: [{ name: 'JSON 文件', extensions: ['json'] }]
      })

      if (dialogResult.canceled || !dialogResult.filePath) {
        return cloneSafe({ success: false, canceled: true, message: '用户取消导出' })
      }

      const filePath = String(dialogResult.filePath)
      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8')
      return cloneSafe({ success: true, path: filePath })
    } catch (e: any) {
      const msg = (e && e.message) ? String(e.message) : '导出失败'
      return cloneSafe({ success: false, message: msg })
    }
  })

  // 从文件导入账号（预览）
  ipcMain.handle('accounts:import-from-file', async () => {
    try {
      const win = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null as any
      const openResult = await dialog.showOpenDialog(win, {
        title: '导入账号数据',
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        properties: ['openFile']
      })

      if (openResult.canceled || !openResult.filePaths || openResult.filePaths.length === 0) {
        return cloneSafe({ success: false, canceled: true, message: '用户取消导入' })
      }

      const filePath = String(openResult.filePaths[0])
      const content = fs.readFileSync(filePath, 'utf-8')
      let data: any

      try {
        data = JSON.parse(content)
      } catch {
        return cloneSafe({ success: false, message: '文件格式无效，无法解析 JSON' })
      }

      if (typeof data.version !== 'number' || !Array.isArray(data.accounts)) {
        return cloneSafe({ success: false, message: '文件格式不符合要求（缺少 version 或 accounts 字段）' })
      }

      const validAccounts: Account[] = []
      let invalidCount = 0
      for (const item of data.accounts) {
        if (item && typeof item.id === 'string' && typeof item.name === 'string') {
          validAccounts.push({
            id: String(item.id),
            name: String(item.name),
            cookie: item.cookie ? String(item.cookie) : '',
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
            enabled: item.enabled !== false,
            desktopUserId: item.desktopUserId ? String(item.desktopUserId) : undefined,
            encryptedCredential: item.encryptedCredential ? String(item.encryptedCredential) : undefined,
            credentialStatus: item.credentialStatus ? String(item.credentialStatus) : undefined
          } as Account)
        } else {
          invalidCount++
        }
      }

      const accountsWithConflict = checkImportConflicts(validAccounts)
      const accountsSafe = accountsWithConflict.map(a => ({
        id: String(a.id),
        name: String(a.name),
        cookie: a.cookie ? String(a.cookie) : '',
        createdAt: typeof a.createdAt === 'number' ? a.createdAt : Date.now(),
        enabled: a.enabled !== false,
        desktopUserId: a.desktopUserId ? String(a.desktopUserId) : undefined,
        encryptedCredential: a.encryptedCredential ? String(a.encryptedCredential) : undefined,
        credentialStatus: a.credentialStatus ? String(a.credentialStatus) : undefined,
        conflict: !!a.conflict
      }))

      return cloneSafe({
        success: true,
        accounts: accountsSafe,
        invalidCount
      })
    } catch (e: any) {
      const msg = (e && e.message) ? String(e.message) : '读取文件失败'
      return cloneSafe({ success: false, message: msg })
    }
  })

  // 执行导入
  ipcMain.handle('accounts:import', (_event, data: { accounts: Account[]; strategy: ImportStrategy }) => {
    try {
      const accounts = Array.isArray(data?.accounts) ? data.accounts : []
      const strategy = (data?.strategy === 'overwrite') ? 'overwrite' : 'skip'
      if (accounts.length === 0) {
        return cloneSafe({ success: false, imported: 0, skipped: 0, message: '没有可导入的账号' })
      }
      const cleanedAccounts: Account[] = accounts.map(a => ({
        id: String(a.id),
        name: String(a.name),
        cookie: a.cookie ? String(a.cookie) : '',
        createdAt: typeof a.createdAt === 'number' ? a.createdAt : Date.now(),
        enabled: a.enabled !== false,
        desktopUserId: a.desktopUserId ? String(a.desktopUserId) : undefined,
        encryptedCredential: a.encryptedCredential ? String(a.encryptedCredential) : undefined,
        credentialStatus: a.credentialStatus ? String(a.credentialStatus) : undefined
      } as Account))
      const result = bulkSaveAccounts(cleanedAccounts, strategy)
      return cloneSafe({ success: true, ...result })
    } catch (e: any) {
      const msg = (e && e.message) ? String(e.message) : '导入失败'
      return cloneSafe({ success: false, imported: 0, skipped: 0, message: msg })
    }
  })

  // ========== 日志相关 ==========

  // 获取日志
  ipcMain.handle('logs:get', (_event, limit?: number) => {
    return getLogs(limit || 100)
  })

  // 清空日志
  ipcMain.handle('logs:clear', () => {
    clearLogs()
    return true
  })

  // ========== 设置相关 ==========

  // 获取设置
  ipcMain.handle('settings:get', () => {
    return getSettings()
  })

  // 保存设置
  ipcMain.handle('settings:save', (_event, settings: Partial<AppSettings>) => {
    const updated = saveSettings(settings)
    // 设置变更后重启定时任务
    restartScheduler()
    return updated
  })

  // 获取下次执行时间
  ipcMain.handle('scheduler:next-run', () => {
    const next = getNextRunTime()
    return next ? next.toISOString() : null
  })

  // 启动/停止定时任务
  ipcMain.handle('scheduler:start', () => {
    startScheduler()
    return true
  })

  ipcMain.handle('scheduler:stop', () => {
    stopScheduler()
    return true
  })

  // ========== 其他 ==========

  // 打开登录窗口（用于获取 cookie）
  ipcMain.handle('auth:open-login-window', async () => {
    const loginWin = new BrowserWindow({
      width: 1000,
      height: 700,
      title: '登录 Trae Work - 登录后自动获取 Cookie',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    await loginWin.loadURL('https://work.trae.cn/')

    // 返回 Promise，用户关闭窗口时获取 cookie
    return new Promise((resolve) => {
      loginWin.on('closed', async () => {
        try {
          // 这个窗口已经销毁了，我们需要在关闭前保存 cookie
          resolve({ success: false, message: '窗口已关闭' })
        } catch (e) {
          resolve({ success: false, message: '获取失败' })
        }
      })

      // 提供一个获取 cookie 的方法
      ipcMain.once('auth:get-cookie', async () => {
        try {
          const cookies = await loginWin.webContents.session.cookies.get({ domain: '.trae.cn' })
          const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')
          loginWin.close()
          resolve({ success: true, cookie: cookieStr })
        } catch (e: any) {
          resolve({ success: false, message: e.message })
        }
      })
    })
  })

  // 从登录窗口获取 cookie
  ipcMain.handle('auth:get-cookie-from-window', async () => {
    return new Promise((resolve) => {
      const loginWin = new BrowserWindow({
        width: 1000,
        height: 700,
        title: '登录 Trae Work - 完成登录后点击"获取 Cookie"按钮',
        webPreferences: {
          preload: path.join(__dirname, 'login-preload.js'),
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      loginWin.loadURL('https://work.trae.cn/')

      // 注入一个获取 cookie 的按钮
      loginWin.webContents.on('did-finish-load', () => {
        loginWin.webContents.executeJavaScript(`
          (function() {
            // 创建浮动按钮
            const btn = document.createElement('button');
            btn.textContent = '✅ 已登录，获取 Cookie';
            btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;padding:10px 20px;background:#4CAF50;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
            btn.onclick = function() {
              window.electronAPI?.notifyLoginComplete?.();
              alert('正在获取登录信息，请稍候...');
            };
            document.body.appendChild(btn);
          })()
        `).catch(() => {})
      })

      loginWin.on('closed', () => {
        resolve({ success: false, message: '窗口已关闭，未获取到 Cookie' })
      })

      // 监听登录完成通知
      setTimeout(() => {
        // 用 IPC 方式通知
      }, 1000)

      // 提供一个手动获取的方式
      ipcMain.once('auth:login-complete', async () => {
        try {
          const cookies = await loginWin.webContents.session.cookies.get({ domain: '.trae.cn' })
          const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')
          loginWin.close()
          resolve({ success: true, cookie: cookieStr })
        } catch (e: any) {
          resolve({ success: false, message: e.message })
        }
      })
    })
  })
}
