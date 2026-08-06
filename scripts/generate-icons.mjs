import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const svgBuffer = readFileSync(resolve(root, 'assets/icon.svg'))
const pngPath = resolve(root, 'assets/icon.png')
const icoPath = resolve(root, 'assets/icon.ico')

// 1. SVG -> 高清基础 PNG（按圆角 SVG 渲染，四角透明）
const basePng = await sharp(svgBuffer, { density: 384 }).png().toBuffer()

// 2. 输出 512x512 PNG（BrowserWindow / Tray / AppTitleBar 用）
await sharp(basePng).resize(512, 512).toFile(pngPath)
console.log('✔ assets/icon.png (512x512, rounded)')

// 3. 生成多尺寸 ICO（Windows 桌面/任务栏/安装包用）
const sizes = [256, 128, 64, 48, 32, 16]
const pngBuffers = await Promise.all(
  sizes.map((s) => sharp(basePng).resize(s, s).toBuffer())
)
const icoBuffer = await pngToIco(pngBuffers)
writeFileSync(icoPath, icoBuffer)
console.log('✔ assets/icon.ico (sizes:', sizes.join(', ') + ')')
