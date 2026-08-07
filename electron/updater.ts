import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { CancellationToken } from 'builder-util-runtime'
import type { UpdateInfo, ProgressInfo } from 'electron-updater'

let mainWindow: BrowserWindow | null = null
// 标记本次检查是否为用户手动触发（用于区分是否提示「已是最新版本」）
let manualCheck = false
// 下载取消令牌（用于支持取消下载）
// 注：electron-updater 内部嵌套了独立的 builder-util-runtime，类型声明不一致，
// 因此 download 时使用类型断言绕过，运行时是同一份实现。
let downloadCancellationToken: CancellationToken | null = null

function send(channel: string, payload?: unknown) {
  console.log(`[updater] send -> ${channel}`, payload)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

// releaseNotes 可能是 string（Windows）或数组（macOS），统一转成纯文本
function normalizeReleaseNotes(notes: UpdateInfo['releaseNotes']): string {
  if (!notes) return ''
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes.map((n) => (typeof n === 'string' ? n : n.note)).join('\n')
  }
  return String(notes)
}

export function initAutoUpdater(window: BrowserWindow) {
  mainWindow = window

  // 调试：转发渲染进程 console.log 到主进程终端
  mainWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log(`[renderer] ${message}`)
  })

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // 开发环境强制使用 dev-app-update.yml 测试更新流程
  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true
  }

  // ===== autoUpdater 事件 → 渲染进程 =====
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send('update:available', {
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate || ''
    })
  })

  autoUpdater.on('update-not-available', () => {
    send('update:not-available', { manual: manualCheck })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    send('update:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', () => {
    send('update:downloaded')
  })

  autoUpdater.on('error', (error: Error) => {
    send('update:error', { message: error?.message || String(error), manual: manualCheck })
  })

  // ===== 渲染进程 → IPC handler =====
  ipcMain.handle('update:check', () => {
    manualCheck = true
    return autoUpdater.checkForUpdates()
  })

  ipcMain.handle('update:download', () => {
    downloadCancellationToken = new CancellationToken()
    return autoUpdater.downloadUpdate(downloadCancellationToken as never)
  })

  ipcMain.handle('update:cancel', () => {
    if (downloadCancellationToken) {
      downloadCancellationToken.cancel()
      downloadCancellationToken = null
    }
    return true
  })

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
    return true
  })

  // ===== 启动后延迟自动检查（打包后 + 开发环境均生效）=====
  setTimeout(() => {
    manualCheck = false
    autoUpdater.checkForUpdates().catch(() => {
      // 启动自动检查静默失败
    })
  }, 3000)
}
