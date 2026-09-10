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
