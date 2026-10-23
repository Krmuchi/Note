import { describe, it, expect } from 'vitest'
import {
  collectOutlineHeadings,
  findActiveHeadingId,
  lineIndexToOffset,
  scrollTopToLineIndex,
} from '@/utils/outlineActive'

/**
 * 大纲"当前章节"计算。
 *
 * 契约重点：偏移落在标题之前时不属于任何章节（不能高亮第一个标题造成误判）、
 * 标题 id 必须与 DocumentOutline 的生成规则完全一致（否则高亮永远对不上）。
 */

const headings = [
  { id: '1-A', level: 1, position: 0 },
  { id: '2-B', level: 2, position: 20 },
  { id: '2-C', level: 2, position: 50 },
]

describe('findActiveHeadingId', () => {
  it('偏移正好在标题起点时高亮该标题', () => {
    expect(findActiveHeadingId(headings, 20)).toBe('2-B')
  })

  it('偏移在两个标题之间时高亮前一个', () => {
    expect(findActiveHeadingId(headings, 35)).toBe('2-B')
    expect(findActiveHeadingId(headings, 999)).toBe('2-C')
  })

  it('偏移在第一个标题之前时不高亮任何章节', () => {
    expect(findActiveHeadingId([{ id: '1-A', level: 1, position: 10 }], 5)).toBeNull()
  })

  it('没有标题时返回 null', () => {
    expect(findActiveHeadingId([], 100)).toBeNull()
  })

  it('非法偏移返回 null（不抛错）', () => {
    expect(findActiveHeadingId(headings, Number.NaN)).toBeNull()
    expect(findActiveHeadingId(headings, -1)).toBeNull()
  })
})

describe('lineIndexToOffset', () => {
  const content = 'a\nbb\nccc'

  it('第 0 行偏移为 0', () => {
    expect(lineIndexToOffset(content, 0)).toBe(0)
  })

  it('按行累加字符与换行符', () => {
    // 'a' + '\n' = 2
    expect(lineIndexToOffset(content, 1)).toBe(2)
    // + 'bb' + '\n' = 5
    expect(lineIndexToOffset(content, 2)).toBe(5)
  })

  it('越界行号收敛到正文长度（不越界）', () => {
    expect(lineIndexToOffset(content, 999)).toBe(content.length)
  })

  it('负数行号按 0 处理', () => {
    expect(lineIndexToOffset(content, -5)).toBe(0)
  })
})

describe('scrollTopToLineIndex', () => {
  it('按行高换算行号', () => {
    expect(scrollTopToLineIndex(240, 24)).toBe(10)
  })

  it('行高非法时返回 0（避免除零得到 Infinity）', () => {
    expect(scrollTopToLineIndex(240, 0)).toBe(0)
    expect(scrollTopToLineIndex(240, Number.NaN)).toBe(0)
  })

  it('未滚动时返回 0', () => {
    expect(scrollTopToLineIndex(0, 24)).toBe(0)
    expect(scrollTopToLineIndex(-10, 24)).toBe(0)
  })
})

describe('collectOutlineHeadings', () => {
  it('提取标题的层级与字符偏移', () => {
    const result = collectOutlineHeadings('# 标题\n\n正文\n\n## 二级')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ level: 1, position: 0 })
    expect(result[1].level).toBe(2)
    // '# 标题' 4 字符 + '\n\n' + '正文' 2 字符 + '\n\n' = 10，'## 二级' 从下标 10 开始
    expect(result[1].position).toBe(10)
  })

  it('同名同级标题追加序号，保证 id 唯一（与 DocumentOutline 规则一致）', () => {
    const result = collectOutlineHeadings('# 同名\n\n# 同名')
    expect(result.map(h => h.id)).toEqual(['1-同名', '1-同名~1'])
  })

  it('空内容返回空数组', () => {
    expect(collectOutlineHeadings('')).toEqual([])
  })

  it('正文里的 # 号不会被误判为标题', () => {
    // 只有行首的 # 才算标题（正则带 ^ 锚点）
    expect(collectOutlineHeadings('这不是标题 # 内容')).toEqual([])
  })
})
