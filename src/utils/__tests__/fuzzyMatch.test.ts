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

  it('拼音首字母（S6）：zj 命中「周记会议」，且与直接命中同一数量级', () => {
    const initial = fuzzyScore('周记会议', 'zj')
    expect(initial).toBeGreaterThan(0)
    expect(initial).toBeGreaterThanOrEqual(900) // 首字母前缀应是高分档
    expect(fuzzyScore('周记会议', 'xyz')).toBe(0)
  })

  it('拼音全拼（S6）：zhouji 命中「周记会议」', () => {
    expect(fuzzyScore('周记会议', 'zhouji')).toBeGreaterThan(0)
    expect(fuzzyScore('周记会议', 'zhoujihuiyi')).toBe(1000)
  })

  it('中英混排：首字母通道不破坏拉丁原文匹配', () => {
    expect(fuzzyScore('周会 README', 'zj')).toBe(0) // 周会 zh → z h，zj 不该命中
    // 拉丁词仍按原样参与子串命中（命中位置在标题中部，所以是 800 档而非满分）
    expect(fuzzyScore('周会 README', 'readme')).toBeGreaterThan(700)
    expect(fuzzyScore('周会 README', 'zh')).toBeGreaterThanOrEqual(900)
    // 拼音串与拉丁原文混合参与子序列：h-r 走「zhōu huì」拼音串命中
    expect(fuzzyScore('周会 README', 'hr')).toBeGreaterThan(0)
  })

  it('查询含汉字时跳过拼音通道（不误伤直接匹配）', () => {
    expect(fuzzyScore('周记会议', '周记')).toBeGreaterThanOrEqual(900) // 前缀档；完全相等才给 1000
    expect(fuzzyScore('周记会议', '英语')).toBe(0)
  })

  it('重复查询命中缓存且结果稳定', () => {
    const first = fuzzyScore('缓存标题测试', 'hc') // 缓 hún → h，存 cún → c
    const second = fuzzyScore('缓存标题测试', 'hc')
    expect(second).toBe(first)
    expect(first).toBeGreaterThan(0)
  })

  it('中文按字符子串匹配', () => {
    expect(fuzzyScore('学习笔记 › 英语单词', '英语')).toBeGreaterThan(0)
    expect(fuzzyScore('学习笔记', '英语')).toBe(0)
  })
})
