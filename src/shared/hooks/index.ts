import { useSyncExternalStore } from 'react'
import { readableTextColor } from '@/utils/color'

/* ============================================================
   主题 / 字体：模块级外部 store（单例）

   旧实现的缺陷：data-theme / data-font 只在"组件挂载后"的 useEffect 里设置，
   而唯一调用方是 EditorHeader 与 SettingsPanel。于是：
   - 重启后默认停在「开始」页 → 主题与字体根本不生效，必须打开文档/设置才恢复；
   - 深色用户每次启动都被白闪一下（首帧必然是亮色）。

   现在的约定：
   - main.tsx 在首次渲染前调用一次 initTheme()，把持久化值写到 <html> 上；
   - 任何组件都通过 useTheme()/useFont() 读写同一份状态，切换即时全局一致；
   - 主题支持 'system'：跟随系统深浅色，并在系统变化时实时跟随。
   ============================================================ */

export type ThemeType = 'light' | 'dark' | 'system' | 'green' | 'warm' | 'deep-blue' | 'purple-dark' | 'green-dark'
/** 解析后的实际主题（'system' 会被解析为 light / dark） */
export type ResolvedTheme = Exclude<ThemeType, 'system'>

export type FontType = 'sans' | 'serif' | 'mono' | 'chinese' | 'noto-sans' | 'noto-serif' | 'lxgw-wenkai'

const THEME_STORAGE_KEY = 'notes-theme'
const FONT_STORAGE_KEY = 'notes-font'
const CUSTOM_COLOR_STORAGE_KEY = 'notes-custom-primary-color'
const CUSTOM_COLOR_STYLE_ID = 'custom-primary-palette'

const THEME_VALUES: ThemeType[] = ['light', 'dark', 'system', 'green', 'warm', 'deep-blue', 'purple-dark', 'green-dark']
const FONT_VALUES: FontType[] = ['sans', 'serif', 'mono', 'chinese', 'noto-sans', 'noto-serif', 'lxgw-wenkai']
const DARK_THEME_VALUES: ResolvedTheme[] = ['dark', 'purple-dark', 'green-dark']

/* ---------------- 存储与系统偏好 ---------------- */

/** 安全读取 localStorage（隐私模式/禁用存储时返回 null 而不是抛异常） */
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** 安全写入 localStorage（存储不可用或超限时静默降级） */
function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* storage unavailable */
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** 把用户选择的主题解析为实际渲染的主题 */
export function resolveTheme(theme: ThemeType): ResolvedTheme {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return theme
}

/** 是否为暗色系主题（含暗夜紫 / 暗夜绿） */
export function isDarkTheme(theme: ResolvedTheme): boolean {
  return DARK_THEME_VALUES.includes(theme)
}

/* ---------------- 自定义主题色 ---------------- */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '')
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

/** 颜色向 target（白/黑）按 factor 混合 */
function mixColor(hex: string, target: 'white' | 'black', factor: number): string {
  const { r, g, b } = hexToRgb(hex)
  const t = target === 'white' ? 255 : 0
  const mr = Math.round(r + (t - r) * factor)
  const mg = Math.round(g + (t - g) * factor)
  const mb = Math.round(b + (t - b) * factor)
  return `rgb(${mr}, ${mg}, ${mb})`
}

/**
 * 生成按主题区分的主色阶样式表：
 * - 亮色主题：低阶向白浅化（背景/悬停底色），高阶向黑加深
 * - 暗色主题：低阶向黑加深（避免刺眼浅色块），500/600 向白提亮保证可读
 * 通过 <style> 注入而非内联 style，使自定义色随主题切换自动应用对应色阶。
 */
