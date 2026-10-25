import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 样式装载契约：拆到懒加载视图里的 CSS，必须由**该视图自己**引入。
 *
 * 背景：把 `settings.css` 等从 App.css 摘掉、改由组件 import 之后，
 * 只要漏掉其中任何一个，对应面板就会在首次打开时无样式（FOUC）——
 * 而且因为条目是懒加载的，单元测试与首屏都发现不了，只有用户点开才看得见。
 *
 * 这组测试把"哪些 CSS 属于懒加载视图、由谁引入"写成可执行的契约。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** CSS 文件 → 必须引入它的组件 */
const LAZY_CSS_OWNERS: Record<string, string> = {
  'tag-panel.css': 'src/components/tags/TagPanel.tsx',
  'settings.css': 'src/components/settings/SettingsPanel.tsx',
  'share-panel.css': 'src/components/share/SharePanel.tsx',
  'quick-note.css': 'src/components/notes/QuickNotePanel.tsx',
}

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

describe('样式装载契约：懒加载视图自带样式', () => {
  it('每个懒加载 CSS 都被其归属组件 import', () => {
    const violations: string[] = []
    for (const [css, owner] of Object.entries(LAZY_CSS_OWNERS)) {
      const text = read(owner)
      const expectImport = `styles/${css}`
      if (!text.includes(expectImport)) {
        violations.push(`${owner} 没有 import ${expectImport}`)
      }
    }
    expect(violations).toEqual([])
  })

  it('这些 CSS 不再出现在 App.css（否则等于没拆）', () => {
    const appCss = read('src/App.css')
    const stillThere = Object.keys(LAZY_CSS_OWNERS).filter((css) => appCss.includes(`styles/${css}`))
    expect(stillThere).toEqual([])
  })

  it('每个 CSS 文件要么在 App.css，要么被某个组件 import（不允许孤儿样式）', () => {
    const appCss = read('src/App.css')
    const allCss = fs
      .readdirSync(path.join(root, 'src', 'styles'))
      .filter((f) => f.endsWith('.css'))

    /** 收集 src 下所有对 styles/*.css 的 import */
    const imported = new Set<string>()
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === '__tests__') continue
          walk(full)
          continue
        }
        if (!/\.tsx?$/.test(entry.name)) continue
        const text = fs.readFileSync(full, 'utf8')
        for (const m of text.matchAll(/styles\/([\w-]+\.css)/g)) imported.add(m[1])
      }
    }
    walk(path.join(root, 'src'))

    const orphans = allCss.filter(
      (css) => !appCss.includes(`styles/${css}`) && !imported.has(css),
    )
    expect(orphans).toEqual([])
  })
})
