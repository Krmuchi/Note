import { describe, it, expect } from 'vitest'
import {
  computeScrollTop,
  findAllMatches,
  findMatches,
  lineIndexAt,
  replaceAllMatches,
} from '@/utils/findInText'

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

describe('findAllMatches - 全词 / 正则选项', () => {
  it('wholeWord 不命中紧贴英文字母的片段', () => {
    expect(findAllMatches('cat cat2 cat', 'cat', false, { wholeWord: true })).toHaveLength(2)
  })

  it('wholeWord 不命中紧贴中文字符的片段（\\b 对中文无效）', () => {
    expect(findAllMatches('关键词 关键词甲', '关键词', false, { wholeWord: true })).toHaveLength(1)
  })

  it('wholeWord 关掉时按普通子串匹配', () => {
    expect(findAllMatches('cat cat2 cat', 'cat')).toHaveLength(3)
  })

  it('regex 模式按表达式匹配并返回真实长度', () => {
    const matches = findAllMatches('a1 b22 c333', '\\d+', false, { regex: true })
    expect(matches.map((m) => m.length)).toEqual([1, 2, 3])
    expect(matches[1].index).toBe(4)
  })

  it('regex 模式下大小写开关仍然生效', () => {
    expect(findAllMatches('Ab ab', 'ab', false, { regex: true })).toHaveLength(2)
    expect(findAllMatches('Ab ab', 'ab', true, { regex: true })).toHaveLength(1)
  })

  it('非法正则返回空结果并给出无效态，不抛异常', () => {
    const result = findMatches('abc', '(', { regex: true })
    expect(result.valid).toBe(false)
    expect(result.matches).toEqual([])
    expect(result.error).toBeTruthy()
  })

  it('空正文 + 非法正则仍然报无效态', () => {
    expect(findMatches('', '(', { regex: true }).valid).toBe(false)
  })

  it('零宽匹配不会死循环，也不会被当作命中', () => {
    // x* 在 'abc' 里只有零宽命中：既不能死循环，也不该被当成可替换的位置
    expect(findAllMatches('abc', 'x*', false, { regex: true })).toEqual([])
    // a* 先命中真实的 'a'，其后的零宽位置被丢弃
    expect(findAllMatches('abc', 'a*', false, { regex: true })).toEqual([{ index: 0, length: 1 }])
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

  it('正则模式支持 $1 捕获组引用', () => {
    const text = 'name: alice'
    const { matches, regexp } = findMatches(text, 'name: (\\w+)', { regex: true })
    expect(replaceAllMatches(text, matches, '$1', regexp)).toBe('alice')
  })

  it('纯文本模式下 $1 按字面量插入', () => {
    const text = 'a'
    const matches = findAllMatches(text, 'a')
    expect(replaceAllMatches(text, matches, '$1')).toBe('$1')
  })
})
