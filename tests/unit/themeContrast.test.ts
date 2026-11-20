import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { contrastRatio, readableTextColor } from '@/utils/color'

/**
 * 主题对比度契约（V3）。
 *
 * 主色按钮用的是「主色底 + --on-primary 文字色」，所以每个主题都必须给出
 * 与该主题 primary-500 相配的文字色。这里直接读 CSS 源码逐个校验，
 * 避免以后调色时把某个主题的字调成看不清（预设里本来就有橙/绿/紫这类亮主色）。
 */

const MIN_RATIO = 3

interface ThemePalette {
  selector: string
  primary: string
  onPrimary: string
}

function collectPalettes(): ThemePalette[] {
  const files = ['src/index.css', 'src/styles/themes.css']
  const palettes: ThemePalette[] = []

  for (const file of files) {
    const css = fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8')
    const blockRe = /([^{}]+)\{([^{}]*)\}/g
    let match: RegExpExecArray | null

    while ((match = blockRe.exec(css)) !== null) {
      const selector = match[1]
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim()
        .replace(/\s+/g, ' ')
      const body = match[2]
      const primaryMatch = body.match(/--primary-500:\s*([^;]+);/)
      if (!primaryMatch) continue

      const onPrimaryMatch = body.match(/--on-primary:\s*([^;]+);/)
      palettes.push({
        selector,
        primary: primaryMatch[1].trim(),
        onPrimary: onPrimaryMatch ? onPrimaryMatch[1].trim() : '#ffffff',
      })
    }
  }

  return palettes
}

const palettes = collectPalettes()

describe('主题对比度契约', () => {
  it('至少覆盖到全部预设主题（防止解析失效导致"空跑通过"）', () => {
    const selectors = palettes.map((p) => p.selector).join(' ')
    // 亮色主题定义在 :root，其余是 [data-theme="..."]
    expect(selectors).toContain(':root')
    for (const theme of ['dark', 'green', 'warm', 'deep-blue', 'purple-dark', 'green-dark']) {
      expect(selectors).toContain(theme)
    }
  })

  it('每个主题的主色与其文字色的对比度都不低于 3:1', () => {
    const failures = palettes
      .map((p) => ({ ...p, ratio: contrastRatio(p.primary, p.onPrimary) }))
      .filter((p) => p.ratio < MIN_RATIO)
      .map((p) => `${p.selector} → primary ${p.primary} / on-primary ${p.onPrimary} = ${p.ratio.toFixed(2)}`)

    expect(failures).toEqual([])
  })

  it('自定义主色的调色板声明了 --on-primary', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/shared/hooks/index.ts'), 'utf-8')
    expect(source).toContain('--on-primary')
  })

  it('readableTextColor 与主题契约用的是同一套规则', () => {
    // 浅色主色必须换深色字，深色主色保持白字
    expect(readableTextColor('#ff9800')).not.toBe('#ffffff')
    expect(readableTextColor('#1677ff')).toBe('#ffffff')
  })
})

/**
 * 低阶主色是「浅底」语义的契约。
 *
 * 全仓 58 处把 --primary-50 当选中态/高亮块**底色**（侧栏选中项、标签 chip、
 * 搜索命中、版本列表…），另有 10 处用 --primary-100 叠在其上。这要求低两档在
 * **亮色与暗色主题下都是"比背景更浅或略带主色倾向"的浅底**。
 *
 * 回归背景：暗色主题曾把它们定义成 #002c8c / #003eb3 这类饱和深蓝 ——
 * 语义正好相反，侧栏选中项在暗色下整块变成刺眼的蓝砖（白字压在上面只剩 2.9:1）。
 * 本测试按"能否安全当浅底用"来判定：亮度足够高，或带透明度（叠色）。
 */
describe('低阶主色的浅底语义', () => {
  const THEME_FILES = ['src/index.css', 'src/styles/themes.css']

  interface LowTier {
    selector: string
    value: string
  }

  function collectLowTiers(): LowTier[] {
    const tiers: LowTier[] = []
    for (const file of THEME_FILES) {
      const css = fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8')
      const blockRe = new RegExp('([^{}]+)\\{([^{}]*)\\}', 'g')
      let match: RegExpExecArray | null
      while ((match = blockRe.exec(css)) !== null) {
        const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ')
        const valueMatch = match[2].match(/--primary-50:\s*([^;]+);/)
        if (!valueMatch) continue
        tiers.push({ selector, value: valueMatch[1].trim() })
      }
    }
    return tiers
  }

  const lowTiers = collectLowTiers()

  it('覆盖到了全部主题', () => {
    const selectors = lowTiers.map((t) => t.selector).join(' ')
    expect(selectors).toContain(':root')
    for (const theme of ['dark', 'green', 'warm', 'deep-blue', 'purple-dark', 'green-dark']) {
      expect(selectors).toContain(theme)
    }
  })

  it('--primary-50 要么足够亮，要么是半透明叠色，都不能是饱和深色', () => {
    const failures = lowTiers
      .filter((t) => {
        // 半透明叠色：叠在任何底色上都只会带一点主色倾向，视为合规
        if (/rgba\(|\/\s*0\./.test(t.value)) return false
        const hex = t.value.match(/^#([0-9a-fA-F]{6})$/)
        if (!hex) return true // 认不出的写法一律报出来，避免静默通过
        const v = hex[1]
        const r = parseInt(v.slice(0, 2), 16)
        const g = parseInt(v.slice(2, 4), 16)
        const b = parseInt(v.slice(4, 6), 16)
        // 相对亮度：低于 0.35 说明是深色，在暗画布上会糊成色砖
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        return lum < 0.35
      })
      .map((t) => `${t.selector} → --primary-50: ${t.value}`)

    expect(failures).toEqual([])
  })
})
