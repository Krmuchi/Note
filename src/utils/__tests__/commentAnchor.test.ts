import { describe, it, expect } from 'vitest'
import { anchorFromSelection, findNearestOccurrence, MAX_ANCHOR_QUOTE_LENGTH, resolveAnchor } from '@/utils/commentAnchor'

/**
 * 划词评论锚点。
 *
 * 契约重点：区间漂移后要能重新定位；原文被删改后要明确判定"失效"而不是乱指 ——
 * 把评论锚到一段并非用户选中的文字上，比不锚定更糟。
 */

const doc = '第一段内容。\n第二段里有关键词。\n第三段。'

describe('anchorFromSelection', () => {
  it('由选区生成锚点', () => {
    const anchor = anchorFromSelection(doc, 0, 5)
    expect(anchor).toEqual({ start: 0, end: 5, quote: '第一段内容' })
  })

  it('空选区返回 null（不产生无意义的锚点）', () => {
    expect(anchorFromSelection(doc, 3, 3)).toBeNull()
  })

  it('反向选区（end < start）自动归一化', () => {
    const anchor = anchorFromSelection(doc, 5, 0)
    expect(anchor?.start).toBe(0)
    expect(anchor?.end).toBe(5)
  })

  it('越界返回 null', () => {
    expect(anchorFromSelection(doc, 0, doc.length + 10)).toBeNull()
    expect(anchorFromSelection(doc, -1, 3)).toBeNull()
  })

  it('超长选区只保留前 500 字（避免 anchor 随选区无限膨胀）', () => {
    const long = 'x'.repeat(2000)
    const anchor = anchorFromSelection(long, 0, 2000)

    expect(anchor).not.toBeNull()
    // 区间仍指向完整选区，但 quote 被截断
    expect(anchor!.end).toBe(2000)
    expect(anchor!.quote).toHaveLength(MAX_ANCHOR_QUOTE_LENGTH)
  })

  it('恰好等于上限时不截断', () => {
    const exact = 'y'.repeat(MAX_ANCHOR_QUOTE_LENGTH)
    const anchor = anchorFromSelection(exact, 0, MAX_ANCHOR_QUOTE_LENGTH)
    expect(anchor!.quote).toHaveLength(MAX_ANCHOR_QUOTE_LENGTH)
    expect(anchor!.quote).toBe(exact)
  })
})

describe('resolveAnchor', () => {
  it('原文未改动时精确命中', () => {
    const anchor = { start: 0, end: 5, quote: '第一段内容' }
    const resolved = resolveAnchor(doc, anchor)
    expect(resolved).toMatchObject({ start: 0, end: 5, exact: true })
  })

  it('在前方插入文字后，区间漂移仍能重新定位', () => {
    // 在原文档开头插入 10 个字符 —— 原区间整体后移
    const edited = '插入的新内容！' + doc
    const anchor = { start: 0, end: 5, quote: '第一段内容' }
    const resolved = resolveAnchor(edited, anchor)

    expect(resolved).not.toBeNull()
    expect(resolved!.exact).toBe(false)
    // 新位置应该真的指着那句原文
    expect(edited.slice(resolved!.start, resolved!.end)).toBe('第一段内容')
  })

  it('原文被删除后判定失效（返回 null，不乱指）', () => {
    const edited = doc.replace('第一段内容', '完全不同的内容')
    const anchor = { start: 0, end: 5, quote: '第一段内容' }
    expect(resolveAnchor(edited, anchor)).toBeNull()
  })

  it('重复出现时选离原位置最近的一处', () => {
    // '关键词'(0-2) + '\n' + '中间'(4-5) + '\n' + '关键词'(7-9)
    const text = '关键词\n中间\n关键词'
    expect(text.indexOf('关键词', 1)).toBe(7)

    // 原位置在后一个"关键词"处（start=7）→ 应解析到 7，而不是前一个 0
    const resolved = resolveAnchor(text, { start: 7, end: 10, quote: '关键词' })
    expect(resolved!.start).toBe(7)
    expect(resolved!.exact).toBe(true)

    // 若区间失真但目标位置偏向后者，仍应就近解析到 7
    const drifted = resolveAnchor(text, { start: 9, end: 12, quote: '关键词' })
    expect(drifted!.start).toBe(7)
  })

  it('空 quote 返回 null', () => {
    expect(resolveAnchor(doc, { start: 0, end: 5, quote: '' })).toBeNull()
  })

  it('非法区间不会抛错', () => {
    expect(() => resolveAnchor(doc, { start: Number.NaN, end: 5, quote: 'x' })).not.toThrow()
  })
})

describe('findNearestOccurrence', () => {
  it('找到离目标最近的命中', () => {
    // 'aXbXcX' 里 X 在下标 1/3/5；目标 4 时最近的是 3（距离 1），不是 5（距离 2）
    expect(findNearestOccurrence('aXbXcX', 'X', 4)).toBe(3)
    // 目标 5 时最近的是 5 本身
    expect(findNearestOccurrence('aXbXcX', 'X', 5)).toBe(5)
  })

  it('没有命中返回 -1', () => {
    expect(findNearestOccurrence('abc', 'z', 0)).toBe(-1)
  })

  it('空 needle 返回 -1（避免死循环）', () => {
    expect(findNearestOccurrence('abc', '', 0)).toBe(-1)
  })
})
