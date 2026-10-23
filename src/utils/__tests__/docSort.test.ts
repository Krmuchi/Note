import { describe, it, expect, beforeEach } from 'vitest'
import {
  DOC_SORT_STORAGE_KEY,
  filterAndSortDocs,
  readDocSortMode,
  sortDocs,
  writeDocSortMode,
} from '@/utils/docSort'
import type { NoteDoc } from '@/types'

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

describe('sortDocs', () => {
  const docs = [
    doc({ id: 'b', title: 'Banana', updatedAt: '2026-03-01T00:00:00.000Z' }),
    doc({ id: 'a', title: 'Apple', updatedAt: '2026-02-01T00:00:00.000Z' }),
    doc({ id: 'c', title: 'Cherry', updatedAt: '2026-01-01T00:00:00.000Z' }),
  ]

  it('按修改时间：最近的在前', () => {
    expect(sortDocs(docs, 'updated').map((d) => d.id)).toEqual(['b', 'a', 'c'])
  })

  it('按标题：中文按拼音、英文按字母', () => {
    expect(sortDocs(docs, 'title').map((d) => d.id)).toEqual(['a', 'b', 'c'])
    const zh = [
      doc({ id: '3', title: '张三' }),
      doc({ id: '1', title: '阿里' }),
      doc({ id: '2', title: '李四' }),
    ]
    expect(sortDocs(zh, 'title').map((d) => d.id)).toEqual(['1', '2', '3'])
  })

  it('手动排序：保持数组原顺序（拖拽结果）', () => {
    expect(sortDocs(docs, 'manual').map((d) => d.id)).toEqual(['b', 'a', 'c'])
    const reordered = [docs[2], docs[0], docs[1]]
    expect(sortDocs(reordered, 'manual').map((d) => d.id)).toEqual(['c', 'b', 'a'])
  })

  it('置顶在所有模式下都排最前', () => {
    const withPinned = [...docs, doc({ id: 'p', title: 'Zzz', pinned: true, updatedAt: '2020-01-01T00:00:00.000Z' })]
    for (const mode of ['updated', 'manual', 'title'] as const) {
      expect(sortDocs(withPinned, mode)[0].id).toBe('p')
    }
  })

  it('不改动传入的数组', () => {
    const original = [docs[0], docs[1], docs[2]]
    sortDocs(original, 'title')
    expect(original.map((d) => d.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('filterAndSortDocs', () => {
  const docs = [
    doc({ id: 'a', title: '会议纪要' }),
    doc({ id: 'b', title: '项目计划' }),
    doc({ id: 'c', title: 'Meeting Notes' }),
  ]

  it('按标题过滤（大小写不敏感）', () => {
    expect(filterAndSortDocs(docs, '会议', 'updated').map((d) => d.id)).toEqual(['a'])
    expect(filterAndSortDocs(docs, 'meeting', 'updated').map((d) => d.id)).toEqual(['c'])
  })

  it('空查询返回全部', () => {
    expect(filterAndSortDocs(docs, '  ', 'updated')).toHaveLength(3)
  })

  it('按标签过滤：只留下带该标签的文档', () => {
    const tagged = [
      doc({ id: 'a', title: 'A', tags: ['t1'] }),
      doc({ id: 'b', title: 'B', tags: ['t2'] }),
      doc({ id: 'c', title: 'C', tags: ['t1', 't2'] }),
    ]
    expect(filterAndSortDocs(tagged, '', 'manual', ['t1']).map((d) => d.id)).toEqual(['a', 'c'])
  })

  it('多个标签是与关系（需要同时带上）', () => {
    const tagged = [
      doc({ id: 'a', title: 'A', tags: ['t1'] }),
      doc({ id: 'c', title: 'C', tags: ['t1', 't2'] }),
    ]
    expect(filterAndSortDocs(tagged, '', 'manual', ['t1', 't2']).map((d) => d.id)).toEqual(['c'])
  })

  it('标签与搜索同时生效', () => {
    const tagged = [
      doc({ id: 'a', title: '会议纪要', tags: ['t1'] }),
      doc({ id: 'b', title: '会议议程', tags: ['t2'] }),
    ]
    expect(filterAndSortDocs(tagged, '会议', 'manual', ['t1']).map((d) => d.id)).toEqual(['a'])
  })

  it('文档没有 tags 字段时不会被标签过滤抛错', () => {
    const legacy = [{ ...doc({ id: 'a', title: 'A' }), tags: undefined } as unknown as ReturnType<typeof doc>]
    expect(filterAndSortDocs(legacy, '', 'manual', ['t1'])).toHaveLength(0)
  })
})

describe('排序偏好持久化', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('默认按修改时间，写入后可读回', () => {
    expect(readDocSortMode()).toBe('updated')
    writeDocSortMode('title')
    expect(localStorage.getItem(DOC_SORT_STORAGE_KEY)).toBe('title')
    expect(readDocSortMode()).toBe('title')
  })

  it('存储里是非法值时回落到默认', () => {
    localStorage.setItem(DOC_SORT_STORAGE_KEY, 'nonsense')
    expect(readDocSortMode()).toBe('updated')
  })
})
