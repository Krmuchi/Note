import { describe, it, expect } from 'vitest'
import { computeScrollTop, findAllMatches, lineIndexAt, replaceAllMatches } from '@/utils/findInText'

describe('findAllMatches', () => {
  it('默认忽略大小写', () => {
    expect(findAllMatches('Hello hello HELLO', 'hello')).toHaveLength(3)
  })

  it('区分大小写时只匹配完全一致的写法', () => {
    expect(findAllMatches('Hello hello HELLO', 'hello', true)).toHaveLength(1)
  })

  it('不产生重叠匹配', () => {
    const matches = findAllMatches('aaaa', 'aa')
    expect(matches).toEqual([
      { index: 0, length: 2 },
      { index: 2, length: 2 },
    ])
  })

  it('空查询或查不到时返回空数组', () => {
    expect(findAllMatches('abc', '')).toEqual([])
    expect(findAllMatches('abc', 'z')).toEqual([])
  })

  it('支持中文与多字节字符', () => {
    const text = '# 第一章\n\n这里是第一章的内容'
    const matches = findAllMatches(text, '第一章')
    expect(matches).toHaveLength(2)
    expect(text.slice(matches[0].index, matches[0].index + matches[0].length)).toBe('第一章')
  })
})

describe('lineIndexAt', () => {
  it('按换行符计算行号', () => {
    const text = 'a\nb\nc'
    expect(lineIndexAt(text, 0)).toBe(0)
    expect(lineIndexAt(text, 2)).toBe(1)
    expect(lineIndexAt(text, 4)).toBe(2)
  })

  it('偏移超出文本长度时按末尾处理', () => {
    expect(lineIndexAt('a\nb', 999)).toBe(1)
  })
})

describe('computeScrollTop', () => {
  it('把目标行放在视口 1/3 处', () => {
    expect(computeScrollTop(10, 20, 300)).toBe(200 - 100)
  })

  it('不产生负的 scrollTop', () => {
    expect(computeScrollTop(0, 20, 300)).toBe(0)
  })
})

describe('replaceAllMatches', () => {
  it('一次性替换全部命中且不自我递归', () => {
    const text = 'aaa'
    const matches = findAllMatches(text, 'a')
    expect(replaceAllMatches(text, matches, 'bb')).toBe('bbbbbb')
  })

  it('替换内容包含原查询串时不会二次替换', () => {
    const text = 'x x'
    const matches = findAllMatches(text, 'x')
    expect(replaceAllMatches(text, matches, 'xx')).toBe('xx xx')
  })

  it('无命中时原样返回', () => {
    expect(replaceAllMatches('abc', [], 'z')).toBe('abc')
  })
})
