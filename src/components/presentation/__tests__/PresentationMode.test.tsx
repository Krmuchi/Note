import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { NoteDoc } from '@/types'

// MarkdownPreview 依赖整条渲染链路（react-markdown/KaTeX），这里只验证键盘交互，mock 掉
vi.mock('@/components/editor/MarkdownPreview', () => ({
  MarkdownPreview: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
}))

import { PresentationMode } from '@/components/presentation/PresentationMode'

const doc: NoteDoc = {
  id: 'd1',
  title: '演示文档',
  content: '# 第一页\n正文一\n# 第二页\n正文二\n# 第三页\n正文三',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  document.body.innerHTML = ''
})

/**
 * 缺陷 12：事件从 document.body 派发 —— 真实应用里 keydown 目标是焦点元素，
 * window 上的 capture 监听（演示层）先于 bubble 监听（全局 useKeyboard）执行。
 */
describe('PresentationMode 键盘（缺陷 12）', () => {
  it('无修饰键的方向键/空格翻页', () => {
    render(<PresentationMode doc={doc} onClose={() => {}} />)
    expect(screen.getByText('第一页')).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(screen.getByText('第二页')).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(screen.getByText('第三页')).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    expect(screen.getByText('第二页')).toBeInTheDocument()
  })

  it('Ctrl+Alt+方向键不翻页（留给全局切文档快捷键）', () => {
    render(<PresentationMode doc={doc} onClose={() => {}} />)
    fireEvent.keyDown(document.body, { key: 'ArrowRight', ctrlKey: true, altKey: true })
    expect(screen.getByText('第一页')).toBeInTheDocument()
    expect(screen.queryByText('第二页')).toBeNull()
  })

  it('Ctrl+S 等修饰键组合不误触演示功能（S 切换演讲者模式）', () => {
    render(<PresentationMode doc={doc} onClose={() => {}} />)
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true })
    expect(screen.queryByText('演示时长')).toBeNull()
    fireEvent.keyDown(document.body, { key: 's' })
    expect(screen.getByText('演示时长')).toBeInTheDocument()
  })

  it('Esc 退出演示，且拦截传播（不连带触发全局 Escape）', () => {
    const onClose = vi.fn()
    const globalEscape = vi.fn()
    window.addEventListener('keydown', globalEscape)
    render(<PresentationMode doc={doc} onClose={onClose} />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(globalEscape).not.toHaveBeenCalled()
    window.removeEventListener('keydown', globalEscape)
  })

  it('翻页键同样拦截传播，不与全局快捷键双触发', () => {
    const globalKey = vi.fn()
    window.addEventListener('keydown', globalKey)
    render(<PresentationMode doc={doc} onClose={() => {}} />)
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(globalKey).not.toHaveBeenCalled()
    window.removeEventListener('keydown', globalKey)
  })
})
