import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QuickOpenPanel from '@/components/search/QuickOpenPanel'
import { useNotesStore } from '@/store'
import { subscribeDocOpen, type DocOpenRequest } from '@/utils/docNavigation'
import type { NoteDoc } from '@/types'

/** 全局快速打开（N1）的交互：最近编辑 / 过滤 / 键盘选择 / 打开。 */

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

beforeEach(() => {
  received = []
  unsubscribe = subscribeDocOpen((request) => received.push(request))
  useNotesStore.setState({
    notebooks: [
      {
        id: 'nb1',
        title: '学习笔记',
        docs: [
          doc({ id: 'a', title: '父文档', updatedAt: '2026-09-01T00:00:00.000Z' }),
          doc({ id: 'a1', title: '英语单词', parentId: 'a', updatedAt: '2026-10-01T00:00:00.000Z' }),
        ],
      },
    ],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'a',
  })
})

afterEach(() => unsubscribe())

describe('QuickOpenPanel', () => {
  it('无输入时展示最近编辑的文档与层级上下文', () => {
    render(<QuickOpenPanel isOpen onClose={vi.fn()} />)
    expect(screen.getByText('最近编辑')).toBeInTheDocument()
    expect(screen.getByText('英语单词')).toBeInTheDocument()
    expect(screen.getByText('学习笔记 › 父文档')).toBeInTheDocument()
  })

  it('输入后过滤，并显示命中数量', () => {
    render(<QuickOpenPanel isOpen onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('快速打开文档'), { target: { value: '英语' } })

    expect(screen.getByText('英语单词')).toBeInTheDocument()
    expect(screen.queryByText('父文档')).toBeNull()
    expect(screen.getByText('找到 1 篇')).toBeInTheDocument()
  })

  it('Enter 打开高亮项并关闭面板', () => {
    const onClose = vi.fn()
    render(<QuickOpenPanel isOpen onClose={onClose} />)
    const input = screen.getByLabelText('快速打开文档')
    fireEvent.change(input, { target: { value: '父文档' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(received).toEqual([{ notebookId: 'nb1', docId: 'a' }])
    expect(onClose).toHaveBeenCalled()
  })

  it('↓ 移动高亮后再 Enter 打开第二项', () => {
    render(<QuickOpenPanel isOpen onClose={vi.fn()} />)
    const input = screen.getByLabelText('快速打开文档')
    // 默认顺序为 [英语单词(更新), 父文档]
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(received[0]).toEqual({ notebookId: 'nb1', docId: 'a' })
  })

  it('无匹配时给出提示，Esc 关闭', () => {
    const onClose = vi.fn()
    render(<QuickOpenPanel isOpen onClose={onClose} />)
    const input = screen.getByLabelText('快速打开文档')

    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('没有匹配的文档')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
