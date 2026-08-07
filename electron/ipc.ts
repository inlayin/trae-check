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
  bulkSaveAccounts,
  markCredentialExpired
} from './store'
import { performCheckin, performAllCheckin, getTotalPointsByTraeDesktop, getPointsDetailByTraeDesktop } from './checkin'
import { startScheduler, stopScheduler, restartScheduler, getNextRunTime } from './scheduler'
import type { Account, AppSettings, ImportStrategy, ExportData, ExportAccount } from './types'
const { getTraeDesktopCredentials, setTraeDesktopCredentials } = require('../electron/trae-auth.cjs') as {
  getTraeDesktopCredentials: () => any
  setTraeDesktopCredentials: (credential: any, appData?: string) => { backupPath: string; wroteKeys: string[] }
}
const { restartTraeDesktop } = require('../electron/trae-process.cjs') as { restartTraeDesktop: () => Promise<{ launched: boolean; message: string; executablePath?: string }> }
const { encryptCredential, decryptCredential, legacyCredentialReimportMessage, publicCredentialStatus, encryptWithPassword, decryptWithPassword } = require('../electron/desktop-credentials.cjs') as {
  encryptCredential: (credential: any, storage: typeof safeStorage) => string
  decryptCredential: (value: string, storage: typeof safeStorage) => { payload: any; decryptionFailed: boolean; legacyCredential?: boolean }
  legacyCredentialReimportMessage: () => string
  publicCredentialStatus: (credential: any) => { type: string; credentialStatus: Account['credentialStatus'] }
  encryptWithPassword: (plaintext: string, password: string) => string
  decryptWithPassword: (base64Data: string, password: string) => string
}
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

  // 设置为本地账号：把选中账号凭证写回 TRAE 桌面客户端并自动重启
  ipcMain.handle('accounts:set-local', async (_event, id: string) => {
    const accounts = getAccounts()
    const account = accounts.find(a => a.id === id)
    if (!account) return { success: false, message: '账号不存在' }
    if (!account.encryptedCredential) return { success: false, message: '该账号未导入桌面凭证' }
    if (!safeStorage.isEncryptionAvailable()) return { success: false, message: '系统加密服务不可用' }
    const dec = decryptCredential(account.encryptedCredential, safeStorage)
    if (dec.legacyCredential) return { success: false, message: legacyCredentialReimportMessage() }
    if (dec.decryptionFailed || !dec.payload) {
      markCredentialExpired(id)
      return { success: false, message: '凭证已失效（跨机器导入需重新导入）' }
    }
    let credential = dec.payload
    // 临过期自动续期，避免写回一个已过期的 token
    if (credential.expiresAt - Date.now() <= 5 * 60 * 1000) {
      try {
        const { refreshCredential } = require('../electron/desktop-credentials.cjs')
        credential = await refreshCredential(credential)
        updateAccount(id, {
          encryptedCredential: encryptCredential(credential, safeStorage),
          credentialStatus: publicCredentialStatus(credential).credentialStatus
        })
      } catch {
        updateAccount(id, { credentialStatus: 'expired' })
        return { success: false, message: '凭证已失效，请重新导入后再切换' }
      }
    }
    let writeResult
    try {
      writeResult = setTraeDesktopCredentials(credential)
    } catch (e: any) {
      return { success: false, message: '写入桌面客户端失败: ' + (e.message || e) }
    }
    // 写入成功后自动结束并重启 TRAE 桌面客户端，使切换即时生效
    const restartResult = await restartTraeDesktop()
    return cloneSafe({
      success: true,
      message: restartResult.launched
        ? `已切换并重启 TRAE 桌面客户端（备份：${writeResult.backupPath}）`
        : `已写入凭证，但 TRAE 客户端未能自动重启（${restartResult.message}），请手动启动`,
      backupPath: writeResult.backupPath,
      restarted: restartResult.launched
    })
  })

  // 获取账号积分流水明细
  ipcMain.handle('accounts:get-points-detail', async (_event, id: string) => {
    const accounts = getAccounts()
    const account = accounts.find(a => a.id === id)
    if (!account) return cloneSafe({ success: false, message: '账号不存在', source: 'none' })
    const result = await getPointsDetailByTraeDesktop(account)
    if ((result as any).legacyCredential) return cloneSafe(result)
    // API 不可用时回退展示本地签到记录
    if (!result.success || result.source === 'none') {
      const localLogs = getLogs(200).filter((log: any) => log.accountId === id)
      return cloneSafe({
        success: true,
        message: result.success ? result.message : '未能获取在线流水，已展示本地签到记录',
        source: 'local',
        totalPoints: account.points,
        localCheckinLogs: localLogs
      })
    }
    return cloneSafe(result)
  })

  // ========== 账号导入导出（方案 B：密码加密） ==========

  // 导出账号到文件
  ipcMain.handle('accounts:export-to-file', async (_event, data: { ids: string[]; includeCredentials: boolean; password?: string }) => {
    try {
      const ids: string[] = Array.isArray(data?.ids) ? data.ids : []
      const includeCredentials: boolean = !!data?.includeCredentials
      const password: string = data?.password ? String(data.password) : ''
      const allAccounts = getAccounts()
      const selectedAccounts = allAccounts.filter(a => ids.includes(String(a.id)))

      if (selectedAccounts.length === 0) {
        return cloneSafe({ success: false, message: '没有选中的账号' })
      }
      // 含凭证导出必须有密码
      if (includeCredentials && !password) {
        return cloneSafe({ success: false, message: '包含凭证导出需要设置密码' })
      }

      const accountsToExport: ExportAccount[] = selectedAccounts.map(a => {
        const base: ExportAccount = {
          id: String(a.id),
          name: String(a.name),
          cookie: includeCredentials ? String(a.cookie || '') : '',
          createdAt: typeof a.createdAt === 'number' ? a.createdAt : Date.now(),
          enabled: a.enabled !== false,
          desktopUserId: a.desktopUserId ? String(a.desktopUserId) : undefined,
          credentialStatus: a.credentialStatus ? String(a.credentialStatus) : undefined
        }
        if (includeCredentials && a.encryptedCredential) {
          // 1. safeStorage 解密出明文 credential
          const dec = decryptCredential(a.encryptedCredential, safeStorage)
          if (dec.legacyCredential) throw new Error(legacyCredentialReimportMessage())
          if (dec.payload) {
            // 2. 用用户密码 AES-256-GCM 加密明文
            base.encryptedCredentialData = encryptWithPassword(JSON.stringify(dec.payload), password)
          }
          // v1 兼容：同时保留 safeStorage 密文（旧版客户端可读，但跨机器不可用）
          base.encryptedCredential = String(a.encryptedCredential)
        }
        return base
      })

      const exportData: ExportData = {
        version: 2,
        exportedAt: Date.now(),
        appVersion: String(app.getVersion()),
        containsCredentials: includeCredentials,
        credentialFormat: includeCredentials ? 'encrypted' : 'plaintext',
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

  // 步骤 1: 选择导入文件（只弹对话框，返回路径）
  ipcMain.handle('accounts:pick-import-file', async () => {
    try {
      const win = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null as any
      const openResult = await dialog.showOpenDialog(win, {
        title: '选择导入文件',
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        properties: ['openFile']
      })

      if (openResult.canceled || !openResult.filePaths || openResult.filePaths.length === 0) {
        return cloneSafe({ success: false, canceled: true, message: '用户取消' })
      }

      const filePath = String(openResult.filePaths[0])
      // 快速校验文件可解析 + 是否含凭证
      let hasCredentials = false
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        hasCredentials = !!raw.containsCredentials
      } catch { /* 预览阶段再详细校验 */ }

      return cloneSafe({ success: true, filePath, hasCredentials })
    } catch (e: any) {
      return cloneSafe({ success: false, message: (e && e.message) ? String(e.message) : '选择文件失败' })
    }
  })

  // 步骤 2: 用密码解密预览（明文不离开主进程）
  ipcMain.handle('accounts:import-preview', async (_event, data: { filePath: string; password: string }) => {
    try {
      const filePath = String(data?.filePath || '')
      const password = String(data?.password || '')
      if (!filePath || !password) {
        return cloneSafe({ success: false, message: '缺少文件路径或密码' })
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      let raw: any
      try {
        raw = JSON.parse(content)
      } catch {
        return cloneSafe({ success: false, message: '文件格式无效，无法解析 JSON' })
      }

      if (typeof raw.version !== 'number' || !Array.isArray(raw.accounts)) {
        return cloneSafe({ success: false, message: '文件格式不符合要求（缺少 version 或 accounts 字段）' })
      }

      // 尝试解密凭证，检测密码是否正确
      const isEncrypted = raw.credentialFormat === 'encrypted' || raw.accounts.some((a: any) => a.encryptedCredentialData)
      if (isEncrypted) {
        // 用第一个含 encryptedCredentialData 的账号测试密码
        const testAccount = raw.accounts.find((a: any) => a.encryptedCredentialData)
        if (testAccount) {
          try {
            decryptWithPassword(testAccount.encryptedCredentialData, password)
          } catch {
            return cloneSafe({ success: false, message: '密码错误，无法解密凭证' })
          }
        }
      }

      // 构建预览账号列表（不含敏感字段）
      const validAccounts: Account[] = []
      let invalidCount = 0
      for (const item of raw.accounts) {
        if (item && typeof item.id === 'string' && typeof item.name === 'string') {
          validAccounts.push({
            id: String(item.id),
            name: String(item.name),
            cookie: item.cookie ? String(item.cookie) : '',
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
            enabled: item.enabled !== false,
            desktopUserId: item.desktopUserId ? String(item.desktopUserId) : undefined,
            credentialStatus: item.credentialStatus ? String(item.credentialStatus) : undefined
          } as Account)
        } else {
          invalidCount++
        }
      }

      const accountsWithConflict = checkImportConflicts(validAccounts)
      const previewAccounts = accountsWithConflict.map(a => ({
        id: String(a.id),
        name: String(a.name),
        desktopUserId: a.desktopUserId ? String(a.desktopUserId) : undefined,
        createdAt: typeof a.createdAt === 'number' ? a.createdAt : Date.now(),
        enabled: a.enabled !== false,
        credentialStatus: a.credentialStatus ? String(a.credentialStatus) : undefined,
        hasCredential: isEncrypted,
        conflict: !!a.conflict
      }))

      return cloneSafe({ success: true, accounts: previewAccounts, invalidCount, isEncrypted })
    } catch (e: any) {
      const msg = (e && e.message) ? String(e.message) : '读取文件失败'
      return cloneSafe({ success: false, message: msg })
    }
  })

  // 步骤 3: 执行导入（重新加密并写入 store）
  ipcMain.handle('accounts:import', async (_event, data: { filePath: string; password: string; strategy: ImportStrategy }) => {
    try {
      const filePath = String(data?.filePath || '')
      const password = String(data?.password || '')
      const strategy: ImportStrategy = (data?.strategy === 'overwrite') ? 'overwrite' : 'skip'
      if (!filePath) {
        return cloneSafe({ success: false, imported: 0, skipped: 0, message: '缺少文件路径' })
      }

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      if (!Array.isArray(raw.accounts)) {
        return cloneSafe({ success: false, imported: 0, skipped: 0, message: '文件格式无效' })
      }

      const accountsToImport: Account[] = []
      for (const item of raw.accounts) {
        if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') continue
        const account: Account = {
          id: String(item.id),
          name: String(item.name),
          cookie: item.cookie ? String(item.cookie) : '',
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          enabled: item.enabled !== false,
          desktopUserId: item.desktopUserId ? String(item.desktopUserId) : undefined,
          credentialStatus: item.credentialStatus ? (String(item.credentialStatus) as any) : undefined
        }
        // v2: 用密码解密明文 credential → 用本机 safeStorage 重新加密
        if (item.encryptedCredentialData && password) {
          try {
            const plaintext = decryptWithPassword(String(item.encryptedCredentialData), password)
            const credential = JSON.parse(plaintext)
            account.encryptedCredential = encryptCredential(credential, safeStorage)
            account.credentialStatus = publicCredentialStatus(credential).credentialStatus as any
          } catch {
            // 解密失败：跳过凭证，仅导入账号元数据
            account.credentialStatus = 'expired'
          }
        } else if (item.encryptedCredential) {
          // v1 兼容：旧格式 safeStorage 密文，跨机器不可用
          account.encryptedCredential = String(item.encryptedCredential)
          account.credentialStatus = 'expired'
        }
        accountsToImport.push(account)
      }

      if (accountsToImport.length === 0) {
        return cloneSafe({ success: false, imported: 0, skipped: 0, message: '没有可导入的账号' })
      }

      const result = bulkSaveAccounts(accountsToImport, strategy)
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
