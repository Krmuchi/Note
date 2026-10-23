import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DocBreadcrumb from '@/components/editor/DocBreadcrumb'
import { useNotesStore } from '@/store'
import { subscribeDocOpen, type DocOpenRequest } from '@/utils/docNavigation'
import type { NoteDoc } from '@/types'

/** 编辑器面包屑（N2）：完整路径 + 祖先可点跳转。 */

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

let received: DocOpenRequest[] = []
let unsubscribe: () => void = () => {}

const setDocs = (activeDocId: string): void =>
  useNotesStore.setState({
    notebooks: [
      {
        id: 'nb1',
        title: '学习笔记',
        docs: [
          doc({ id: 'a', title: '父文档' }),
          doc({ id: 'a1', title: '当前文档', parentId: 'a' }),
        ],
      },
    ],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId,
  })

beforeEach(() => {
  received = []
  unsubscribe = subscribeDocOpen((request) => received.push(request))
  setDocs('a1')
})

afterEach(() => unsubscribe())

describe('DocBreadcrumb', () => {
  it('渲染 知识库 › 父文档 › 当前文档', () => {
    render(<DocBreadcrumb />)
    expect(screen.getByText('学习笔记')).toBeInTheDocument()
    expect(screen.getByText('父文档')).toBeInTheDocument()
    expect(screen.getByText('当前文档')).toBeInTheDocument()
  })

  it('点祖先文档触发打开；当前文档不是按钮', () => {
    render(<DocBreadcrumb />)

    fireEvent.click(screen.getByRole('button', { name: '父文档' }))
    expect(received).toEqual([{ notebookId: 'nb1', docId: 'a' }])

    expect(screen.queryByRole('button', { name: '当前文档' })).toBeNull()
    expect(screen.queryByRole('button', { name: '学习笔记' })).toBeNull()
  })

  it('未选中文档时不渲染（只有知识库一级没有意义）', () => {
    setDocs('')
    const { container } = render(<DocBreadcrumb />)
    expect(container.firstChild).toBeNull()
  })
})
