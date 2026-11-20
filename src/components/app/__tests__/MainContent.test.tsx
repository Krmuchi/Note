import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MainContent } from '@/components/app/MainContent'
import { useNotesStore } from '@/store'
import type { NoteDoc } from '@/types'
import { getUIState, uiActions } from '@/hooks/useUIState'

/**
 * 启动回位（重启不回上次文档）的接线：MainContent 恰好在数据加载完成后才挂载
 * （App 在 isLoading 期间渲染骨架屏），挂载时若 store 有活动文档就落回文档视图。
 * 视图组件全部 mock 掉 —— 本测试只验证回位判定与视图切换，不牵动具体视图实现。
 */

vi.mock('@/components/views/NotebooksView', () => ({ default: () => <div>文档视图</div> }))
vi.mock('@/components/views/TrashView', () => ({ default: () => <div>回收站视图</div> }))
vi.mock('@/components/views/FavoriteView', () => ({ default: () => <div>收藏视图</div> }))
vi.mock('@/components/views/RecentView', () => ({ default: () => <div>最近视图</div> }))
vi.mock('@/components/start/StartPage', () => ({ default: () => <div>开始页</div> }))
vi.mock('@/components/tags/TagPanel', () => ({ default: () => <div>标签视图</div> }))
vi.mock('@/components/notes/QuickNotePanel', () => ({ default: () => <div>小记视图</div> }))

const baseProps = (): ComponentProps<typeof MainContent> => ({
  recentViews: [],
  activeNotebookId: 'nb-test',
  activeDocId: 'doc-a',
  searchText: '',
  trash: [],
  isMobile: false,
  isCompact: false,
  docsSidebarWidth: undefined,
  dragging: null,
  onViewDoc: vi.fn(),
  onSearchChange: vi.fn(),
  onCreateDoc: vi.fn(),
  onCreateNotebook: vi.fn(),
  onRestoreFromTrash: vi.fn(),
  onDeleteFromTrash: vi.fn(),
  onClearTrash: vi.fn(),
  onGoToDocs: vi.fn(),
  onDocsResizeStart: vi.fn(),
  onDocsResizeReset: vi.fn(),
})

const doc = (id: string, title: string): NoteDoc => ({
  id,
  title,
  content: '',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

beforeEach(() => {
  localStorage.clear()
  uiActions.reset()
  uiActions.setActiveLeftMenu('start')
  useNotesStore.setState({ notebooks: [], activeNotebookId: '', activeDocId: '', trash: [] })
})

afterEach(() => {
  cleanup()
})

describe('MainContent：启动回位（数据加载完成后挂载）', () => {
  it('有活动文档且停在开始页：挂载后落回文档视图，两字段成对', () => {
    useNotesStore.setState({
      notebooks: [{ id: 'nb-test', title: '我的知识库', docs: [doc('doc-a', '文档A')] }],
      activeNotebookId: 'nb-test',
      activeDocId: 'doc-a',
    })

    render(<MainContent {...baseProps()} />)

    expect(getUIState().activeLeftMenu).toBe('notebooks')
    expect(getUIState().activeView).toBe('notebooks')
    expect(screen.getByText('文档视图')).toBeInTheDocument()
  })

  it('没有活动文档：留在开始页（开始页就是正确落点）', async () => {
    render(<MainContent {...baseProps()} activeDocId="" />)

    expect(getUIState().activeLeftMenu).toBe('start')
    expect(await screen.findByText('开始页')).toBeInTheDocument()
  })

  it('全新安装（种子数据且未引导）：不回位，开始页留给新手引导当背景', async () => {
    // 种子数据 = 唯一默认知识库 + 唯一欢迎文档（见 utils/onboarding 判定）
    useNotesStore.setState({
      notebooks: [{ id: 'nb-default', title: '默认知识库', docs: [doc('doc-welcome', '欢迎')] }],
      activeNotebookId: 'nb-default',
      activeDocId: 'doc-welcome',
    })

    render(<MainContent {...baseProps()} />)

    expect(getUIState().activeLeftMenu).toBe('start')
    expect(await screen.findByText('开始页')).toBeInTheDocument()
  })

  it('用户明确停留过的视图不覆盖：回收站保持回收站', () => {
    uiActions.setActiveView('trash')
    useNotesStore.setState({
      notebooks: [{ id: 'nb-test', title: '我的知识库', docs: [doc('doc-a', '文档A')] }],
      activeNotebookId: 'nb-test',
      activeDocId: 'doc-a',
    })

    render(<MainContent {...baseProps()} />)

    expect(getUIState().activeLeftMenu).toBe('trash')
    expect(screen.getByText('回收站视图')).toBeInTheDocument()
  })
})
