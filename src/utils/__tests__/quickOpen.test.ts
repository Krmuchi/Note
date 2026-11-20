import { describe, it, expect, beforeAll } from 'vitest'
import { buildQuickOpenIndex, rankQuickOpenItems } from '@/utils/quickOpen'
import { loadPinyinEngine, prebuildPinyinForms } from '@/utils/fuzzyMatch'
import type { NoteDoc, Notebook } from '@/types'

const doc = (over: Partial<NoteDoc> & { id: string; title: string }): NoteDoc => ({
  content: '',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const notebooks: Notebook[] = [
  {
    id: 'nb1',
    title: '学习笔记',
    docs: [
      doc({ id: 'a', title: '父文档', updatedAt: '2026-09-01T00:00:00.000Z' }),
      doc({ id: 'a1', title: '英语单词', parentId: 'a', updatedAt: '2026-10-01T00:00:00.000Z' }),
    ],
  },
]

describe('buildQuickOpenIndex', () => {
  it('带上层级上下文（知识库 › 父文档）', () => {
    const index = buildQuickOpenIndex(notebooks)
    expect(index.find((i) => i.docId === 'a1')?.context).toBe('学习笔记 › 父文档')
    expect(index.find((i) => i.docId === 'a')?.context).toBe('学习笔记')
  })
})

describe('rankQuickOpenItems', () => {
  const index = buildQuickOpenIndex(notebooks)

  it('无输入时按最近编辑排序（空查询＝最近文档）', () => {
    expect(rankQuickOpenItems(index, '').map((i) => i.docId)).toEqual(['a1', 'a'])
  })

  it('按标题模糊匹配并排序', () => {
    expect(rankQuickOpenItems(index, '英语').map((i) => i.docId)).toEqual(['a1'])
  })

  it('标题不命中时可用层级路径命中（但权重减半，排在标题命中之后）', () => {
    const result = rankQuickOpenItems(index, '父文档')
    // '父文档' 既是 a 的标题，也在 a1 的路径里
    expect(result.map((i) => i.docId)).toEqual(['a', 'a1'])
  })

  it('没有匹配时返回空数组，limit 生效', () => {
    expect(rankQuickOpenItems(index, '不存在的标题')).toEqual([])
    expect(rankQuickOpenItems(index, '', 1)).toHaveLength(1)
  })
})

describe('rankQuickOpenItems 拼音索引（S6 性能）', () => {
  beforeAll(async () => {
    await loadPinyinEngine()
  })

  // 根级文档 + 拉丁知识库名：context 不含汉字，拼音断言不受路径文案干扰
  const itemsFor = (titles: string[]): ReturnType<typeof buildQuickOpenIndex> =>
    buildQuickOpenIndex([
      {
        id: 'nb-py',
        title: 'NB',
        docs: titles.map((title) => doc({ id: `py-${title}`, title })),
      },
    ])

  it('首键按预算补建拼音索引，默认预算内即可命中首字母', () => {
    const items = itemsFor(['东西南北'])
    expect(rankQuickOpenItems(items, 'dxnb').map((i) => i.docId)).toEqual(['py-东西南北'])
  })

  it('预算为 0 时不补建：冷缓存条目只按原文打分，预构建后才命中', () => {
    const items = itemsFor(['春夏秋冬'])
    expect(rankQuickOpenItems(items, 'cxqd', 20, 0)).toEqual([])
    prebuildPinyinForms(['春夏秋冬'], 1)
    expect(rankQuickOpenItems(items, 'cxqd', 20, 0).map((i) => i.docId)).toEqual(['py-春夏秋冬'])
  })

  it('预算封顶：只补前 N 条，其余条目本次不进拼音命中（首键成本有上界）', () => {
    const items = itemsFor(['蜻蜓点水', '梅兰竹菊'])
    // 预算 1 只建顺序在前的「蜻蜓点水」；「梅兰竹菊」的拼音命中留给下一批 / 空闲预构建
    expect(rankQuickOpenItems(items, 'mlzj', 20, 1)).toEqual([])
    prebuildPinyinForms(['梅兰竹菊'], 1)
    expect(rankQuickOpenItems(items, 'mlzj', 20, 0).map((i) => i.docId)).toEqual(['py-梅兰竹菊'])
  })
})
