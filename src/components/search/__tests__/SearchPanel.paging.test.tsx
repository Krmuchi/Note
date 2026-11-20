import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { JSX } from 'react'
import { render, screen, fireEvent, waitFor, act, configure } from '@testing-library/react'
import SearchPanel from '@/components/search/SearchPanel'
import { ToastContainer } from '@/components/common/ToastView'
import { useToast } from '@/components/common/Toast'
import { useNotesStore } from '@/store'
import { requestTagSearch, resetTagSearch, SEARCH_TOP_K } from '@/store/slices/searchSlice'
import { subscribeDocOpen, type DocOpenRequest } from '@/utils/docNavigation'
import type { NoteDoc, Tag } from '@/types'

/**
 * P1-5 回车开首条 / P1-6 计数·路径·加载更多 / P1-7 建议直达 / P1-9 按标签看文档 /
 * P2 搜索历史清空可撤销。
 * 旧实现里：出结果后回车永远打不开（要先按 ↓）、结果被静默截断在 50 条、
 * 结果行不显示所属知识库、带 id 的建议却只再搜一次、标签浏览根本没有入口。
 */

// 全量套件并发时机器负载高，防抖搜索（400ms）+ waitFor 默认 1s 会偶发超时；统一放宽异步等待
configure({ asyncUtilTimeout: 10000 })
// 多批次用例（200~400 条数据 + 每批一次全库搜索）在全量并发跑时会顶穿 it() 的默认 5s 线
// （asyncUtilTimeout 只放宽 waitFor，不改用例超时），显式给 15s 抗负载抖动

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

