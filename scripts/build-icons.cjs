// 应用图标生成器（体验优化方案 D1）。
//
// 为什么需要脚本而不是放一个 .ico 文件：
// 1. Electron 的 nativeImage 不支持 SVG，Windows 安装包必须要有位图图标；
// 2. 仓库里只有 public/favicon.svg，无法直接光栅化（不引入 sharp/resvg 这类重依赖）；
// 3. 用代码画图可以让"改个色/改个形状"变成改几个常量，而不是重新导出一堆尺寸。
//
// 产出：
//   build/icon.ico  —— Windows 安装包与窗口图标（16/24/32/48/64/128/256 七个尺寸）
//   build/icon.png  —— 512×512，Linux / macOS 目标用
//
// 说明：当前图形是"品牌蓝圆角方块 + 白色文稿 + 折角"的占位设计，
// 拿到正式设计稿后替换本文件里的常量（或直接替换 build/icon.*）即可。
//
// 用法：node scripts/build-icons.cjs

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const BRAND_TOP = { r: 0x3d, g: 0x8b, b: 0xff }
const BRAND_BOTTOM = { r: 0x0f, g: 0x5e, b: 0xd6 }
const PAGE_COLOR = { r: 0xff, g: 0xff, b: 0xff }
const LINE_COLOR = { r: 0x8f, g: 0xb4, b: 0xea }

/** 超采样倍数：圆角与斜线靠它拿到抗锯齿，纯 JS 也能做出可用的图标 */
const SS = 4

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const PNG_SIZE = 512
/** 托盘图标尺寸（系统会按 DPI 缩放） */
const TRAY_SIZE = 64

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

function mix(a, b, t) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  }
}

function insideRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r))
  const dy = Math.max(y0 + r - y, 0, y - (y1 - r))
  if (dx === 0 || dy === 0) return true
  return dx * dx + dy * dy <= r * r
}

/**
 * 归一化坐标 (0..1) → RGBA（0..1）。
 * 绘制顺序：圆角背景 → 白色文稿 → 折角（用背景色"挖"出）→ 文稿上的横线。
 */
function sampleAt(px, py, size) {
  if (!insideRoundRect(px, py, 0, 0, 1, 1, 0.225)) return { r: 0, g: 0, b: 0, a: 0 }

  const bg = mix(BRAND_TOP, BRAND_BOTTOM, clamp01(py))

  // 文稿本体
  const PAGE = { x0: 0.25, y0: 0.2, x1: 0.75, y1: 0.8, r: 0.06 }
  if (!insideRoundRect(px, py, PAGE.x0, PAGE.y0, PAGE.x1, PAGE.y1, PAGE.r)) {
    return { ...bg, a: 1 }
  }

  // 右上折角：用背景色覆盖出一个三角形，形成"翻页"的视觉
  const fold = px >= 0.6 && py <= 0.2 + (px - 0.6) * 1.6
  if (fold) return { ...mix(BRAND_TOP, BRAND_BOTTOM, clamp01(py)), a: 1 }

  // 小尺寸下横线会糊成一团，直接省略（16/24/32 只保留文稿轮廓）
  if (size >= 48) {
    const bars = [
      { y0: 0.365, y1: 0.415, x1: 0.65 },
      { y0: 0.48, y1: 0.53, x1: 0.65 },
      { y0: 0.595, y1: 0.645, x1: 0.55 },
    ]
    for (const bar of bars) {
      if (insideRoundRect(px, py, 0.345, bar.y0, bar.x1, bar.y1, 0.025)) {
        return { ...LINE_COLOR, a: 1 }
      }
    }
  }

  return { ...PAGE_COLOR, a: 1 }
}

function renderRgba(size) {
  const out = Buffer.alloc(size * size * 4)
  const n = SS * SS

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sampleAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, size)
          r += c.r * c.a
          g += c.g * c.a
          b += c.b * c.a
          a += c.a
        }
      }

      const i = (y * size + x) * 4
      // 颜色常量本身就是 0..255，这里只做"预乘还原"，不要再乘一次 255
      out[i] = a > 0 ? Math.round(r / a) : 0
      out[i + 1] = a > 0 ? Math.round(g / a) : 0
      out[i + 2] = a > 0 ? Math.round(b / a) : 0
      out[i + 3] = Math.round((a / n) * 255)
    }
  }

  return out
}

/* ---------------- PNG 编码（zlib + 手写容器，零依赖） ---------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(rgba, size) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------------- ICO 容器（内嵌 PNG，Vista 及以上均支持） ---------------- */

function encodeIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + dir.length

  entries.forEach((entry, i) => {
    const base = i * 16
    const dim = entry.size >= 256 ? 0 : entry.size // 256 用 0 表示
    dir.writeUInt8(dim, base)
    dir.writeUInt8(dim, base + 1)
    dir.writeUInt8(0, base + 2)
    dir.writeUInt8(0, base + 3)
    dir.writeUInt16LE(1, base + 4)
    dir.writeUInt16LE(32, base + 6)
    dir.writeUInt32LE(entry.png.length, base + 8)
    dir.writeUInt32LE(offset, base + 12)
    offset += entry.png.length
  })

  return Buffer.concat([header, dir, ...entries.map((e) => e.png)])
}

/* ---------------- 入口 ---------------- */

function main() {
  const outDir = path.join(__dirname, '..', 'build')
  fs.mkdirSync(outDir, { recursive: true })

  const entries = ICO_SIZES.map((size) => ({ size, png: encodePng(renderRgba(size), size) }))
  const ico = encodeIco(entries)
  const icoPath = path.join(outDir, 'icon.ico')
  fs.writeFileSync(icoPath, ico)

  const png = encodePng(renderRgba(PNG_SIZE), PNG_SIZE)
  const pngPath = path.join(outDir, 'icon.png')
  fs.writeFileSync(pngPath, png)

  // 托盘图标：64×64（100% DPI 下系统用 16px、200% 用 32px，源图 64 足够清晰）
  const trayPath = path.join(outDir, 'tray.png')
  fs.writeFileSync(trayPath, encodePng(renderRgba(TRAY_SIZE), TRAY_SIZE))

  console.log('[icons] ' + icoPath + '  ' + ico.length + ' bytes  (' + ICO_SIZES.join('/') + ')')
  console.log('[icons] ' + pngPath + '  ' + png.length + ' bytes  (' + PNG_SIZE + 'x' + PNG_SIZE + ')')
  console.log('[icons] ' + trayPath + '  ' + TRAY_SIZE + 'x' + TRAY_SIZE)
}

main()
