import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/** 批量操作（T3）：打标签与导出选中。 */

vi.mock('@/services/storage', () => ({
  isWebMode: false,
  exportNotebookZip: vi.fn(async () => true),
  exportPdfDoc: vi.fn(async () => true),
  printDoc: vi.fn(async () => ({ ok: true })),
}))

import { DocTree } from '@/components/layout/DocTree'
import { useNotesStore } from '@/store'
import { exportNotebookZip } from '@/services/storage'
import type { NoteDoc, Notebook, Tag } from '@/types'

const mockedExportZip = exportNotebookZip as unknown as ReturnType<typeof vi.fn>

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

const notebook: Notebook = {
  id: 'nb1',
  title: '学习笔记',
  docs: [doc({ id: 'a', title: 'A' }), doc({ id: 'b', title: 'B' })],
}

const tag: Tag = {
  id: 'tag1',
  name: '重要',
  color: '#f00',
  icon: '',
  parentId: null,
  usageCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  useNotesStore.setState({
    notebooks: [notebook],
    trash: [],
    tags: [tag],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'a',
  })
})

const renderTree = (): ReturnType<typeof render> =>
  render(
    <DocTree
      activeNotebook={useNotesStore.getState().notebooks[0]}
      searchText=""
      sortMode="manual"
      onViewDoc={vi.fn()}
      onMoveRequest={vi.fn()}
    />,
  )

const enterMultiSelect = (): void => {
  // 批量工具条在多选模式下出现
  fireEvent.click(screen.getByRole('button', { name: '多选' }))
}

describe('批量操作（T3）', () => {
  it('给选中文档批量打标签', async () => {
    renderTree()
    enterMultiSelect()

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 A' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 B' }))

    fireEvent.change(screen.getByLabelText('为选中的文档添加标签'), { target: { value: 'tag1' } })

    await waitFor(() => {
      const docs = useNotesStore.getState().notebooks[0].docs
      expect(docs.find((d) => d.id === 'a')?.tags).toContain('tag1')
      expect(docs.find((d) => d.id === 'b')?.tags).toContain('tag1')
    })
  })

  it('没有标签时打标签下拉不可用', () => {
    useNotesStore.setState({ tags: [] })
    renderTree()
    enterMultiSelect()

    // 工具条只在有选中项时出现，所以先选一篇
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 A' }))
    expect(screen.getByLabelText('为选中的文档添加标签')).toBeDisabled()
  })

  it('导出选中文档', async () => {
    renderTree()
    enterMultiSelect()

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 A' }))
    fireEvent.click(screen.getByRole('button', { name: '导出' }))

    await waitFor(() => expect(mockedExportZip).toHaveBeenCalled())
    const payload = mockedExportZip.mock.calls[0][0] as { docs: { id: string }[] }
    expect(payload.docs.map((d) => d.id)).toEqual(['a'])
  })
})
