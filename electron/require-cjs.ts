import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const CJS_BASENAMES = [
  'trae-auth.cjs',
  'trae-process.cjs',
  'desktop-credentials.cjs',
  'points-entitlement-detail.cjs',
  'window-lifecycle.cjs',
  'window-controls.cjs'
]

let cachedRoot: string | null = null

function detectBaseDir(): string {
  if (cachedRoot) return cachedRoot
  const appPath = app.isPackaged ? app.getAppPath() : process.cwd()
  // 候选路径按优先级排列
  const candidates: string[] = [
    // 打包后（asar）：appPath/resources/app.asar → electron cjs 在 app.asar/electron/ 下
    path.join(appPath, 'electron'),
    // 打包后（asar）另一种布局：dist-electron 作为根
    appPath,
    // 开发态：process.cwd() / electron
    path.join(process.cwd(), 'electron'),
    // 开发态：dist-electron 目录（vite build 后跑 node）
    path.join(process.cwd(), 'dist-electron', 'electron'),
    path.join(process.cwd(), 'dist-electron')
  ]
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, CJS_BASENAMES[0]))) {
        cachedRoot = dir
        return cachedRoot
      }
      // 兼容直接 cjs 放在该目录下的情况
      if (CJS_BASENAMES.every(f => fs.existsSync(path.join(dir, f)))) {
        cachedRoot = dir
        return cachedRoot
      }
    } catch {
      /* ignore */
    }
  }
  // 兜底返回开发态 electron 目录
  cachedRoot = path.join(process.cwd(), 'electron')
  return cachedRoot
}

export function requireCjs<T = any>(filename: string): T {
  const base = detectBaseDir()
  const fullPath = path.join(base, filename)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(fullPath) as T
}
