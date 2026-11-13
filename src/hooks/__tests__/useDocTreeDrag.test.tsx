import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { DragEvent } from 'react'
import { useDocTreeDrag } from '@/hooks/useDocTreeDrag'
import type { NoteDoc, Notebook } from '@/types'

/**
 * 拖拽排序闸门（缺陷：非手动排序时同级 before/after 静默无效却提示"已移动"）。
 * 契约与右键菜单"上移/下移"一致：非 manual 排序禁用同级 before/after 落点；
 * 跨父级（改 parentId）与 inside 不受此限。
 */

const doc = (over: Partial<NoteDoc> & { id: string }): NoteDoc => ({
  title: over.id,
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
  title: '库',
  docs: [
    doc({ id: 'a' }),
    doc({ id: 'b' }),
    doc({ id: 'c' }),
    doc({ id: 'a1', parentId: 'a' }),
  ],
}

/** 构造一个可控落点的 drag 事件：currentTarget 高 100px，clientY 决定 before/inside/after */
const dragEvent = (clientY: number): DragEvent => {
  const target = document.createElement('div')
  target.getBoundingClientRect = () => ({ top: 0, height: 100, bottom: 100, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  return {
    preventDefault: vi.fn(),
    dataTransfer: { dropEffect: 'move', setData: vi.fn(), effectAllowed: 'move' },
    currentTarget: target,
    clientY,
  } as unknown as DragEvent
}

const setup = (sortMode: 'manual' | 'updated' | 'title'): {
  result: { current: ReturnType<typeof useDocTreeDrag> }
  updateDoc: ReturnType<typeof vi.fn>
  reorderDocs: ReturnType<typeof vi.fn>
  onExpandDoc: ReturnType<typeof vi.fn>
} => {
  const updateDoc = vi.fn()
  const reorderDocs = vi.fn()
  const onExpandDoc = vi.fn()
  const { result } = renderHook(() =>
    useDocTreeDrag({
      activeNotebook: notebook,
      activeNotebookId: 'nb1',
      updateDoc,
      reorderDocs,
      sortMode,
      onExpandDoc,
    }),
  )
  return { result, updateDoc, reorderDocs, onExpandDoc }
}

/** 模拟一次完整拖拽：start → over → drop */
const drag = (
  result: { current: ReturnType<typeof useDocTreeDrag> },
  sourceId: string,
  targetId: string,
  clientY: number,
): void => {
  act(() => result.current.handleDragStart(dragEvent(50), sourceId))
  act(() => result.current.handleDragOver(dragEvent(clientY), targetId))
  act(() => result.current.handleDrop(dragEvent(clientY), targetId))
}

describe('useDocTreeDrag - 非手动排序闸门', () => {
  it('updated 排序：同级 after 落点不显示指示线、drop 不改数据', () => {
    const { result, updateDoc, reorderDocs } = setup('updated')
    // a → b 的 after（clientY=90），两者同级（parentId 均 null）
    drag(result, 'a', 'b', 90)
    expect(result.current.dragOverDocId).toBeNull()
    expect(updateDoc).not.toHaveBeenCalled()
    expect(reorderDocs).not.toHaveBeenCalled()
  })

  it('title 排序：同级 before 落点同样被拦', () => {
    const { result, updateDoc, reorderDocs } = setup('title')
    drag(result, 'c', 'a', 10)
    expect(updateDoc).not.toHaveBeenCalled()
    expect(reorderDocs).not.toHaveBeenCalled()
  })

  it('manual 排序：同级 after 正常换序', () => {
    const { result, reorderDocs } = setup('manual')
    drag(result, 'a', 'b', 90)
    expect(reorderDocs).toHaveBeenCalled()
  })

  it('updated 排序：inside 落点不受闸门限制（改父级，可见）', () => {
    const { result, updateDoc, onExpandDoc } = setup('updated')
    // a → b 的 inside（clientY=50）
    drag(result, 'a', 'b', 50)
    expect(updateDoc).toHaveBeenCalledWith('nb1', 'a', { parentId: 'b' })
    expect(onExpandDoc).toHaveBeenCalledWith('b')
  })

  it('updated 排序：跨父级 after 不受闸门限制（改父级，可见）', () => {
    const { result, updateDoc } = setup('updated')
    // a1（父 a）→ b（父 null）的 after：跨父级，允许
    drag(result, 'a1', 'b', 90)
    expect(updateDoc).toHaveBeenCalledWith('nb1', 'a1', { parentId: null })
  })
})