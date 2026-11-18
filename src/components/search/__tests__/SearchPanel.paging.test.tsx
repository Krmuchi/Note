import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { JSX } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import SearchPanel from '@/components/search/SearchPanel'
import { ToastContainer } from '@/components/common/ToastView'
import { useToast } from '@/components/common/Toast'
import { useNotesStore } from '@/store'
import { requestTagSearch, resetTagSearch } from '@/store/slices/searchSlice'
import { subscribeDocOpen, type DocOpenRequest } from '@/utils/docNavigation'
import type { NoteDoc, Tag } from '@/types'

/**
 * P1-5 回车开首条 / P1-6 计数·路径·加载更多 / P1-7 建议直达 / P1-9 按标签看文档 /
 * P2 搜索历史清空可撤销。
 * 旧实现里：出结果后回车永远打不开（要先按 ↓）、结果被静默截断在 50 条、
 * 结果行不显示所属知识库、带 id 的建议却只再搜一次、标签浏览根本没有入口。
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

const tag = (id: string, name: string): Tag => ({
  id,
  name,
  color: '#f00',
  icon: '',
  parentId: null,
  usageCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

let received: DocOpenRequest[] = []
let unsubscribe: () => void = () => {}

beforeEach(() => {
  received = []
  unsubscribe = subscribeDocOpen((request) => received.push(request))
  resetTagSearch()
  localStorage.clear()
  useNotesStore.setState({
    notebooks: [],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: '',
    openTabs: [],
  })
})

afterEach(() => {
  unsubscribe()
  vi.useRealTimers()
})

const renderPanel = (): { onClose: ReturnType<typeof vi.fn>; input: HTMLInputElement } => {
  const onClose = vi.fn()
  render(<SearchPanel isOpen onClose={onClose} />)
  const input = screen.getByPlaceholderText('搜索标题、内容、标签...') as HTMLInputElement
  fireEvent.focus(input)
  return { onClose, input }
}

const resultCount = (): number => document.querySelectorAll('.result-item').length

const headerText = (): string =>
  document.querySelector('.results-header span')?.textContent ?? ''

describe('P1-5 出结果默认选中第 0 条', () => {
  it('回车搜出结果后，第一条就是高亮项；再按回车直接打开（无需先按方向键）', async () => {
    useNotesStore.setState({
      notebooks: [
        {
          id: 'nb1',
          title: '知识库',
          docs: [
            doc({ id: 'a', title: '定位方案一' }),
            doc({ id: 'b', title: '定位方案二' }),
          ],
        },
      ],
    })
    const { input } = renderPanel()
    fireEvent.change(input, { target: { value: '定位' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(resultCount()).toBeGreaterThan(0))
    // 旧实现这里 activeIndex 是 -1：列表高亮空缺，回车只会把同一场搜索再跑一遍
    expect(document.querySelectorAll('.result-item')[0].className).toContain('active')

    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(received.length).toBe(1))
    expect(received[0].notebookId).toBe('nb1')
  })
})

describe('P1-6 结果计数、路径与加载更多', () => {
  it('超过 50 条时如实说明截断，并可一键加载更多', async () => {
    const docs = Array.from({ length: 60 }, (_, i) => doc({ id: 'd' + i, title: `批量任务${i}` }))
    useNotesStore.setState({ notebooks: [{ id: 'nb1', title: '知识库', docs }] })
    const { input } = renderPanel()
    fireEvent.change(input, { target: { value: '批量任务' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(resultCount()).toBe(50))
    expect(headerText()).toBe('共 60 条结果，已显示前 50 条')

    fireEvent.click(screen.getByRole('button', { name: '加载更多（还有 10 条）' }))
    expect(resultCount()).toBe(60)
    expect(headerText()).toBe('找到 60 条结果')
  })

  it('结果行显示「知识库 › 父文档」路径，同名文档能分辨在哪个库', async () => {
    useNotesStore.setState({
      notebooks: [
        {
          id: 'nb1',
          title: '知识库',
          docs: [
            doc({ id: 'p', title: '周报' }),
            doc({ id: 'c', title: '周报汇总', parentId: 'p' }),
          ],
        },
        { id: 'nb2', title: '另一个库', docs: [doc({ id: 'x', title: '周报草稿' })] },
      ],
    })
    const { input } = renderPanel()
    fireEvent.change(input, { target: { value: '周报' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(resultCount()).toBe(3))
    const paths = Array.from(document.querySelectorAll('.result-path')).map((el) => el.textContent)
    expect(paths).toContain('知识库 › 周报')
    expect(paths).toContain('另一个库')
  })
})

describe('P1-9 按标签看文档', () => {
  it('标签页发来的请求：面板打开即按标签筛（空关键词也允许），并展开筛选面板', async () => {
    useNotesStore.setState({
      notebooks: [
        {
          id: 'nb1',
          title: '知识库',
          docs: [
            doc({ id: 'a', title: '带标签甲', tags: ['t1'] }),
            doc({ id: 'b', title: '带标签乙', tags: ['t1'] }),
            doc({ id: 'c', title: '无标签' }),
          ],
        },
      ],
      tags: [tag('t1', '工作')],
    })
    requestTagSearch({ tagIds: ['t1'], label: '工作' })

    renderPanel()
    await waitFor(() => expect(resultCount()).toBe(2))
    expect(headerText()).toBe('找到 2 条结果')
    // 筛选面板被展开：用户看得见是哪个标签在起作用
    expect(document.querySelector('.search-filter-panel')).not.toBeNull()
  })
})

describe('P1-7 建议直达', () => {
  it('「文档」类建议点击直接打开那篇文档，而不是再搜一次', () => {
    vi.useFakeTimers()
    useNotesStore.setState({
      notebooks: [{ id: 'nb1', title: '知识库', docs: [doc({ id: 'd-jia', title: '甲文档' })] }],
    })
    const { input } = renderPanel()
    fireEvent.change(input, { target: { value: '甲' } })

    // 建议防抖 300ms；搜索防抖 400ms —— 在建议出现、搜索尚未跑的窗口里点击
    act(() => { vi.advanceTimersByTime(320) })
    const suggestion = Array.from(document.querySelectorAll('.suggestion-item')).find(
      (el) => el.textContent?.includes('甲文档'),
    )
    expect(suggestion).toBeTruthy()
    fireEvent.click(suggestion as Element)

    expect(received).toEqual([{ notebookId: 'nb1', docId: 'd-jia' }])
    expect(resultCount()).toBe(0)
  })
})

describe('P2 搜索历史清空可撤销', () => {
  function ToastHost(): JSX.Element {
    const { toasts, removeToast } = useToast()
    return <ToastContainer toasts={toasts} onClose={removeToast} />
  }

  it('清空历史后可通过 toast 撤销，整份（含置顶）原样回来', async () => {
    useNotesStore.setState({
      searchHistory: [
        { id: 'h1', query: '普通词', timestamp: '2026-01-01T00:00:00.000Z', resultCount: 1, pinned: false, useCount: 1 },
        { id: 'h2', query: '置顶词', timestamp: '2026-01-02T00:00:00.000Z', resultCount: 1, pinned: true, useCount: 1 },
      ],
    })
    render(
      <>
        <SearchPanel isOpen onClose={vi.fn()} />
        <ToastHost />
      </>,
    )

    await waitFor(() => expect(document.querySelectorAll('.history-item').length).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: '清空' }))
    expect(document.querySelectorAll('.history-item').length).toBe(0)

    const undo = document.querySelector('.toast-action') as HTMLElement
    expect(undo).not.toBeNull()
    fireEvent.click(undo)
    await waitFor(() => expect(document.querySelectorAll('.history-item').length).toBe(2))
    // 置顶项仍在最前（顺序也一并还原）
    const texts = Array.from(document.querySelectorAll('.history-text')).map((el) => el.textContent)
    expect(texts).toEqual(['置顶词', '普通词'])
  })
})
