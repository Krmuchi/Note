import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocsSidebar } from '@/components/layout/DocsSidebar'
import { useNotesStore } from '@/store'
import type { NoteDoc, Notebook } from '@/types'

/** 按标签过滤文档树（K2）。 */

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
    doc({ id: 'a', title: '带标签的文档', tags: ['tag1'] }),
    doc({ id: 'b', title: '无标签的文档' }),
  ],
})

beforeEach(() => {
  useNotesStore.setState({
    notebooks: [buildNotebook()],
    trash: [],
    tags: [
      {
        id: 'tag1',
        name: '重要',
        color: '#f00',
        icon: '⭐',
        parentId: null,
        usageCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'a',
  })
})

const renderSidebar = (): ReturnType<typeof render> =>
  render(<DocsSidebar searchText="" onSearchChange={vi.fn()} onViewDoc={vi.fn()} />)

const visibleTitles = (): (string | null)[] =>
  Array.from(document.querySelectorAll('.doc-item .doc-title')).map((el) => el.textContent)

describe('文档树标签过滤', () => {
  it('默认显示全部文档', () => {
    renderSidebar()
    expect(visibleTitles()).toHaveLength(2)
  })

  it('选择标签后只显示带该标签的文档', () => {
    renderSidebar()

    fireEvent.change(screen.getByLabelText('按标签过滤文档'), { target: { value: 'tag1' } })
    expect(visibleTitles()).toEqual(['带标签的文档'])
  })

  it('切回「全部标签」恢复', () => {
    renderSidebar()
    const select = screen.getByLabelText('按标签过滤文档')

    fireEvent.change(select, { target: { value: 'tag1' } })
    fireEvent.change(select, { target: { value: '' } })
    expect(visibleTitles()).toHaveLength(2)
  })

  it('没有标签时不显示过滤控件', () => {
    useNotesStore.setState({ tags: [] })
    renderSidebar()
    expect(screen.queryByLabelText('按标签过滤文档')).toBeNull()
  })
})
