import { describe, it, expect } from 'vitest'
import { buildQuickOpenIndex, rankQuickOpenItems } from '@/utils/quickOpen'
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
