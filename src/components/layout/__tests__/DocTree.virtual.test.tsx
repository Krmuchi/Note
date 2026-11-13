import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocTree } from '@/components/layout/DocTree'
import { useNotesStore } from '@/store'
import type { NoteDoc, Notebook } from '@/types'

/**
 * 回归（缺陷：虚拟化文档树键盘导航焦点消失）。
 * >200 篇时走 VirtualScroll，焦点项可能不在渲染窗口内，
 * querySelector + scrollIntoView 静默失效。focusByIndex 必须改走
 * 命令式 scrollToIndex，按行高把目标项滚进可视区。
 *
 * jsdom 无真实布局（clientHeight=0），DocTree 的 listHeight 回退为 480，
 * 行高 40 → 视口约 12 行 + overscan。这里用 300 篇触发虚拟化。
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

const buildNotebook = (count: number): Notebook => ({
  id: 'nb1',
  title: '大库',
  docs: Array.from({ length: count }, (_, i) => doc({ id: `d${i}`, title: `文档${i}` })),
})

beforeEach(() => {
  localStorage.clear()
  useNotesStore.setState({
    notebooks: [buildNotebook(300)],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'd0',
    openTabs: [],
  })
})

const renderTree = (): HTMLElement => {
  render(
    <DocTree
      activeNotebook={useNotesStore.getState().notebooks[0]}
      searchText=""
      sortMode="manual"
      onViewDoc={vi.fn()}
      onMoveRequest={vi.fn()}
    />,
  )
  return screen.getByRole('tree')
}

describe('DocTree - 虚拟化键盘导航', () => {
  it('300 篇触发虚拟化：只渲染可视窗口内的项', () => {
    renderTree()
    const rendered = document.querySelectorAll('.doc-item')
    // 远少于 300（视口 480/40=12 行 + overscan 10 ≈ 22 项）
    expect(rendered.length).toBeLessThan(60)
    expect(rendered.length).toBeGreaterThan(0)
  })

  it('End 跳到最后一项：目标项被滚入渲染窗口（旧实现 querySelector 落空）', () => {
    const tree = renderTree()
    tree.focus()

    fireEvent.keyDown(tree, { key: 'End' })

    // d299 必须出现在 DOM 里（scrollToIndex 把它滚进了可视区）
    expect(document.querySelector('[data-doc-id="d299"]')).not.toBeNull()
    // 且它是键盘焦点项
    expect(document.querySelector('[data-doc-id="d299"]')?.className).toContain('focused')
  })

  it('End 后再 Home：首项重新滚回可视区', () => {
    const tree = renderTree()
    tree.focus()

    fireEvent.keyDown(tree, { key: 'End' })
    expect(document.querySelector('[data-doc-id="d299"]')).not.toBeNull()

    fireEvent.keyDown(tree, { key: 'Home' })
    expect(document.querySelector('[data-doc-id="d0"]')).not.toBeNull()
    expect(document.querySelector('[data-doc-id="d0"]')?.className).toContain('focused')
  })

  it('连续 ArrowDown 移出初始窗口后，焦点项始终可见', () => {
    const tree = renderTree()
    tree.focus()

    // 初始窗口约 22 项；连按 40 次下移，焦点项应仍在 DOM 中
    for (let i = 0; i < 40; i++) {
      fireEvent.keyDown(tree, { key: 'ArrowDown' })
    }
    const focused = document.querySelector('.doc-item.focused')
    expect(focused).not.toBeNull()
    expect(focused?.getAttribute('data-doc-id')).toBe('d40')
  })
})