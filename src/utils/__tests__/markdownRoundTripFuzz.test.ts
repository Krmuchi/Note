import { describe, it, expect, beforeEach } from 'vitest'
import { markdownToEditorHtml } from '@/utils/markdownToHtml'
import { editorHtmlToMarkdown } from '@/utils/editorHtmlToMarkdown'

/**
 * 往返保真的**模糊测试**（随机组合）。
 *
 * 为什么必须有这一层：定向测试只能覆盖我"想得到"的组合，而真实用户的文档是
 * 各种块随机拼起来的。往返一旦有损，用户每敲一个键都会**静默改写自己的文档**——
 * 这是本方案最不可接受的失败模式，必须用组合覆盖把边界撞出来。
 *
 * 策略：从块级片段池里随机抽取拼接，验证 `md → HTML → md` 恒等。
 * 用固定种子的伪随机（不是 Math.random），失败可复现。
 */

/** 块级片段池：覆盖每一种块类型，含容易出错的边界情况 */
const BLOCK_POOL = [
  '普通段落文字。',
  '带标点的段落，含逗号、顿号；以及分号。',
  '# 一级标题',
  '## 二级标题',
  '### 三级标题',
  '#### 四级标题',
  '##### 五级标题',
  '###### 六级标题',
  '- 无序项一\n- 无序项二',
  '- 无序项',
  '1. 有序项一\n2. 有序项二',
  '1. 有序项',
  '- [ ] 未完成任务',
  '- [x] 已完成任务',
  '> 引用一行',
  '```\ncode line\n```',
  '```ts\nconst a = 1\n```',
  '---',
  '**加粗文字**',
  '*斜体文字*',
  '~~删除线~~',
  '`行内代码`',
  '含 **加粗** 与 *斜体* 的段落',
  '含 `code` 与 ~~删除~~ 的段落',
  '[链接文字](https://example.com)',
  '![图片描述](img.png)',
  '| 列一 | 列二 |\n| --- | --- |\n| 值一 | 值二 |',
  '文字里带 emoji 🎉 和中文标点。',
  '  行首有空格的段落。',
  '段落末尾有句号。',
]

/** 固定种子的线性同余伪随机（可复现） */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    // 数值参数取自 Numerical Recipes；只为可复现，不追求统计质量
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function mount(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

function roundTrip(md: string): string {
  return editorHtmlToMarkdown(mount(markdownToEditorHtml(md)))
}

/** 随机拼一篇文档：count 个块，块间空行分隔 */
function randomDoc(rand: () => number, count: number): string {
  const picked: string[] = []
  for (let i = 0; i < count; i++) {
    picked.push(BLOCK_POOL[Math.floor(rand() * BLOCK_POOL.length)])
  }
  return picked.join('\n\n')
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('往返模糊测试（随机组合）', () => {
  /*
   * 200 组随机文档 × 1~8 个块。
   * 组数取 200：既能覆盖大量组合，又不会让单元测试变慢
   * （每轮只做字符串与 DOM 操作，实测总耗时在毫秒级）。
   */
  it('200 组随机文档往返无损', () => {
    const rand = makeRandom(20261020)
    const failures: Array<{ md: string; out: string }> = []

    for (let i = 0; i < 200; i++) {
      const count = 1 + Math.floor(rand() * 8)
      const md = randomDoc(rand, count)
      const out = roundTrip(md)
      if (out !== md) failures.push({ md, out })
    }

    // 失败时打印前 3 例，便于定位是哪类块组合出问题
    if (failures.length) {
      const detail = failures
        .slice(0, 3)
        .map((f, i) => `#${i + 1}\n  输入: ${JSON.stringify(f.md)}\n  输出: ${JSON.stringify(f.out)}`)
        .join('\n')
      throw new Error(`${failures.length}/200 组往返有损：\n${detail}`)
    }
    expect(failures).toHaveLength(0)
  })

  it('单个块逐一验证（不遗漏任何块类型）', () => {
    const failures: Array<{ md: string; out: string }> = []
    for (const md of BLOCK_POOL) {
      const out = roundTrip(md)
      if (out !== md) failures.push({ md, out })
    }
    if (failures.length) {
      const detail = failures
        .map((f) => `输入: ${JSON.stringify(f.md)}\n  输出: ${JSON.stringify(f.out)}`)
        .join('\n')
      throw new Error(`${failures.length} 个块往返有损：\n${detail}`)
    }
    expect(failures).toHaveLength(0)
  })

  it('两次往返等于一次（幂等：不会累积漂移）', () => {
    /*
     * 用户会反复编辑同一篇文档。若每次往返都产生细微变化，
     * 内容会随编辑次数逐渐漂移 —— 这比"一次有损"更隐蔽也更危险。
     */
    const rand = makeRandom(777)
    for (let i = 0; i < 50; i++) {
      const md = randomDoc(rand, 1 + Math.floor(rand() * 6))
      const once = roundTrip(md)
      const twice = roundTrip(once)
      expect(twice).toBe(once)
    }
  })

  it('空文档往返不抛错', () => {
    expect(() => roundTrip('')).not.toThrow()
  })

  it('只有空白的文档往返不抛错', () => {
    expect(() => roundTrip('   \n\n  \n')).not.toThrow()
  })
})
