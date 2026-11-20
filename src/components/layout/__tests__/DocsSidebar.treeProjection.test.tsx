import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { DocsSidebar, selectNotebookTreeProjection } from '@/components/layout/DocsSidebar'
import { useNotesStore } from '@/store'
import type { NoteDoc, Notebook } from '@/types'

/**
 * 文档树结构投影（P-perf 任务 1）。
 *
 * 契约：正文 content 变化（含同分钟的 updatedAt bump）不换任何投影引用 ——
 * DocsSidebar/DocTree 的整条渲染链在击键期保持安静；树字段（标题/置顶/收藏/标签/
 * 父子关系）变化立即刷新；updatedAt 跨分钟才刷新（时间显示与按时间排序需要）。
 */

const doc = (over: Partial<NoteDoc> & { id: string; title: string }): NoteDoc => ({
  content: '',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
  ...over,
})

const nb = (docs: NoteDoc[], over: Partial<Notebook> = {}): Notebook => ({
  id: 'nb1',
  title: '学习笔记',
  docs,
  ...over,
})

describe('selectNotebookTreeProjection 结构投影', () => {
  it('正文变化（updatedAt 同分钟 bump）不换任何引用', () => {
    const base = [nb([doc({ id: 'a', title: 'A', content: 'v1' })])]
    const first = selectNotebookTreeProjection(base)

    // 模拟击键：coreSlice.updateDoc 换 doc 对象并 bump updatedAt，但树字段全没变
    const typed = [nb([{ ...base[0].docs[0], content: 'v2', updatedAt: '2026-01-01T10:00:30.000Z' }])]
    const second = selectNotebookTreeProjection(typed)

    expect(second).toBe(first) // 数组引用稳定 → useShallow 判定"无变化"，不重渲染
    expect(second[0]).toBe(first[0])
    expect(second[0].docs[0]).toBe(first[0].docs[0])
    // 投影对象是快照：content 停留在上次刷新值（需要正文的逻辑必须读 store 快照）
    expect(second[0].docs[0].content).toBe('v1')
  })

  it('updatedAt 跨分钟才刷新（时间显示/按时间排序需要）', () => {
    const base = [nb([doc({ id: 'a', title: 'A', updatedAt: '2026-01-01T10:00:00.000Z' })])]
    const first = selectNotebookTreeProjection(base)
    const later = [nb([{ ...base[0].docs[0], content: 'v2', updatedAt: '2026-01-01T10:01:10.000Z' }])]
    const second = selectNotebookTreeProjection(later)
    expect(second).not.toBe(first)
    expect(second[0].docs[0].updatedAt).toBe('2026-01-01T10:01:10.000Z')
  })

  it('树字段变化立即刷新（标题/置顶/收藏/标签/父子关系）', () => {
    const first = selectNotebookTreeProjection([nb([doc({ id: 'a', title: 'A' })])])
    const variants: Partial<NoteDoc>[] = [
      { title: 'A2' },
      { pinned: true },
      { favorite: true },
      { tags: ['t1'] },
      { parentId: 'p' },
    ]
    for (const over of variants) {
      const next = selectNotebookTreeProjection([nb([doc({ id: 'a', title: 'A', ...over })])])
      expect(next).not.toBe(first)
    }
  })

  it('增删文档、知识库图标/标题变化都会刷新', () => {
    const first = selectNotebookTreeProjection([nb([doc({ id: 'a', title: 'A' })])])
    expect(
      selectNotebookTreeProjection([nb([doc({ id: 'a', title: 'A' }), doc({ id: 'b', title: 'B' })])]),
    ).not.toBe(first)
    expect(selectNotebookTreeProjection([nb([], { icon: '📘' })])).not.toBe(first)
    expect(selectNotebookTreeProjection([nb([], { title: '别的库' })])).not.toBe(first)
  })
})

/* 渲染级回归：击键期 DocsSidebar 不重渲染文档树（结构投影 + useShallow 共同生效） */
const mocks = vi.hoisted(() => ({ docTreeRenders: 0 }))
vi.mock('@/components/layout/DocTree', () => ({
  DocTree: () => {
    mocks.docTreeRenders += 1
    return <div data-testid="doc-tree-mock" />
  },
  default: () => {
    mocks.docTreeRenders += 1
    return <div data-testid="doc-tree-mock" />
  },
}))

describe('DocsSidebar 击键期渲染稳定', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 系统时间与 fixture 的 updatedAt 同一分钟：模拟"正在打字"的稳态
    // （编辑旧文档的首次击键必然跨分钟，会刷新一次时间显示——有意为之）
    vi.setSystemTime(new Date('2026-06-01T10:30:15.000Z'))
    useNotesStore.setState({
      notebooks: [
        nb([doc({ id: 'a', title: 'A', content: 'v1', updatedAt: '2026-06-01T10:30:00.000Z' })]),
      ],
      trash: [],
      tags: [],
      searchHistory: [],
      activeNotebookId: 'nb1',
      activeDocId: 'a',
    })
    mocks.docTreeRenders = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('正文击键零重渲染文档树；标题变化才重渲染', () => {
    render(<DocsSidebar searchText="" onSearchChange={vi.fn()} onViewDoc={vi.fn()} />)
    expect(mocks.docTreeRenders).toBe(1)

    act(() => {
      const { updateDoc } = useNotesStore.getState()
      updateDoc('nb1', 'a', { content: 'v2' })
      updateDoc('nb1', 'a', { content: 'v3' })
      updateDoc('nb1', 'a', { content: 'v4' })
    })
    expect(mocks.docTreeRenders).toBe(1)

    act(() => {
      useNotesStore.getState().updateDoc('nb1', 'a', { title: 'A2' })
    })
    expect(mocks.docTreeRenders).toBe(2)
  })
})
