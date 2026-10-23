/**
 * 颜色对比度（V3）。
 *
 * 起因：自定义主色允许用户挑任意颜色（预设里就有金色 #faad14、青色 #13c2c2 这类浅色），
 * 而所有主色按钮都写死白字 —— 浅色主色下按钮文字几乎看不清。
 * 这里按 WCAG 算出"该配白字还是深色字"，并把它作为 --on-primary 写进调色板。
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** 支持 #rgb / #rrggbb；解析失败返回 null（调用方决定兜底） */
export function parseHex(hex: string): Rgb | null {
  if (typeof hex !== 'string') return null
  const value = hex.trim().replace(/^#/, '')

  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    return {
      r: parseInt(value[0] + value[0], 16),
      g: parseInt(value[1] + value[1], 16),
      b: parseInt(value[2] + value[2], 16),
    }
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    }
  }
  return null
}

/** WCAG 相对亮度（0 = 黑，1 = 白） */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 0

  const channel = (value: number): number => {
    const ratio = value / 255
    return ratio <= 0.03928 ? ratio / 12.92 : Math.pow((ratio + 0.055) / 1.055, 2.4)
  }

  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/** 对比度（1 ~ 21）：WCAG AA 正文要求 4.5，大字号 3 */
export function contrastRatio(background: string, foreground: string): number {
  const light = Math.max(relativeLuminance(background), relativeLuminance(foreground))
  const dark = Math.min(relativeLuminance(background), relativeLuminance(foreground))
  return (light + 0.05) / (dark + 0.05)
}

export const ON_LIGHT_TEXT = '#111827'
export const ON_DARK_TEXT = '#ffffff'

/**
 * 白字可以接受的最低对比度（WCAG 对"大字号 / UI 组件"的门槛是 3:1）。
 *
 * 这里刻意不用"谁对比度高就用谁"：默认品牌蓝 #1677ff 上白字是 4.10、深色字是 4.22，
 * 两者几乎一样 —— 严格取高者会把全应用的主色按钮都翻成深色字，那是审美上的大改，
 * 而用户真正的问题是"金色/青色这类浅色主色下白字根本看不清"（对比度约 1.7）。
 * 所以规则是：白字够用就保持白字（沿用既有视觉语言），不够用才换深色字。
 */
export const MIN_ON_PRIMARY_CONTRAST = 3

/**
 * 返回在该背景上更可读的文字颜色（白 or 近黑）。
 * 无法解析的颜色按"深色背景"处理（此时白字更稳）。
 */
export function readableTextColor(
  background: string,
  lightText: string = ON_DARK_TEXT,
  darkText: string = ON_LIGHT_TEXT,
): string {
  if (!parseHex(background)) return lightText

  const lightContrast = contrastRatio(background, lightText)
  if (lightContrast >= MIN_ON_PRIMARY_CONTRAST) return lightText

  return contrastRatio(background, darkText) > lightContrast ? darkText : lightText
}
