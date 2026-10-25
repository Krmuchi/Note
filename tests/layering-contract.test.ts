import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 分层契约：防止依赖方向倒置。
 *
 * 背景：5 个 hooks 曾直接 `import { toast } from '@/components/common/Toast'`，
 * 让 hooks 反向依赖 UI 组件 —— 这些 hook 因此在纯逻辑测试里不可用，
 * 且 UI 组件的重构会牵动业务逻辑。此类倒置不会报错、不会崩，只会慢慢腐蚀分层。
 *
 * 规则：
 *  - `src/hooks/` 不得 import `@/components/`（hooks 属于业务层，位于组件之下）
 *  - `src/utils/` 不得 import `@/components/` 或 `@/hooks/`（utils 是纯函数层）
 *  - `src/store/` 不得 import `@/components/` 或 `@/hooks/`
 *  - `src/services/` 不得 import `@/components/` 或 `@/hooks/`
 *
 * 允许的例外：`import type { X } from '@/components/...'` 仍算违规 ——
 * 类型依赖同样构成耦合，需要时把类型下沉到 `src/types/`。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 递归收集目录下的 ts/tsx（跳过测试目录与测试文件） */
function collectSources(relDir: string): string[] {
  const abs = path.join(root, relDir)
  if (!fs.existsSync(abs)) return []

  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry.name)) continue
      if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue
      out.push(full)
    }
  }
  walk(abs)
  return out
}

/** 提取文件里所有 import/export-from 的模块说明符 */
function importsOf(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8')
  const specs: string[] = []
  const re = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[^;\n]*?from\s+['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) specs.push(m[1])
  // 副作用导入：import '@/components/x.css'
  const bare = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g
  while ((m = bare.exec(text))) specs.push(m[1])
  return specs
}

interface LayerRule {
  dir: string
  forbidden: RegExp
  reason: string
}

const RULES: LayerRule[] = [
  {
    dir: 'src/hooks',
    forbidden: /^@\/components\//,
    reason: 'hooks 属于业务层，应依赖 services / utils，而不是 UI 组件',
  },
  {
    dir: 'src/utils',
    forbidden: /^(@\/components\/|@\/hooks\/)/,
    reason: 'utils 是纯函数层，不得依赖 UI 或 React hooks',
  },
  {
    dir: 'src/store',
    forbidden: /^(@\/components\/|@\/hooks\/)/,
    reason: 'store 是状态层，不得依赖 UI 或 React hooks',
  },
  {
    dir: 'src/services',
    forbidden: /^(@\/components\/|@\/hooks\/)/,
    reason: 'services 是基础设施层，不得依赖 UI 或 React hooks',
  },
]

describe('分层契约：依赖方向', () => {
  RULES.forEach((rule) => {
    it(`${rule.dir} 不依赖上层（${rule.reason}）`, () => {
      const violations: string[] = []

      for (const file of collectSources(rule.dir)) {
        for (const spec of importsOf(file)) {
          if (rule.forbidden.test(spec)) {
            const rel = path.relative(root, file).replace(/\\/g, '/')
            violations.push(`${rel} -> ${spec}`)
          }
        }
      }

      expect(violations).toEqual([])
    })
  })
})
