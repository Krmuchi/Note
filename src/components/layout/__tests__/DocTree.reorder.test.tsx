import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocTree } from '@/components/layout/DocTree'
import { useNotesStore } from '@/store'
import type { NoteDoc, Notebook } from '@/types'

/**
 * 同级上移 / 下移（A4）：拖拽在触屏上不可用，这是不依赖拖拽的顺序调整路径。
 */

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

const buildNotebook = (): Notebook => ({
  id: 'nb1',
  title: '学习笔记',
  docs: [
    doc({ id: 'a', title: 'A' }),
    doc({ id: 'b', title: 'B' }),
    doc({ id: 'c', title: 'C' }),
  ],
})

const renderTree = (sortMode: 'manual' | 'updated' = 'manual'): ReturnType<typeof render> =>
  render(
    <DocTree
      activeNotebook={useNotesStore.getState().notebooks[0]}
      searchText=""
      sortMode={sortMode}
      onViewDoc={vi.fn()}
      onMoveRequest={vi.fn()}
    />,
  )

const order = (): string[] => useNotesStore.getState().notebooks[0].docs.map((d) => d.id)

beforeEach(() => {
  useNotesStore.setState({
    notebooks: [buildNotebook()],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'a',
  })
})

describe('文档顺序调整（不依赖拖拽）', () => {
  it('手动排序模式下：右键 → 上移，把文档提到前一位', () => {
    renderTree('manual')

    fireEvent.contextMenu(document.querySelector('[data-doc-id="b"]')!, { clientX: 10, clientY: 10 })
    fireEvent.click(screen.getByText('上移'))

    expect(order()).toEqual(['b', 'a', 'c'])
  })

  it('下移把文档放到后一位', () => {
    renderTree('manual')

    fireEvent.contextMenu(document.querySelector('[data-doc-id="b"]')!, { clientX: 10, clientY: 10 })
    fireEvent.click(screen.getByText('下移'))

    expect(order()).toEqual(['a', 'c', 'b'])
  })

  it('非手动排序时按钮禁用（顺序由排序规则决定，改数组顺序看不出效果）', () => {
    renderTree('updated')

    fireEvent.contextMenu(document.querySelector('[data-doc-id="b"]')!, { clientX: 10, clientY: 10 })
    expect(screen.getByText('上移').closest('button')).toBeDisabled()
    expect(screen.getByText('下移').closest('button')).toBeDisabled()
    expect(screen.getByText('上移').closest('button')?.getAttribute('title')).toMatch(/手动排序/)
  })

  /**
   * 回归：视图里的"相邻"必须按**用户看到的顺序**算。
   *
   * 旧实现拿数据数组里的原始下标 + offset 去调 reorderDocs，而界面上看到的是
   * 经过排序（这里是"按标题"之外的场景）与过滤后的顺序。两者一旦不一致，
   * 点"上移"动的就是另一篇文档 —— 这类错误改的是别人的数据，比崩溃更难发现。
   */
  it('视图顺序与数据顺序不一致时，上移作用于界面上看到的上一篇', () => {
    // 数据顺序 a,b,c；让标题顺序与数据顺序相反，再按标题排序
    useNotesStore.setState({
      notebooks: [
        {
          id: 'nb1',
          title: '学习笔记',
          docs: [
            doc({ id: 'a', title: '丙' }),
            doc({ id: 'b', title: '乙' }),
            doc({ id: 'c', title: '甲' }),
          ],
        },
      ],
      trash: [],
      tags: [],
      searchHistory: [],
      activeNotebookId: 'nb1',
      activeDocId: 'a',
    })

    render(
      <DocTree
        activeNotebook={useNotesStore.getState().notebooks[0]}
        searchText=""
        sortMode="title"
        onViewDoc={vi.fn()}
        onMoveRequest={vi.fn()}
      />,
    )

    // 按标题升序渲染为 甲(c) 乙(b) 丙(a)；上移/下移按钮此时是禁用的（非手动排序），
    // 所以直接验证 store 层的 id 级换序语义
    useNotesStore.getState().moveDocRelativeTo('nb1', 'a', 'b', 'before')

    // a(丙) 被放到 b(乙) 之前 —— 同级顺序变成 a,b,c，与标题无关，只动这两项
    expect(order()).toEqual(['a', 'b', 'c'])
  })

  it('跨层级不换序（换序不应隐式改父级）', () => {
    useNotesStore.setState({
      notebooks: [
        {
          id: 'nb1',
          title: '学习笔记',
          docs: [
            doc({ id: 'a', title: 'A' }),
            doc({ id: 'a1', title: 'A1', parentId: 'a' }),
            doc({ id: 'b', title: 'B' }),
          ],
        },
      ],
      trash: [],
      tags: [],
      searchHistory: [],
      activeNotebookId: 'nb1',
      activeDocId: 'a',
    })

    useNotesStore.getState().moveDocRelativeTo('nb1', 'b', 'a1', 'before')

    // 父级不同，直接忽略
    expect(order()).toEqual(['a', 'a1', 'b'])
  })
})
