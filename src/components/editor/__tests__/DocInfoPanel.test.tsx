import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocInfoPanel } from '@/components/editor/DocInfoPanel'
import { useNotesStore } from '@/store'
import type { NoteDoc } from '@/types'

/**
 * P1-5：文档信息面板的键盘可达性。
 *
 * 全局 Esc 白名单不认识这个面板（它是 Editor 内的局部状态），
 * 而 Editor 的 Esc 又只在"焦点位于正文"时生效 —— 焦点一旦被焦点陷阱移进面板，
 * 按 Esc 就什么都不发生，只能摸鼠标点 ✕。
 */

const doc = (over: Partial<NoteDoc> & { id: string; title: string }): NoteDoc => ({
  content: '正文内容',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

beforeEach(() => {
  useNotesStore.setState({
    notebooks: [
      { id: 'nb1', title: '工作', docs: [doc({ id: 'd1', title: '周报' })] },
    ],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'd1',
  })
})

describe('DocInfoPanel（P1-5）', () => {
  it('显示文档统计（面板本身可打开）', () => {
    render(<DocInfoPanel notebookId="nb1" docId="d1" onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: '文档信息' })).toBeInTheDocument()
    expect(screen.getByText('周报')).toBeInTheDocument()
  })

  it('焦点被移入面板后，Esc 依然能关闭（接 useFocusTrap 的 onEscape）', () => {
    const onClose = vi.fn()
    render(<DocInfoPanel notebookId="nb1" docId="d1" onClose={onClose} />)
    // 打开即把焦点移入容器（这是陷阱生效的前提）
    const box = screen.getByRole('dialog', { name: '文档信息' }).querySelector('.doc-info-panel')
    const focusable = box?.querySelector<HTMLElement>('button')
    expect(focusable).not.toBeNull()
    expect(document.activeElement).toBe(focusable)

    fireEvent.keyDown(focusable as HTMLElement, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    // onEscape 在 capture 阶段 stopImmediatePropagation：全局链不该再被触发
    const globalEscape = vi.fn()
    window.addEventListener('keydown', globalEscape)
    fireEvent.keyDown(focusable as HTMLElement, { key: 'Escape' })
    expect(globalEscape).not.toHaveBeenCalled()
    window.removeEventListener('keydown', globalEscape)
  })

  it('点击遮罩仍然关闭（既有行为不回归）', () => {
    const onClose = vi.fn()
    const { container } = render(<DocInfoPanel notebookId="nb1" docId="d1" onClose={onClose} />)
    const overlay = container.querySelector('.doc-info-overlay') as HTMLElement
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
