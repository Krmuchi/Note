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
