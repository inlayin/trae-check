import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { copyFileSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    electron([
      {
        // 主进程
        entry: 'electron/main.ts',
        vite: {
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
              name: 'copy-window-controls-runtime',
              closeBundle() {
                copyFileSync(
                  resolve(__dirname, 'electron/window-controls.cjs'),
                  resolve(__dirname, 'dist-electron/window-controls.cjs')
                )
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
