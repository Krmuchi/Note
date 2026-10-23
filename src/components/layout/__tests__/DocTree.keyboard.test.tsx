import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocTree } from '@/components/layout/DocTree'
import { useNotesStore } from '@/store'
import type { NoteDoc, Notebook } from '@/types'

/**
 * 文档树键盘导航（T6）。
 * 目标：主流程（选文档 → 展开/收起 → 打开 → 重命名）不用鼠标也能走完。
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

const notebook: Notebook = {
  id: 'nb1',
  title: '学习笔记',
  docs: [
    doc({ id: 'a', title: '父文档' }),
    doc({ id: 'a1', title: '子文档', parentId: 'a' }),
    doc({ id: 'b', title: '另一个文档' }),
  ],
}

const renderTree = (sortMode: 'manual' | 'updated' | 'title' = 'manual'): { onViewDoc: ReturnType<typeof vi.fn>; tree: HTMLElement } => {
  const onViewDoc = vi.fn()
  render(
    <DocTree
      activeNotebook={notebook}
      searchText=""
      sortMode={sortMode}
      onViewDoc={onViewDoc}
      onMoveRequest={vi.fn()}
    />,
  )
  return { onViewDoc, tree: screen.getByRole('tree') }
}

const items = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('.doc-item'))
const focusedItem = (): HTMLElement | undefined => items().find((el) => el.className.includes('focused'))

beforeEach(() => {
  // 展开态会持久化到 localStorage（对齐语雀）：不清理会让上一个用例的展开状态
  // 泄漏到下一个用例，节点数量与顺序随之改变
  localStorage.clear()
  useNotesStore.setState({
    notebooks: [notebook],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'a',
  })
})

describe('DocTree 键盘导航', () => {
  it('渲染为 tree / treeitem 语义，并标注层级', () => {
    renderTree()
    const treeItems = screen.getAllByRole('treeitem')
    // 子文档默认收起，所以只渲染根级两项
    expect(treeItems).toHaveLength(2)
    expect(treeItems[0].getAttribute('aria-level')).toBe('1')
  })

  it('↓ 在可见项之间移动焦点（收起时不下钻到子文档）', () => {
    const { tree } = renderTree()
    tree.focus()

    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    expect(focusedItem()?.getAttribute('data-doc-id')).toBe('b')

    fireEvent.keyDown(tree, { key: 'ArrowUp' })
    expect(focusedItem()?.getAttribute('data-doc-id')).toBe('a')
  })

  it('→ 展开、← 收起；收起状态再按 ← 回到父级', () => {
    const { tree } = renderTree()
    tree.focus()

    // 焦点默认落在当前打开的文档 a 上
    fireEvent.keyDown(tree, { key: 'ArrowRight' })
    expect(items()).toHaveLength(3)
    expect(document.querySelector('[data-doc-id="a"]')?.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(tree, { key: 'ArrowLeft' })
    expect(items()).toHaveLength(2)
    expect(document.querySelector('[data-doc-id="a"]')?.getAttribute('aria-expanded')).toBe('false')

    // 展开后进入子文档，再按 ← 回到父文档
    fireEvent.keyDown(tree, { key: 'ArrowRight' })
    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    expect(focusedItem()?.getAttribute('data-doc-id')).toBe('a1')
    fireEvent.keyDown(tree, { key: 'ArrowLeft' })
    expect(focusedItem()?.getAttribute('data-doc-id')).toBe('a')
  })

  it('Enter 打开当前项，Home/End 跳到首尾', () => {
    const { tree, onViewDoc } = renderTree()
    tree.focus()

    fireEvent.keyDown(tree, { key: 'End' })
    expect(focusedItem()?.getAttribute('data-doc-id')).toBe('b')

    fireEvent.keyDown(tree, { key: 'Home' })
    expect(focusedItem()?.getAttribute('data-doc-id')).toBe('a')

    fireEvent.keyDown(tree, { key: 'Enter' })
    expect(onViewDoc).toHaveBeenCalledWith('nb1', 'a')
  })

  it('F2 进入行内重命名', () => {
    const { tree } = renderTree()
    tree.focus()

    fireEvent.keyDown(tree, { key: 'F2' })
    const input = document.querySelector<HTMLInputElement>('.doc-title-input')
    expect(input).not.toBeNull()
    expect(input?.value).toBe('父文档')
  })

  it('排序模式影响可见顺序（按标题）', () => {
    renderTree('title')
    const titles = items().map((el) => el.querySelector('.doc-title')?.textContent)
    // 拼音排序：父文档(f) < 另一个文档(l)
    expect(titles).toEqual(['父文档', '另一个文档'])
  })
})
