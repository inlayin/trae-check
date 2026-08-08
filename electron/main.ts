import { app, BrowserWindow, Menu, Tray } from 'electron'
import path from 'path'
import { execSync } from 'child_process'
import { initStore } from './store'
import { registerIpcHandlers } from './ipc'
import { startScheduler } from './scheduler'
import { requireCjs } from './require-cjs'
import { initAutoUpdater } from './updater'

const { createWindowLifecycle } = requireCjs<{
  createWindowLifecycle: (getMainWindow: () => BrowserWindow | null, onExit: () => void) => {
    handleClose: (e: any) => void
    showWindow: () => void
    exit: () => void
  }
}>('window-lifecycle.cjs')

// 修复 Windows 控制台中文乱码：切换代码页为 UTF-8 (65001)
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001 > nul 2>&1', { stdio: 'ignore' })
  } catch {
    // ignore chcp failure
  }
  try {
    if ((process.stdout as any)._handle) {
      (process.stdout as any)._handle.setBlocking?.(true)
    }
  } catch {
    // ignore
  }
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

const lifecycle = createWindowLifecycle(() => mainWindow, () => app.quit())

function createWindow() {
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, '../assets/icon.png'),
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    title: 'TraeCheck - 每日自动签到',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    },
    frame: false,
    backgroundColor: '#f5f5f5'
  })

  // 注册 IPC 处理器
  registerIpcHandlers(mainWindow)

  if (isDev) {
    // 开发模式加载 vite dev server
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:33445'
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式加载构建后的文件
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('close', lifecycle.handleClose)
}

function createTray() {
  tray = new Tray(path.join(__dirname, '../assets/icon.png'))
  tray.setToolTip('TraeCheck')
  tray.on('click', lifecycle.showWindow)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show TraeCheck', click: lifecycle.showWindow },
    { type: 'separator' },
    { label: 'Exit', click: lifecycle.exit }
  ]))
}

// 应用就绪
app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  // 初始化数据存储
  try {
    initStore()
    console.log('[App] electron-store 初始化完成')
  } catch (e) {
    console.error('[App] electron-store 初始化失败，数据文件可能损坏:', e)
  }

  // 创建主窗口
  createWindow()
  createTray()

  // 初始化在线更新（仅打包后自动检查）
  try {
    if (mainWindow) initAutoUpdater(mainWindow)
  } catch (e) {
    console.error('[App] 初始化自动更新模块异常:', e)
  }

  // 启动定时任务（兜底 try/catch，保证即使调度模块异常也不影响窗口启动）
  try {
    startScheduler()
  } catch (e) {
    console.error('[App] 启动定时签到调度器异常，请检查数据配置:', e)
  }

  app.on('activate', () => {
    if (mainWindow) lifecycle.showWindow()
    else createWindow()
  })
})

// 所有窗口关闭时退出
// 禁止创建新窗口的导航
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // 允许打开外部链接
    if (url.startsWith('http')) {
      return { action: 'allow' }
    }
    return { action: 'deny' }
  })
})