function buildCustomPaletteCss(hex: string): string {
  // 浅色主色（金/青等）上白字看不清，按 WCAG 反算该配深色字
  const onPrimaryLight = readableTextColor(hex)
  const onPrimaryDark = readableTextColor(mixColor(hex, 'white', 0.35))

  const lightScale = [
    `--on-primary: ${onPrimaryLight}`,
    `--primary-50: ${mixColor(hex, 'white', 0.92)}`,
    `--primary-100: ${mixColor(hex, 'white', 0.8)}`,
    `--primary-200: ${mixColor(hex, 'white', 0.6)}`,
    `--primary-300: ${mixColor(hex, 'white', 0.35)}`,
    `--primary-400: ${mixColor(hex, 'white', 0.15)}`,
    `--primary-500: ${hex}`,
    `--primary-600: ${mixColor(hex, 'black', 0.12)}`,
    `--primary-700: ${mixColor(hex, 'black', 0.24)}`,
    `--primary-color: ${hex}`,
  ].join('; ')

  const darkScale = [
    `--on-primary: ${onPrimaryDark}`,
    `--primary-50: ${mixColor(hex, 'black', 0.85)}`,
    `--primary-100: ${mixColor(hex, 'black', 0.7)}`,
    `--primary-200: ${mixColor(hex, 'black', 0.5)}`,
    `--primary-300: ${hex}`,
    `--primary-400: ${mixColor(hex, 'white', 0.2)}`,
    `--primary-500: ${mixColor(hex, 'white', 0.35)}`,
    `--primary-600: ${mixColor(hex, 'white', 0.55)}`,
    `--primary-700: ${mixColor(hex, 'white', 0.75)}`,
    `--primary-color: ${mixColor(hex, 'white', 0.35)}`,
  ].join('; ')

  return `
:root, [data-theme="light"], [data-theme="green"], [data-theme="warm"], [data-theme="deep-blue"] { ${lightScale}; }
[data-theme="dark"], [data-theme="purple-dark"], [data-theme="green-dark"] { ${darkScale}; }
`.trim()
}

/** 清理旧版本直接内联到 documentElement 上的主色变量（会覆盖主题样式） */
function removeLegacyInlinePalette(): void {
  const steps = ['50', '100', '200', '300', '400', '500', '600', '700', 'color']
  for (const step of steps) {
    document.documentElement.style.removeProperty(`--primary-${step}`)
  }
}

/** 应用自定义主色（传 null 清除自定义、恢复主题默认色） */
export const applyCustomPrimaryColor = (color: string | null): void => {
  removeLegacyInlinePalette()
  document.getElementById(CUSTOM_COLOR_STYLE_ID)?.remove()

  if (color) {
    const style = document.createElement('style')
    style.id = CUSTOM_COLOR_STYLE_ID
    style.textContent = buildCustomPaletteCss(color)
    document.head.appendChild(style)
    safeSetItem(CUSTOM_COLOR_STORAGE_KEY, color)
  } else {
    safeRemoveItem(CUSTOM_COLOR_STORAGE_KEY)
  }
}

/** 启动时恢复持久化的自定义主色 */
export const restoreCustomPrimaryColor = (): void => {
  const saved = safeGetItem(CUSTOM_COLOR_STORAGE_KEY)
  if (saved && /^#[0-9a-fA-F]{6}$/.test(saved)) {
    applyCustomPrimaryColor(saved)
  }
}

/* ---------------- 外部 store ---------------- */

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(): void {
  listeners.forEach((listener) => listener())
}

function readStoredTheme(): ThemeType {
  const saved = safeGetItem(THEME_STORAGE_KEY)
  return saved && (THEME_VALUES as string[]).includes(saved) ? (saved as ThemeType) : 'light'
}

function readStoredFont(): FontType {
  const saved = safeGetItem(FONT_STORAGE_KEY)
  return saved && (FONT_VALUES as string[]).includes(saved) ? (saved as FontType) : 'sans'
}

let currentTheme: ThemeType = readStoredTheme()
let currentFont: FontType = readStoredFont()

function applyThemeAttribute(): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', resolveTheme(currentTheme))
}

function applyFontAttribute(): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-font', currentFont)
}

export function setTheme(theme: ThemeType): void {
  if (theme === currentTheme) return
  currentTheme = theme
  safeSetItem(THEME_STORAGE_KEY, theme)
  applyThemeAttribute()
  emit()
}

export function setFont(font: FontType): void {
  if (font === currentFont) return
  currentFont = font
  safeSetItem(FONT_STORAGE_KEY, font)
  applyFontAttribute()
  emit()
}

export function getTheme(): ThemeType {
  return currentTheme
}

