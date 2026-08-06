import { ipcMain, BrowserWindow, dialog, safeStorage } from 'electron'
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
  upsertDesktopAccount
} from './store'
import { performCheckin, performAllCheckin, getTotalPointsByTraeDesktop } from './checkin'
import { startScheduler, stopScheduler, restartScheduler, getNextRunTime } from './scheduler'
import type { Account, AppSettings } from './types'
const { getTraeDesktopCredentials } = require('../electron/trae-auth.cjs') as { getTraeDesktopCredentials: () => any }
const { encryptCredential, publicCredentialStatus } = require('../electron/desktop-credentials.cjs') as { encryptCredential: (credential: any, storage: typeof safeStorage) => string; publicCredentialStatus: (credential: any) => { type: string; credentialStatus: Account['credentialStatus'] } }

function toPublicAccount(account: Account) {
  const { encryptedCredential, ...publicAccount } = account
  return publicAccount
}

// 生成唯一 ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

export function registerIpcHandlers(mainWindow: BrowserWindow) {
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
