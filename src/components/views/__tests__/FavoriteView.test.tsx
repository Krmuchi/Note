import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * 收藏视图内嵌 Editor 较重，这里只关心"点列表项不切视图"，用 stub 替代。
 * mock 工厂在 import 前提升执行，JSX 走自动 runtime，无需引入 React。
 */
vi.mock('@/components/editor/Editor', () => ({
  Editor: () => <div data-testid="editor-stub" />,
}))

import FavoriteView from '@/components/views/FavoriteView'
import { useNotesStore } from '@/store'
import { getUIState, uiActions } from '@/hooks/useUIState'
import { getRecentViews } from '@/services/recentViews'
import type { NoteDoc } from '@/types'

/**
 * 回归（缺陷：收藏视图内点文档会跳出收藏视图）。
 * 收藏是"左列表右编辑器"同屏布局；点列表项只应切换活动文档，
 * 不能走 App.handleViewDoc（那会把 activeView 强制切回 notebooks，列表消失）。
 */

const doc = (over: Partial<NoteDoc> & { id: string; title: string }): NoteDoc => ({
  content: '',
  parentId: null,
  tags: [],
  favorite: true,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

beforeEach(() => {
  localStorage.clear()
  useNotesStore.setState({
    notebooks: [
      {
        id: 'nb1',
        title: '库一',
        docs: [doc({ id: 'd1', title: '收藏甲' }), doc({ id: 'd2', title: '收藏乙' })],
      },
      { id: 'nb2', title: '库二', docs: [doc({ id: 'd3', title: '收藏丙' })] },
    ],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'd1',
    openTabs: [],
  })
  // 把视图置于收藏页
  uiActions.setActiveLeftMenu('favorite')
  uiActions.setActiveView('favorite')
})

describe('FavoriteView - 本地打开不切视图', () => {
  it('点击收藏项：只切换活动文档，activeView/activeLeftMenu 保持 favorite', () => {
    const onViewDoc = vi.fn()
    render(
      <FavoriteView
        activeDocId="d1"
        activeNotebookId="nb1"
        onViewDoc={onViewDoc}
      />,
    )

    fireEvent.click(screen.getByText('收藏丙'))

    // 活动文档切到 nb2/d3
    expect(useNotesStore.getState().activeNotebookId).toBe('nb2')
    expect(useNotesStore.getState().activeDocId).toBe('d3')
    // 视图不跳走
    expect(getUIState().activeView).toBe('favorite')
    expect(getUIState().activeLeftMenu).toBe('favorite')
    // 不走 App.handleViewDoc 通道
    expect(onViewDoc).not.toHaveBeenCalled()
    // 收藏列表仍在（同屏）
    expect(screen.getByText('收藏甲')).toBeInTheDocument()
  })

  it('切换活动文档会自动登记标签（setActiveDocId 统一入口）', () => {
    render(
      <FavoriteView activeDocId="d1" activeNotebookId="nb1" onViewDoc={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('收藏乙'))
    expect(useNotesStore.getState().openTabs.some(t => t.docId === 'd2')).toBe(true)
  })

  it('本地打开也记录最近浏览（视图不切换 ≠ 不算浏览）', () => {
    render(
      <FavoriteView activeDocId="d1" activeNotebookId="nb1" onViewDoc={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('收藏丙'))
    const recents = getRecentViews()
    expect(recents[0]).toMatchObject({ notebookId: 'nb2', docId: 'd3' })
    // 持久化同步完成（重开应用后最近列表还在）
    const persisted = JSON.parse(localStorage.getItem('notes-recent-views') ?? '[]') as unknown[]
    expect(persisted.length).toBeGreaterThan(0)
  })
})