export function getResolvedTheme(): ResolvedTheme {
  return resolveTheme(currentTheme)
}

export function getFont(): FontType {
  return currentFont
}

/** 日间/夜间切换：从当前实际渲染的主题出发，避免"跟随系统"时切错方向 */
export function toggleTheme(): void {
  setTheme(isDarkTheme(resolveTheme(currentTheme)) ? 'light' : 'dark')
}

/** 系统深浅色变化时实时跟随（仅当用户选择「跟随系统」） */
function bindSystemThemeChange(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = (): void => {
    if (currentTheme !== 'system') return
    applyThemeAttribute()
    emit()
  }
  if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange)
  else if (typeof query.addListener === 'function') query.addListener(onChange)
}

let initialized = false

/**
 * 首次渲染前调用一次：把持久化的主题 / 字体 / 自定义主色应用到文档。
 * 必须由 main.tsx 直接调用（而不是等某个组件挂载），否则重启后主题不生效。
 */
export function initTheme(): void {
  if (initialized) return
  initialized = true
  applyThemeAttribute()
  applyFontAttribute()
  restoreCustomPrimaryColor()
  bindSystemThemeChange()
}

/* ---------------- React 绑定 ---------------- */

export const useTheme = (): {
  theme: ThemeType
  resolvedTheme: ResolvedTheme
  isDark: boolean
  setTheme: (theme: ThemeType) => void
  setCustomTheme: (theme: ThemeType) => void
  toggleTheme: () => void
} => {
  const theme = useSyncExternalStore(subscribe, getTheme, getTheme)
  const resolvedTheme = useSyncExternalStore(subscribe, getResolvedTheme, getResolvedTheme)

  return {
    theme,
    resolvedTheme,
    isDark: isDarkTheme(resolvedTheme),
    setTheme,
    setCustomTheme: setTheme,
    toggleTheme,
  }
}

export const useFont = (): {
  font: FontType
  setFont: (font: FontType) => void
  setCustomFont: (font: FontType) => void
} => {
  const font = useSyncExternalStore(subscribe, getFont, getFont)
  return { font, setFont, setCustomFont: setFont }
}

/* ---------------- 选项表 ---------------- */

export const THEME_OPTIONS: { id: ThemeType; name: string; icon: string; description: string }[] = [
  { id: 'system', name: '跟随系统', icon: '🖥️', description: '随系统深浅色自动切换' },
  { id: 'light', name: '亮色', icon: '☀️', description: '清新明亮的默认主题' },
  { id: 'dark', name: '暗色', icon: '🌙', description: '护眼暗色主题' },
  { id: 'green', name: '护眼绿', icon: '🌿', description: '柔和的绿色主题' },
  { id: 'warm', name: '暖色调', icon: '🌅', description: '温暖的橙色主题' },
  { id: 'deep-blue', name: '深邃蓝', icon: '🌊', description: '专业的蓝色主题' },
  { id: 'purple-dark', name: '暗夜紫', icon: '🔮', description: '神秘的紫色暗色主题' },
  { id: 'green-dark', name: '暗夜绿', icon: '🌲', description: '自然的绿色暗色主题' },
]

export const FONT_OPTIONS: { id: FontType; name: string; description: string; preview: string }[] = [
  { id: 'sans', name: '默认无衬线', description: '系统默认字体，清晰易读', preview: 'Aa 你好' },
  { id: 'serif', name: '衬线字体', description: '传统印刷风格，适合长文阅读', preview: 'Aa 你好' },
  { id: 'mono', name: '等宽字体', description: '适合代码和技术文档', preview: 'Aa 你好' },
  { id: 'chinese', name: '中文优化', description: '针对中文优化的字体', preview: 'Aa 你好' },
  { id: 'noto-sans', name: '思源黑体', description: 'Google 开源黑体，现代简洁', preview: 'Aa 你好' },
  { id: 'noto-serif', name: '思源宋体', description: 'Google 开源宋体，优雅古典', preview: 'Aa 你好' },
  { id: 'lxgw-wenkai', name: '霞鹜文楷', description: '开源楷体，温润典雅', preview: 'Aa 你好' },
]
