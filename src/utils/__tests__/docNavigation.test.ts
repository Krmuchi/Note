import { describe, it, expect, vi } from 'vitest'
import {
  buildDocBreadcrumb,
  findAdjacentDoc,
  flattenDocs,
  requestDocOpen,
  subscribeDocOpen,
} from '@/utils/docNavigation'
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

const nb = (docs: NoteDoc[], id = 'nb1', title = '知识库'): Notebook => ({ id, title, docs })

describe('flattenDocs', () => {
  it('按树的前序展平：父文档紧跟其子文档', () => {
    const notebooks = [
      nb([
        doc({ id: 'a', title: 'A' }),
        doc({ id: 'a1', title: 'A-1', parentId: 'a' }),
        doc({ id: 'a11', title: 'A-1-1', parentId: 'a1' }),
        doc({ id: 'b', title: 'B' }),
      ]),
    ]
    expect(flattenDocs(notebooks).map((d) => d.docId)).toEqual(['a', 'a1', 'a11', 'b'])
  })

  it('父级不存在的孤儿文档也会被收录（否则会在快速打开里消失）', () => {
    const notebooks = [nb([doc({ id: 'x', title: '孤儿', parentId: 'missing' })])]
    expect(flattenDocs(notebooks).map((d) => d.docId)).toEqual(['x'])
  })

  it('parentId 成环时不无限递归', () => {
    const notebooks = [
      nb([
        doc({ id: 'p', title: 'P', parentId: 'c' }),
        doc({ id: 'c', title: 'C', parentId: 'p' }),
      ]),
    ]
    const flat = flattenDocs(notebooks)
    expect(flat).toHaveLength(2)
  })

  it('无标题文档回退为「未命名文档」', () => {
    expect(flattenDocs([nb([doc({ id: 'n', title: '' })])])[0].title).toBe('未命名文档')
  })
})

describe('findAdjacentDoc', () => {
  const flat = flattenDocs([
    nb([doc({ id: 'a', title: 'A' }), doc({ id: 'b', title: 'B' })], 'nb1', '库一'),
    nb([doc({ id: 'c', title: 'C' })], 'nb2', '库二'),
  ])

  it('取上一篇/下一篇', () => {
    expect(findAdjacentDoc(flat, 'nb1', 'b', 'prev')?.docId).toBe('a')
    expect(findAdjacentDoc(flat, 'nb1', 'b', 'next')?.docId).toBe('c')
  })

  it('跨知识库连续', () => {
    expect(findAdjacentDoc(flat, 'nb2', 'c', 'prev')?.notebookId).toBe('nb1')
  })

  it('边界返回 null，文档不存在也返回 null', () => {
    expect(findAdjacentDoc(flat, 'nb1', 'a', 'prev')).toBeNull()
    expect(findAdjacentDoc(flat, 'nb2', 'c', 'next')).toBeNull()
    expect(findAdjacentDoc(flat, 'nb1', 'ghost', 'next')).toBeNull()
  })
})

describe('buildDocBreadcrumb', () => {
  it('输出知识库 › 父文档 › 当前文档', () => {
    const notebooks = [
      nb([
        doc({ id: 'a', title: '父文档' }),
        doc({ id: 'a1', title: '当前文档', parentId: 'a' }),
      ], 'nb1', '学习笔记'),
    ]
    expect(buildDocBreadcrumb(notebooks, 'nb1', 'a1').map((c) => c.title)).toEqual([
      '学习笔记',
      '父文档',
      '当前文档',
    ])
  })

  it('未选中文档时只有知识库一级', () => {
    expect(buildDocBreadcrumb([nb([])], 'nb1', '').map((c) => c.title)).toEqual(['知识库'])
  })

  it('知识库不存在时返回空数组', () => {
    expect(buildDocBreadcrumb([], 'nb1', 'a')).toEqual([])
  })

  it('parentId 成环时不死循环', () => {
    const notebooks = [
      nb([
        doc({ id: 'p', title: 'P', parentId: 'c' }),
        doc({ id: 'c', title: 'C', parentId: 'p' }),
      ]),
    ]
    expect(buildDocBreadcrumb(notebooks, 'nb1', 'c').length).toBeLessThanOrEqual(3)
  })
})

describe('文档打开通道', () => {
  it('广播请求，取消订阅后不再收到；缺少 id 的请求被忽略', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeDocOpen(listener)

    requestDocOpen({ notebookId: 'nb1', docId: 'd1' })
    expect(listener).toHaveBeenCalledWith({ notebookId: 'nb1', docId: 'd1' })

    requestDocOpen({ notebookId: '', docId: 'd1' })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    requestDocOpen({ notebookId: 'nb1', docId: 'd2' })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
