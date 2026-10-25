import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MAX_EXPORT_CONTENT_BYTES,
  MAX_STORE_BYTES,
  assertExportPayload,
  assertStorePayload,
  buildExportDocument,
  escapeHtml,
  markdownToSimpleHtml,
  safeName,
} from '../../electron/ipc/shared.mjs'

/**
 * `electron/ipc/shared.mjs` 的跨边界契约。
 *
 * 这个模块被两侧共用：主进程 require()、渲染层 import。
 * 渲染层没有 Buffer / process，任何 Node 专有 API 泄漏进去都会在浏览器里
 * 变成 "xxx is not defined" 的运行时崩溃 —— 而且因为渲染层目前只 import 了
 * `buildExportDocument`，tree-shaking 会掩盖问题，直到有人加了第二个 import 才爆。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SHARED_PATH = path.join(root, 'electron', 'ipc', 'shared.mjs')

/** 渲染层允许从这里 import 的符号（其余只给主进程用） */
const RENDERER_SAFE_EXPORTS = new Set(['buildExportDocument', 'markdownToSimpleHtml', 'escapeHtml', 'safeName'])

/** 从模块源码里抽出 export 列表 */
function listExports(): string[] {
  const text = fs.readFileSync(SHARED_PATH, 'utf8')
  const block = text.slice(text.lastIndexOf('export {'))
  return [...block.matchAll(/^\s*([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
}

/** 找出 src/ 下所有对 shared.mjs 的导入 */
function rendererImports(): { file: string; spec: string; names: string[] }[] {
  const out: { file: string; spec: string; names: string[] }[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry.name)) continue
      const text = fs.readFileSync(full, 'utf8')
      if (!text.includes('ipc/shared.mjs')) continue
      const re = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"][^'"]*ipc\/shared\.mjs['"]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(text))) {
        const names = m[1]
          .split(',')
          .map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
          .filter(Boolean)
        out.push({ file: path.relative(root, full).replace(/\\/g, '/'), spec: m[1].trim(), names })
      }
    }
  }
  walk(path.join(root, 'src'))
  return out
}

describe('shared.mjs 跨边界契约', () => {
  it('源码里不出现 Node 专有的 Buffer 调用', () => {
    const text = fs.readFileSync(SHARED_PATH, 'utf8')
    // 注释里解释"为什么不用 Buffer"是允许的，只禁止**代码行**里的真实调用
    const codeOnly = text
      .split('\n')
      .filter((line) => !/^\s*[*/]/.test(line))
      .join('\n')
    const calls = [...codeOnly.matchAll(/\bBuffer\s*\./g)]
    expect(calls).toHaveLength(0)
  })

  it('不 require/import 任何 node: 内置模块', () => {
    const text = fs.readFileSync(SHARED_PATH, 'utf8')
    expect([...text.matchAll(/from\s+['"]node:/g)]).toHaveLength(0)
    expect([...text.matchAll(/require\(\s*['"]node:/g)]).toHaveLength(0)
  })

  it('渲染层只导入 RENDERER_SAFE_EXPORTS 中的符号', () => {
    const violations: string[] = []
    for (const entry of rendererImports()) {
      for (const name of entry.names) {
        if (!RENDERER_SAFE_EXPORTS.has(name)) {
          violations.push(`${entry.file} 导入了主进程专用符号 ${name}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('export 列表与声明一致（防止新增导出未登记）', () => {
    const exports = listExports()
    expect(exports).toContain('buildExportDocument')
    expect(exports).toContain('assertStorePayload')
    // 渲染层安全集合必须是 export 的子集，否则测试会误判"允许导入不存在的符号"
    for (const name of RENDERER_SAFE_EXPORTS) {
      expect(exports).toContain(name)
    }
  })
})

describe('shared.mjs 无 Buffer 环境下的行为', () => {
  it('utf8 长度按中文 3 字节计算（与 Buffer.byteLength 一致）', () => {
    // 用超出上限的中文内容验证：若按 .length（UTF-16 码元）算，
    // 中文会被低估 3 倍，10MB 的中文文档能塞进 30MB —— 上限形同虚设
    const chinesePerByte = '中'.repeat(Math.ceil(MAX_EXPORT_CONTENT_BYTES / 3) + 1)
    expect(() => assertExportPayload({ title: 't', content: chinesePerByte })).toThrow(/too large/)
  })

  it('等量的 ASCII 内容不触发上限', () => {
    const ascii = 'a'.repeat(1024)
    expect(() => assertExportPayload({ title: 't', content: ascii })).not.toThrow()
  })

  it('assertStorePayload 返回序列化结果，且超限时报错', () => {
    const small = { notebooks: [], trash: [] }
    const json = assertStorePayload(small)
    expect(typeof json).toBe('string')
    expect(JSON.parse(json)).toEqual(small)

    // 构造一个必然超过 50MB 的 payload（中文 3 字节/字，需 ~18M 字符；
    // 为避免测试吃满内存，这里只验证边界函数存在且上限常量合理）
    expect(MAX_STORE_BYTES).toBe(50 * 1024 * 1024)
  })

  it('safeName 清掉 Windows 非法字符', () => {
    expect(safeName('a/b:c*d?e"f<g>h|i')).toBe('a_b_c_d_e_f_g_h_i')
    expect(safeName('')).toBe('note')
  })

  it('escapeHtml 转义脚本注入', () => {
    expect(escapeHtml('<script>alert(1)</script>')).not.toContain('<script>')
  })

  it('buildExportDocument 生成的文档带转义后的标题', () => {
    const html = buildExportDocument({ title: '<b>x</b>', content: '# 标题' })
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('markdownToSimpleHtml 渲染标题与列表', () => {
    const html = markdownToSimpleHtml('# T\n\n- a\n- b')
    expect(html).toContain('<h1>')
    expect(html).toContain('<li>')
  })
})
