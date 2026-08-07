const { exec, execSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const TRAE_PROCESS_NAME = 'TRAE SOLO CN.exe'
const TRAE_REGISTRY_DISPLAY_NAME = 'TRAE Work'

/**
 * 查找 TRAE 桌面客户端可执行文件路径。
 * 优先级：注册表 InstallLocation → DisplayIcon → 常见安装目录回退。
 */
function findTraeExecutable() {
  const roots = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ]
  for (const root of roots) {
    let search
    try {
      search = execSync(`reg query "${root}" /s /f "${TRAE_REGISTRY_DISPLAY_NAME}" /d`, { encoding: 'utf8', timeout: 5000 })
    } catch { continue }
    if (!search) continue
    // 定位匹配项的键路径
    const keyMatch = search.match(/^HKEY_[^\r\n]+$/m)
    if (!keyMatch) continue
    const keyPath = keyMatch[0].trim()
    let detail
    try {
      detail = execSync(`reg query "${keyPath}"`, { encoding: 'utf8', timeout: 5000 })
    } catch { continue }
    const installMatch = detail.match(/InstallLocation\s+REG_SZ\s+(.+)/)
    if (installMatch) {
      const dir = installMatch[1].trim()
      const exe = path.join(dir, TRAE_PROCESS_NAME)
      if (fs.existsSync(exe)) return exe
    }
    const iconMatch = detail.match(/DisplayIcon\s+REG_SZ\s+(.+)/)
    if (iconMatch) {
      const iconPath = iconMatch[1].trim().split(',')[0].trim()
      if (iconPath && fs.existsSync(iconPath)) return iconPath
    }
  }
  // 常见目录回退
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'TRAE SOLO CN', TRAE_PROCESS_NAME),
    path.join(process.env.PROGRAMFILES || '', 'TRAE SOLO CN', 'TRAE SOLO CN', TRAE_PROCESS_NAME),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'TRAE SOLO CN', 'TRAE SOLO CN', TRAE_PROCESS_NAME)
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return null
}

/**
 * 结束所有 TRAE 桌面客户端进程。
 * taskkill /F 强制结束 /IM 按映像名匹配 /T 含子进程。
 */
function killTraeDesktop() {
  return new Promise((resolve) => {
    exec(`taskkill /F /IM "${TRAE_PROCESS_NAME}" /T`, (err, stdout, stderr) => {
      const text = `${stdout || ''}${stderr || ''}`
      const match = text.match(/成功: 已终止 (\d+) 个进程/) || text.match(/SUCCESS: terminated (\d+) processes/)
      const killed = match ? parseInt(match[1], 10) : 0
      const notRunning = text.includes('错误: 没有找到') || text.includes('ERROR: not found') || (err && killed === 0)
      resolve({
        killed,
        message: notRunning ? 'TRAE 进程未在运行' : (killed > 0 ? `已结束 ${killed} 个进程` : '已发送结束指令')
      })
    })
  })
}

/**
 * 重启 TRAE 桌面客户端。
 * 流程：1) 查找可执行路径 → 2) 结束现有进程 → 3) 等待 800ms 让文件句柄释放 → 4) spawn 重启
 */
async function restartTraeDesktop() {
  const executablePath = findTraeExecutable()
  if (!executablePath) {
    return { launched: false, message: '未找到 TRAE 桌面客户端安装路径' }
  }
  await killTraeDesktop()
  await new Promise((r) => setTimeout(r, 800))
  try {
    const child = spawn(executablePath, [], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(executablePath)
    })
    child.unref()
    return { launched: true, message: '已重启 TRAE 桌面客户端', executablePath }
  } catch (e) {
    return { launched: false, message: '启动失败: ' + (e.message || e), executablePath }
  }
}

module.exports = { findTraeExecutable, killTraeDesktop, restartTraeDesktop }
