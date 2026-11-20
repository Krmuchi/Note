import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { DocTree } from '@/components/layout/DocTree'
import type { NoteDoc, Notebook } from '@/types'

/**
 * 展开态写回的击键期稳定性（P-perf 任务 3）。
 *
 * persistExpanded 的 effect 依赖 aliveDocIds：旧实现每个新的 activeNotebook 引用都
 * 重建 Set，正文击键（id 集不变）也把 effect 带跑一遍 —— debounce 被反复重置，
 * 400ms 后 JSON.stringify + 同步 setItem。aliveDocIds 现在经 createAliveIdsDeriver
 * 稳定投影，只有 id 集真正变化（增删文档）才触发写回。
 */

const KEY = 'notes-doc-expanded'

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

const buildNotebook = (docs: NoteDoc[]): Notebook => ({
  id: 'nb1',
  title: '学习笔记',
  docs,
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const renderTree = (notebook: Notebook): ReturnType<typeof render> =>
  render(
    <DocTree
      activeNotebook={notebook}
      searchText=""
      sortMode="manual"
      onViewDoc={vi.fn()}
      onMoveRequest={vi.fn()}
    />,
  )

const writesTo = (spy: { mock: { calls: unknown[][] } }): number =>
  spy.mock.calls.filter((c) => c[0] === KEY).length

describe('persistExpanded 的 effect 依赖稳定性', () => {
  it('正文击键（id 集不变）不重复写回展开态', () => {
    vi.useFakeTimers()
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    const notebook = buildNotebook([
      doc({ id: 'a', title: 'A', content: 'v1' }),
      doc({ id: 'b', title: 'B', content: 'v1' }),
    ])
    const { rerender } = renderTree(notebook)

    // 挂载时的首次写回先落地，之后再数"新增写回"
    act(() => {
      vi.advanceTimersByTime(500)
    })
    const before = writesTo(setItemSpy)
    expect(before).toBeGreaterThan(0)

    // 模拟连打 5 次键：activeNotebook / doc 全换新对象，但 id 集不变
    for (let i = 0; i < 5; i++) {
      const changed = buildNotebook(notebook.docs.map((d) => ({ ...d, content: `v${i + 2}` })))
      rerender(
        <DocTree
          activeNotebook={changed}
          searchText=""
          sortMode="manual"
          onViewDoc={vi.fn()}
          onMoveRequest={vi.fn()}
        />,
      )
      act(() => {
        vi.advanceTimersByTime(500)
      })
    }
    expect(writesTo(setItemSpy)).toBe(before)
  })

  it('增删文档（id 集变化）才触发写回', () => {
    vi.useFakeTimers()
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    const notebook = buildNotebook([doc({ id: 'a', title: 'A' })])
    const { rerender } = renderTree(notebook)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    const before = writesTo(setItemSpy)

    const grown = buildNotebook([...notebook.docs, doc({ id: 'c', title: 'C' })])
    rerender(
      <DocTree
        activeNotebook={grown}
        searchText=""
        sortMode="manual"
        onViewDoc={vi.fn()}
        onMoveRequest={vi.fn()}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(writesTo(setItemSpy)).toBeGreaterThan(before)
  })
})
