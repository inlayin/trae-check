import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { resolve, join } from 'path'
import pkg from './package.json' assert { type: 'json' }

const ELECTRON_DIR = resolve(__dirname, 'electron')
const DIST_ELECTRON_DIR = resolve(__dirname, 'dist-electron')
const CJS_FILES = [
  'trae-auth.cjs',
  'trae-process.cjs',
  'desktop-credentials.cjs',
  'points-entitlement-detail.cjs',
  'window-lifecycle.cjs',
  'window-controls.cjs'
]

function copyAllCjsToDist() {
  // 打包后主进程 main.js 在 dist-electron/main.js，其内部 require 路径为 ./electron/xxx.cjs，
  // 所以必须在 dist-electron 下再创建 electron 子目录并复制所有 cjs。
  const targetDir = join(DIST_ELECTRON_DIR, 'electron')
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })
  for (const f of CJS_FILES) {
    const src = join(ELECTRON_DIR, f)
    // 直接放到 dist-electron 根（兼容其他位置可能用的 ./xxx.cjs 引用）
    copyFileSync(src, join(DIST_ELECTRON_DIR, f))
    // 同时放到 dist-electron/electron/ 子目录（适配 ./electron/xxx.cjs 引用）
    copyFileSync(src, join(targetDir, f))
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    vue(),
    electron([
      {
        // 主进程
        entry: 'electron/main.ts',
        vite: {
          plugins: [
            {
              name: 'copy-electron-cjs-main',
              closeBundle() {
                copyAllCjsToDist()
              }
            }
          ],
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron-store', 'node-cron', 'axios']
            }
          }
        }
      },
      {
        // 预加载脚本
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          plugins: [
            {
              name: 'copy-electron-cjs-preload',
              closeBundle() {
                copyAllCjsToDist()
              }
            }
          ],
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      {
        // 登录窗口的最小权限预加载脚本
        entry: 'electron/login-preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          plugins: [
            {
              name: 'copy-electron-cjs-login-preload',
              closeBundle() {
                copyAllCjsToDist()
              }
            }
          ],
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 33445
  }
})