describe('P1-6 top-K 达上限后按需加载下一批（计数与文案保持如实）', () => {
  /** 同分命中（稳定序 = 遍历序）：批量任务0..hits-1 */
  const hitDocs = (hits: number): NoteDoc[] =>
    Array.from({ length: hits }, (_, i) => doc({ id: 'd' + i, title: `批量任务${i}` }))

  const loadMore = (): void => {
    fireEvent.click(document.querySelector('.load-more-btn') as HTMLElement)
  }

  it('命中超过 K：计数报真实总数，到 K 上限后点「加载更多」取下一批直到取完', { timeout: 15_000 }, async () => {
    const hits = SEARCH_TOP_K + 60
    useNotesStore.setState({ notebooks: [{ id: 'nb1', title: '知识库', docs: hitDocs(hits) }] })
    const { input } = renderPanel()
    fireEvent.change(input, { target: { value: '批量任务' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(resultCount()).toBe(50))
    // 计数是未截断的命中总数（260），不是取回的 top-K（200）
    expect(headerText()).toBe(`共 ${hits} 条结果，已显示前 50 条`)
    // 搜索历史里记的计数同样要是真实命中数
    expect(useNotesStore.getState().searchHistory[0]?.resultCount).toBe(hits)

    // 翻页到 top-K 上限：第 201 条起还没取回，按钮如实报余量（不再消失）
    for (let i = 0; i < 3; i++) loadMore()
    expect(resultCount()).toBe(SEARCH_TOP_K)
    expect(headerText()).toBe(`共 ${hits} 条结果，已显示前 ${SEARCH_TOP_K} 条`)
    expect(document.querySelector('.load-more-btn')?.textContent).toBe(
      `加载更多（还有 ${hits - SEARCH_TOP_K} 条）`,
    )

    // 再点：从 store 取下一批（offset=200）追加，继续翻页直到取完
    loadMore()
    expect(resultCount()).toBe(SEARCH_TOP_K + 50)
    loadMore()
    expect(resultCount()).toBe(hits)
    expect(headerText()).toBe(`找到 ${hits} 条结果`)
    expect(document.querySelector('.load-more-btn')).toBeNull()

    // 批界两侧排序连续：同分稳定序下第 200/201 名正是批量任务199/200
    const titles = Array.from(document.querySelectorAll('.result-title')).map((el) => el.textContent)
    expect(titles[0]).toBe('批量任务0')
    expect(titles[199]).toBe('批量任务199')
    expect(titles[200]).toBe('批量任务200')
    expect(titles[hits - 1]).toBe(`批量任务${hits - 1}`)
  })

  it('边界：正好 K=200 条时不再取下一批', { timeout: 15_000 }, async () => {
    useNotesStore.setState({ notebooks: [{ id: 'nb1', title: '知识库', docs: hitDocs(SEARCH_TOP_K) }] })
    const { input } = renderPanel()
    fireEvent.change(input, { target: { value: '批量任务' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(resultCount()).toBe(50))
    for (let i = 0; i < 3; i++) loadMore()
    expect(resultCount()).toBe(SEARCH_TOP_K)
    expect(headerText()).toBe(`找到 ${SEARCH_TOP_K} 条结果`)
    expect(document.querySelector('.load-more-btn')).toBeNull()
  })

  it('边界：201 条时下一批恰是第 201 名，文案随即如实收口', { timeout: 15_000 }, async () => {
    const hits = SEARCH_TOP_K + 1
    useNotesStore.setState({ notebooks: [{ id: 'nb1', title: '知识库', docs: hitDocs(hits) }] })
    const { input } = renderPanel()
    fireEvent.change(input, { target: { value: '批量任务' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(resultCount()).toBe(50))
    for (let i = 0; i < 3; i++) loadMore()
    expect(resultCount()).toBe(SEARCH_TOP_K)
    expect(document.querySelector('.load-more-btn')?.textContent).toBe('加载更多（还有 1 条）')

    loadMore()
    expect(resultCount()).toBe(hits)
    expect(headerText()).toBe(`找到 ${hits} 条结果`)
    expect(document.querySelector('.load-more-btn')).toBeNull()
    const titles = Array.from(document.querySelectorAll('.result-title')).map((el) => el.textContent)
    expect(titles[SEARCH_TOP_K]).toBe(`批量任务${SEARCH_TOP_K}`)
  })

  it('排序连续性（400 命中）：跨批后的第 201~400 条就是全量排序的对应名次', { timeout: 15_000 }, async () => {
    // 两档分数语料：强命中 s0..s99（180 分、更新）在前，弱命中 w0..w299（120 分）按时间倒序跟随。
    // 全量排序期望序独立推算（不经过 search 代码）：s99..s0 → w299..w0，
    // 即 rank 0..99 = s99..s0，rank 100+k = w_{299-k}。
    const weak = Array.from({ length: 300 }, (_, j) =>
      doc({
        id: `w${j}`,
        title: `关键词弱项 w${j}`,
        updatedAt: new Date(Date.UTC(2026, 0, 1) + j * 1000).toISOString(),
      }),
    )
    const strong = Array.from({ length: 100 }, (_, i) =>
      doc({
        id: `s${i}`,
        title: `笔记关键词 s${i}`,
        content: '关键词'.repeat(12),
        updatedAt: new Date(Date.UTC(2026, 0, 2) + i * 1000).toISOString(),
      }),
    )
    useNotesStore.setState({ notebooks: [{ id: 'nb1', title: '知识库', docs: [...weak, ...strong] }] })
    const { input } = renderPanel()
    fireEvent.change(input, { target: { value: '关键词' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(resultCount()).toBe(50))
    for (let i = 0; i < 3; i++) loadMore()
    expect(resultCount()).toBe(SEARCH_TOP_K)
    // 跨过 K 上限继续取：第 4 次点击取第二批，再翻 3 页显示满 400
    for (let i = 0; i < 4; i++) loadMore()
    expect(resultCount()).toBe(400)
    expect(headerText()).toBe('找到 400 条结果')

    const titles = Array.from(document.querySelectorAll('.result-title')).map((el) => el.textContent)
    expect(titles[0]).toBe('笔记关键词 s99')
    // 名次连续：第 200 名（0 起）是 w200，第 201 名是 w199，最后一名是 w0
    expect(titles[199]).toBe('关键词弱项 w200')
    expect(titles[200]).toBe('关键词弱项 w199')
    expect(titles[399]).toBe('关键词弱项 w0')
  })

  it('滚到底自动续载：已达 K 上限时滚动触发取下一批', { timeout: 15_000 }, async () => {
    const hits = SEARCH_TOP_K + 60
    useNotesStore.setState({ notebooks: [{ id: 'nb1', title: '知识库', docs: hitDocs(hits) }] })
    const { input } = renderPanel()
    fireEvent.change(input, { target: { value: '批量任务' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(resultCount()).toBe(50))
    for (let i = 0; i < 3; i++) loadMore()
    expect(resultCount()).toBe(SEARCH_TOP_K)

    // jsdom 无布局：scrollHeight/clientHeight 均为 0，任意滚动都算「到底」
    fireEvent.scroll(document.querySelector('.search-results') as Element)
    expect(resultCount()).toBe(SEARCH_TOP_K + 50)
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
