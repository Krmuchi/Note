import { useState, useCallback, useEffect } from 'react'

export type ThemeType = 'light' | 'dark' | 'green' | 'warm' | 'deep-blue' | 'purple-dark' | 'green-dark'

const THEME_STORAGE_KEY = 'notes-theme'
const THEME_VALUES: ThemeType[] = ['light', 'dark', 'green', 'warm', 'deep-blue', 'purple-dark', 'green-dark']

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

export const useTheme = (): {
  theme: ThemeType
  toggleTheme: () => void
  setCustomTheme: (newTheme: ThemeType) => void
  setTheme: (newTheme: ThemeType) => void
} => {
  const [theme, setTheme] = useState<ThemeType>(() => {
    const saved = safeGetItem(THEME_STORAGE_KEY)
    if (saved && THEME_VALUES.includes(saved as ThemeType)) {
      return saved as ThemeType
    }
    return 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    safeSetItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  // 应用启动时恢复持久化的自定义主题色（跟随主题重新计算色阶）
  useEffect(() => {
    restoreCustomPrimaryColor()
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }, [])

  const setCustomTheme = useCallback((newTheme: ThemeType) => {
    setTheme(newTheme)
  }, [])

  return { theme, toggleTheme, setCustomTheme, setTheme: setCustomTheme }
}

/* ================= 自定义主题色 ================= */

const CUSTOM_COLOR_STORAGE_KEY = 'notes-custom-primary-color'
const CUSTOM_COLOR_STYLE_ID = 'custom-primary-palette'

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
  const lightScale = [
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
    try {
      localStorage.removeItem(CUSTOM_COLOR_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}

/** 启动时恢复持久化的自定义主色 */
export const restoreCustomPrimaryColor = (): void => {
  const saved = safeGetItem(CUSTOM_COLOR_STORAGE_KEY)
  if (saved && /^#[0-9a-fA-F]{6}$/.test(saved)) {
    applyCustomPrimaryColor(saved)
  }
}

export const THEME_OPTIONS: { id: ThemeType; name: string; icon: string; description: string }[] = [
  { id: 'light', name: '亮色', icon: '☀️', description: '清新明亮的默认主题' },
  { id: 'dark', name: '暗色', icon: '🌙', description: '护眼暗色主题' },
  { id: 'green', name: '护眼绿', icon: '🌿', description: '柔和的绿色主题' },
  { id: 'warm', name: '暖色调', icon: '🌅', description: '温暖的橙色主题' },
  { id: 'deep-blue', name: '深邃蓝', icon: '🌊', description: '专业的蓝色主题' },
  { id: 'purple-dark', name: '暗夜紫', icon: '🔮', description: '神秘的紫色暗色主题' },
  { id: 'green-dark', name: '暗夜绿', icon: '🌲', description: '自然的绿色暗色主题' },
]

export type FontType = 'sans' | 'serif' | 'mono' | 'chinese' | 'noto-sans' | 'noto-serif' | 'lxgw-wenkai'

const FONT_STORAGE_KEY = 'notes-font'
const FONT_VALUES: FontType[] = ['sans', 'serif', 'mono', 'chinese', 'noto-sans', 'noto-serif', 'lxgw-wenkai']

export const useFont = (): {
  font: FontType
  setCustomFont: (newFont: FontType) => void
  setFont: (newFont: FontType) => void
} => {
  const [font, setFont] = useState<FontType>(() => {
    const saved = safeGetItem(FONT_STORAGE_KEY)
    if (saved && FONT_VALUES.includes(saved as FontType)) {
      return saved as FontType
    }
    return 'sans'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-font', font)
    safeSetItem(FONT_STORAGE_KEY, font)
  }, [font])

  const setCustomFont = useCallback((newFont: FontType) => {
    setFont(newFont)
  }, [])

  return { font, setCustomFont, setFont: setCustomFont }
}

export const FONT_OPTIONS: { id: FontType; name: string; description: string; preview: string }[] = [
  { id: 'sans', name: '默认无衬线', description: '系统默认字体，清晰易读', preview: 'Aa 你好' },
  { id: 'serif', name: '衬线字体', description: '传统印刷风格，适合长文阅读', preview: 'Aa 你好' },
  { id: 'mono', name: '等宽字体', description: '适合代码和技术文档', preview: 'Aa 你好' },
  { id: 'chinese', name: '中文优化', description: '针对中文优化的字体', preview: 'Aa 你好' },
  { id: 'noto-sans', name: '思源黑体', description: 'Google 开源黑体，现代简洁', preview: 'Aa 你好' },
  { id: 'noto-serif', name: '思源宋体', description: 'Google 开源宋体，优雅古典', preview: 'Aa 你好' },
  { id: 'lxgw-wenkai', name: '霞鹜文楷', description: '开源楷体，温润典雅', preview: 'Aa 你好' },
]
