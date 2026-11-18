import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Editor } from '@/components/editor/Editor'
import { useNotesStore } from '@/store'
import type { NoteDoc } from '@/types'

/**
 * P1-4：「评论」按钮的语义。
 *
 * 它绑的是 handleCommentSelection（内部无条件 toggle 面板）：
 * 面板已经打开时，用户选中一段文字再点「评论」，面板反而被关掉、
 * 刚捕获的引用也没处看 —— "点了反而没了"。
 * 现在：有选区 → 只更新引用、面板保持打开；无选区 → 才按关闭处理。
 */

const content = '第一段内容\n\n被评论的句子在这里\n\n第三段内容'
const doc: NoteDoc = {
  id: 'd1',
  title: '测试文档',
  content,
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  localStorage.removeItem('notes-rich-editor')
  useNotesStore.setState({
    notebooks: [{ id: 'nb1', title: '库', docs: [doc] }],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'd1',
    saveStatus: 'saved',
  })
})

/** 在富文本正文的第一段上造一个真实选区 */
function selectFirstParagraph(): void {
  const root = document.querySelector('.rich-editor') as HTMLElement | null
  const target = root?.querySelector('p') ?? root?.querySelector('h1')
  if (!root || !target) throw new Error('富文本未挂载')
  const range = document.createRange()
  range.selectNodeContents(target)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function openMoreMenu(): void {
  fireEvent.click(screen.getByTitle('更多'))
  expect(screen.getByRole('button', { name: '评论' })).toBeInTheDocument()
}

describe('Editor - 评论按钮（P1-4）', () => {
  it('面板已打开且有选区：保留面板并把引用挂上去', () => {
    const onToggle = vi.fn()
    render(
      <Editor
        activeDoc={doc}
        activeNotebookId="nb1"
        activeDocId="d1"
        fontSize="15px"
        onFontSizeChange={() => {}}
        showCommentsPanel={true}
        onToggleCommentsPanel={onToggle}
      />,
    )

    selectFirstParagraph()
    openMoreMenu()
    fireEvent.click(screen.getByRole('button', { name: '评论' }))

    // 关键断言：没有把打开的面板关掉
    expect(onToggle).not.toHaveBeenCalled()
    // 引用片段在打开的面板里立刻可见（正文里也有同样的字，所以按容器断言）
    expect(screen.getByText('评论选中内容')).toBeInTheDocument()
    expect(document.querySelector('.comment-pending-text')?.textContent).toBe(
      content.split('\n')[0],
    )
  })

  it('面板已打开但没有选区：仍按"关闭"处理（toggle 语义保留）', () => {
    const onToggle = vi.fn()
    render(
      <Editor
        activeDoc={doc}
        activeNotebookId="nb1"
        activeDocId="d1"
        fontSize="15px"
        onFontSizeChange={() => {}}
        showCommentsPanel={true}
        onToggleCommentsPanel={onToggle}
      />,
    )

    openMoreMenu()
    fireEvent.click(screen.getByRole('button', { name: '评论' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('面板关闭时：点击会打开面板', () => {
    const onToggle = vi.fn()
    render(
      <Editor
        activeDoc={doc}
        activeNotebookId="nb1"
        activeDocId="d1"
        fontSize="15px"
        onFontSizeChange={() => {}}
        showCommentsPanel={false}
        onToggleCommentsPanel={onToggle}
      />,
    )

    openMoreMenu()
    fireEvent.click(screen.getByRole('button', { name: '评论' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
