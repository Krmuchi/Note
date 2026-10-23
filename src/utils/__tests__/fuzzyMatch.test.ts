import { describe, it, expect } from 'vitest'
import { fuzzyScore } from '@/utils/fuzzyMatch'

describe('fuzzyScore', () => {
  it('完全相等 > 前缀 > 子串', () => {
    const exact = fuzzyScore('项目计划', '项目计划')
    const prefix = fuzzyScore('项目计划书', '项目计划')
    const middle = fuzzyScore('2026 项目计划书', '项目计划')
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(middle)
    expect(middle).toBeGreaterThan(0)
  })

  it('越靠前的子串得分越高', () => {
    expect(fuzzyScore('abc目标', '目标')).toBeGreaterThan(fuzzyScore('a'.repeat(50) + '目标', '目标'))
  })

  it('子序列命中（跳字符）得分低于连续子串', () => {
    const contiguous = fuzzyScore('readme.md', 'read')
    const subsequence = fuzzyScore('readme.md', 'rdme')
    expect(contiguous).toBeGreaterThan(subsequence)
    expect(subsequence).toBeGreaterThan(0)
  })

  it('字符顺序不对时不算命中', () => {
    expect(fuzzyScore('readme', 'mder')).toBe(0)
  })

  it('大小写不敏感，空查询返回 1', () => {
    expect(fuzzyScore('README', 'readme')).toBe(1000)
    expect(fuzzyScore('任意标题', '')).toBe(1)
  })

  it('中文按字符子串匹配', () => {
    expect(fuzzyScore('学习笔记 › 英语单词', '英语')).toBeGreaterThan(0)
    expect(fuzzyScore('学习笔记', '英语')).toBe(0)
  })
})
