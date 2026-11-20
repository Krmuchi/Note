import { describe, it, expect, beforeAll, vi } from 'vitest'
import {
  fuzzyScore,
  isPinyinEngineReady,
  loadPinyinEngine,
  prebuildPinyinForms,
  pinyinCacheSize,
} from '@/utils/fuzzyMatch'

describe('fuzzyScore 原文匹配（不依赖拼音引擎）', () => {
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

  it('查询含汉字时跳过拼音通道（不误伤直接匹配）', () => {
    expect(fuzzyScore('周记会议', '周记')).toBeGreaterThanOrEqual(900) // 前缀档；完全相等才给 1000
    expect(fuzzyScore('周记会议', '英语')).toBe(0)
  })

  it('中文按字符子串匹配', () => {
    expect(fuzzyScore('学习笔记 › 英语单词', '英语')).toBeGreaterThan(0)
    expect(fuzzyScore('学习笔记', '英语')).toBe(0)
  })
})

describe('fuzzyScore 拼音通道（S6）', () => {
  beforeAll(async () => {
    // 引擎是动态加载的（pinyin-pro 独立 chunk）：单条 fuzzyScore 在引擎就绪后按需算并缓存
    await loadPinyinEngine()
    expect(isPinyinEngineReady()).toBe(true)
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

  it('重复查询命中缓存且结果稳定', () => {
    const first = fuzzyScore('缓存标题测试', 'hc') // 缓 hún → h，存 cún → c
    const second = fuzzyScore('缓存标题测试', 'hc')
    expect(second).toBe(first)
    expect(first).toBeGreaterThan(0)
  })

  it('cacheOnlyPinyin 只读缓存：冷条目按原文打分，预热后才进拼音命中', () => {
    // 冷缓存 + 只读缓存 → 拼音通道这次拿不到，退化为原文匹配（0）
    expect(fuzzyScore('悬铃木梧桐', 'xlm', { cacheOnlyPinyin: true })).toBe(0)
    // 允许计算 → 命中首字母（并顺带入缓存）
    expect(fuzzyScore('悬铃木梧桐', 'xlm')).toBeGreaterThanOrEqual(900)
    // 已入缓存后，只读缓存也能命中
    expect(fuzzyScore('悬铃木梧桐', 'xlm', { cacheOnlyPinyin: true })).toBeGreaterThanOrEqual(900)
  })

  it('prebuildPinyinForms 分批补建：非汉字不占预算，maxCount 截断、已缓存不重复处理', () => {
    const before = pinyinCacheSize()
    // 预算 1：只建第一条汉字串；拉丁串不占预算
    expect(prebuildPinyinForms(['风信子花', 'FrostByte', '云外青山'], 1)).toBe(1)
    expect(pinyinCacheSize()).toBe(before + 1)
    // 「风信子花」已缓存，预算只花在「云外青山」上
    expect(prebuildPinyinForms(['风信子花', '云外青山'], 10)).toBe(1)
    expect(pinyinCacheSize()).toBe(before + 2)
    // 引擎就绪后缓存外条目按需补建，cacheOnly 不再阻塞命中
    expect(fuzzyScore('云外青山', 'yWqs', { cacheOnlyPinyin: true })).toBeGreaterThanOrEqual(900)
  })
})

describe('拼音引擎未就绪时的降级', () => {
  it('拼音查询退化为原文匹配（不抛错），loadPinyinEngine 后恢复', async () => {
    vi.resetModules()
    const fresh = await import('@/utils/fuzzyMatch')

    // 未加载：拼音通道整体跳过 —— 拼音查询打不出分，原文匹配照常
    expect(fresh.isPinyinEngineReady()).toBe(false)
    expect(fresh.fuzzyScore('周记会议', 'zj')).toBe(0)
    expect(fresh.fuzzyScore('周记会议', '周记')).toBeGreaterThanOrEqual(900)
    expect(fresh.prebuildPinyinForms(['周记会议'], 10)).toBe(0)
    expect(fresh.pinyinCacheSize()).toBe(0)

    // 动态加载后恢复
    expect(await fresh.loadPinyinEngine()).toBe(true)
    expect(fresh.fuzzyScore('周记会议', 'zj')).toBeGreaterThan(0)
  })
})
