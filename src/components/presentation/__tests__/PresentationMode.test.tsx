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

/**
 * P：演示模式支持正文里单独成行的 --- 作为**手动分页符**。
 * 顺带钉住"代码围栏里的 --- 不是分页符"（否则一段 YAML 就被切开）。
 */
describe('PresentationMode 手动分页（---）', () => {
  const page = (): string => (screen.getByTestId('md') as HTMLElement).textContent ?? ''

  it('单独成行的 --- 切成两页', () => {
    const paged = { ...doc, content: '第一页内容\n---\n第二页内容' }
    render(<PresentationMode doc={paged} onClose={() => {}} />)

    expect(page()).toContain('第一页内容')
    expect(page()).not.toContain('第二页内容')

    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(page()).toContain('第二页内容')
    expect(page()).not.toContain('第一页内容')

    // 往回也能翻
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    expect(page()).toContain('第一页内容')
  })

  it('代码围栏里的 --- 不参与分页（整段仍在同一页）', () => {
    // 用 fromCharCode 拼三反引号：源码里直接写会截断模板字符串
    const ticks = String.fromCharCode(96, 96, 96)
    const fenced = {
      ...doc,
      content: '# 配置\n' + ticks + 'yaml\nkey: 1\n---\nkey: 2\n' + ticks,
    }
    render(<PresentationMode doc={fenced} onClose={() => {}} />)

    const before = page()
    expect(before).toContain('key: 1')
    expect(before).toContain('key: 2')

    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    // 只有一页：翻页后内容不变（曾经围栏里的 --- 会把配置切开）
    expect(page()).toBe(before)
  })

  it('文首孤立的 --- 不制造空页', () => {
    const leading = { ...doc, content: '---\n---\n正文只有一页' }
    render(<PresentationMode doc={leading} onClose={() => {}} />)
    expect(page()).toContain('正文只有一页')
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(page()).toContain('正文只有一页')
  })
})
