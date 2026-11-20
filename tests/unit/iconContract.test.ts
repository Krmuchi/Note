import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 组件图标契约：图标字段的字面量不许是 emoji。
 *
 * EmptyState 的组件约定明确写着「传 <IconXxx /> 而非 emoji 字符」——
 * emoji 渲染效果随平台/字体漂移（Windows Segoe UI Emoji vs 苹果彩蛋），
 * 且与全仓统一的 SVG 线性图标集（24px viewBox、1.5 stroke、currentColor）
 * 视觉割裂。历史上 emoji 图标散落在空态、选项、按钮图标各处，本契约防回归。
 *
 * 覆盖范围：icon="..."（JSX 属性）与 icon: '...'（配置对象字段）里的**真实 emoji**
 * （Extended_Pictographic）。纯字形符号（✕ ↑ ↓ ＋）不在 emoji 之列；
 * notebook 图标是**用户数据**（NotebookIconPicker 让用户选 emoji），只排除测试夹具不够 ——
 * 组件源码里本就不该有字面量 notebook emoji，夹具在 __tests__ 内已排除。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SRC_DIR = path.join(root, 'src')

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // 测试夹具里的 notebook emoji（'⭐'/'📘'）是用户数据模拟，不是组件图标
      if (entry.name === '__tests__') continue
      walkTsx(full, out)
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      out.push(full)
    }
  }
  return out
}

describe('组件图标契约（禁 emoji）', () => {
  it('icon 字段的字面量不包含 emoji', () => {
    const emojiRe = /\p{Extended_Pictographic}/u
    const iconLiteralRe = /icon\s*[:=]\s*(['"`])([^'"`]*)\1/g
    const violations: string[] = []

    for (const file of walkTsx(SRC_DIR)) {
      const text = fs.readFileSync(file, 'utf8')
      let match: RegExpExecArray | null
      iconLiteralRe.lastIndex = 0
      while ((match = iconLiteralRe.exec(text)) !== null) {
        const value = match[2]
        if (emojiRe.test(value)) {
          const line = text.slice(0, match.index).split('\n').length
          violations.push(`${path.relative(root, file)}:${line} icon: '${value}'`)
        }
      }
    }

    expect(
      violations,
      '图标字段请传 <IconXxx />（src/components/common/Icon.tsx），不要 emoji：\n' + violations.join('\n'),
    ).toEqual([])
  })
})