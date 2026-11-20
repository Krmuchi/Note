import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 样式契约测试：组件里用到的类名必须在 CSS 中存在。
 * 背景：Toast 组件曾使用 .toast / .toast-message，而 CSS 写的是 .toast-item / .toast-content，
 * 导致提示卡片完全无样式且没有任何报错。此测试用于防止同类"类名漂移"回归。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readAllCss(): string {
  const stylesDir = path.join(root, 'src', 'styles')
  const styleFiles = fs
    .readdirSync(stylesDir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => fs.readFileSync(path.join(stylesDir, f), 'utf8'))

  return [
    ...styleFiles,
    fs.readFileSync(path.join(root, 'src', 'App.css'), 'utf8'),
    fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8'),
  ].join('\n')
}

/** 提取 className 字面量中的类名（模板变量按空白处理） */
function extractClassTokens(relativePath: string): string[] {
  const text = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const tokens = new Set<string>()
  const re = /className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g
  let match: RegExpExecArray | null

  while ((match = re.exec(text))) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? '').replace(/\$\{[^}]*\}/g, ' ')
    raw.split(/\s+/).forEach((token) => {
      const name = token.trim()
      if (name && /^[a-zA-Z][\w-]*$/.test(name)) tokens.add(name)
    })
  }

  return [...tokens]
}

const COMPONENTS = [
  'src/components/common/Toast.tsx',
  'src/components/common/Loading.tsx',
  'src/components/common/EmptyState.tsx',
  'src/ErrorBoundary.tsx',
]

describe('样式契约：组件类名都能在 CSS 中找到', () => {
  const css = readAllCss()

  COMPONENTS.forEach((component) => {
    it(`${path.basename(component)} 无缺失样式`, () => {
      const missing = extractClassTokens(component).filter((token) => !css.includes(`.${token}`))
      expect(missing).toEqual([])
    })
  })
})

describe('样式契约：触屏可读性基线', () => {
  /** 扫全部 CSS 文本（styles/*.css + App.css + index.css） */
  function allCssFiles(): { file: string; text: string }[] {
    const stylesDir = path.join(root, 'src', 'styles')
    return [
      ...fs
        .readdirSync(stylesDir)
        .filter((f) => f.endsWith('.css'))
        .map((f) => ({ file: `src/styles/${f}`, text: fs.readFileSync(path.join(stylesDir, f), 'utf8') })),
      { file: 'src/App.css', text: fs.readFileSync(path.join(root, 'src/App.css'), 'utf8') },
      { file: 'src/index.css', text: fs.readFileSync(path.join(root, 'src/index.css'), 'utf8') },
    ]
  }

  it('基础层提供 -webkit-tap-highlight-color: transparent', () => {
    const index = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8')
    expect(index).toContain('-webkit-tap-highlight-color: transparent')
  })

  it('24px 档交互按钮都有 ::after 热区外扩（视觉尺寸不变）', () => {
    const css = readAllCss()
    // 命中区不足 32px 的交互按钮；用透明 ::after 外扩，可见盒子保持原尺寸。
    // block-handle-btn 是文档化的例外（扩宽会压住正文 / 与相邻按钮互抢），不在断言内。
    const NEEDS_EXPANSION = [
      '.doc-action-btn',
      '.quick-note-action-btn',
      '.toast-close',
      '.ai-selection-close',
      '.outline-close-btn',
      '.comments-close-btn',
      '.toolbar-collapse-btn',
      '.favorite-item-remove',
      '.search-clear',
      '.sidebar-filter-clear',
      '.btn-add-notebook',
      '.vh-tag-modal-close',
      '.image-resize-handle',
    ]
    const missing = NEEDS_EXPANSION.filter((cls) => !css.includes(`${cls}::after`))
    expect(missing).toEqual([])
  })

  it('全仓不再有 <12px 的散装 font-size（--font-size-* 令牌体系除外）', () => {
    // 令牌 --font-size-xs 已抬升为 12px（与 sm 合流）；本测试拦"font-size: 9/10/11px"散装字面值。
    const offenders: string[] = []
    for (const { file, text } of allCssFiles()) {
      text.split('\n').forEach((line, i) => {
        if (/font-size:\s*(?:9|10|11)px/.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
