import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocsSidebar } from '@/components/layout/DocsSidebar'
import { useNotesStore } from '@/store'
import type { NoteDoc, Notebook } from '@/types'

/** 「新建文档」下拉（T4）：空白文档 / 从模板新建。 */

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

const notebook: Notebook = { id: 'nb1', title: '学习笔记', docs: [doc({ id: 'a', title: '已有文档' })] }

const renderSidebar = (): { onViewDoc: ReturnType<typeof vi.fn> } => {
  const onViewDoc = vi.fn()
  render(
    <DocsSidebar
      searchText=""
      onSearchChange={vi.fn()}
      onViewDoc={onViewDoc}
    />,
  )
  return { onViewDoc }
}

beforeEach(() => {
  useNotesStore.setState({
    notebooks: [{ ...notebook, docs: [doc({ id: 'a', title: '已有文档' })] }],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'a',
  })
})

describe('新建文档下拉', () => {
  it('默认收起，点击后出现两个选项', () => {
    renderSidebar()
    expect(screen.queryByRole('menuitem', { name: '空白文档' })).toBeNull()

    fireEvent.click(screen.getByLabelText('新建文档'))
    expect(screen.getByRole('menuitem', { name: '空白文档' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '从模板新建…' })).toBeInTheDocument()
  })

  it('空白文档：新建并立即打开', () => {
    const { onViewDoc } = renderSidebar()
    fireEvent.click(screen.getByLabelText('新建文档'))
    fireEvent.click(screen.getByRole('menuitem', { name: '空白文档' }))

    expect(useNotesStore.getState().notebooks[0].docs).toHaveLength(2)
    expect(onViewDoc).toHaveBeenCalledTimes(1)
    expect(onViewDoc.mock.calls[0][0]).toBe('nb1')
  })

  it('从模板新建：打开模板中心（懒加载先显示加载态）', async () => {
    renderSidebar()
    fireEvent.click(screen.getByLabelText('新建文档'))
    fireEvent.click(screen.getByRole('menuitem', { name: '从模板新建…' }))

    expect(document.querySelector('.template-center-modal')).not.toBeNull()
    expect(await screen.findByText('正在加载模板…')).toBeInTheDocument()
  })
})
