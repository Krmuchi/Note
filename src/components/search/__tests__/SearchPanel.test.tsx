import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SearchPanel from '@/components/search/SearchPanel'
import { useNotesStore } from '@/store'
import { subscribeDocOpen, type DocOpenRequest } from '@/utils/docNavigation'
import { consumeSearchJump, resetSearchJump } from '@/utils/searchJump'
import type { NoteDoc } from '@/types'

/**
 * 搜索面板的打开/键盘契约。
 * 重点锁定三条回归：
 * 1. 点击结果必须走 requestDocOpen 通道（否则在开始页等视图点结果"毫无反应"）；
 * 2. 有置顶历史时，Enter 取的词必须与高亮项一致；
 * 3. Escape 自关后不再冒泡到全局链（避免一次 Esc 关两层面板）。
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

let received: DocOpenRequest[] = []
let unsubscribe: () => void = () => {}

beforeEach(() => {
  received = []
  unsubscribe = subscribeDocOpen((request) => received.push(request))
  resetSearchJump()
  localStorage.clear()
  useNotesStore.setState({
    notebooks: [
      {
        id: 'nb1',
        title: '知识库',
        docs: [
          doc({ id: 'd-jia', title: '甲文档' }),
          doc({ id: 'd-yi', title: '乙文档' }),
          doc({ id: 'd-target', title: '目标文档', content: '这里有目标关键词' }),
        ],
      },
    ],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: '',
    openTabs: [],
  })
})

afterEach(() => unsubscribe())

const renderPanel = (onClose = vi.fn()): { onClose: ReturnType<typeof vi.fn>; input: HTMLInputElement } => {
  render(<SearchPanel isOpen onClose={onClose} />)
  const input = screen.getByPlaceholderText('搜索标题、内容、标签...') as HTMLInputElement
  fireEvent.focus(input)
  return { onClose, input }
}

describe('SearchPanel - 点击结果走 requestDocOpen 通道', () => {
  it('点击文档结果：广播打开请求、登记搜索跳转、关闭面板', async () => {
    const { onClose, input } = renderPanel()
    fireEvent.change(input, { target: { value: '目标' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const item = await waitFor(() => {
      const el = document.querySelector('.result-item')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    fireEvent.click(item)

    expect(received).toEqual([{ notebookId: 'nb1', docId: 'd-target' }])
    expect(onClose).toHaveBeenCalled()
    // S1 跳转请求保留：打开后编辑器能定位到命中词
    expect(consumeSearchJump('d-target')).toBe('目标')
  })

  it('点击知识库结果：打开其第一篇文档', async () => {
    useNotesStore.setState({
      notebooks: [{ id: 'nb-special', title: '特殊知识库', docs: [doc({ id: 'd-first', title: '第一篇' })] }],
    })
    const { input } = renderPanel()
    fireEvent.change(input, { target: { value: '特殊知识库' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const item = await waitFor(() => {
      const el = document.querySelector('.result-item')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    fireEvent.click(item)

    expect(received).toEqual([{ notebookId: 'nb-special', docId: 'd-first' }])
  })
})

describe('SearchPanel - 置顶历史与键盘取词一致', () => {
  it('原始数组未排序时，Enter 仍取置顶（高亮）那条历史', async () => {
    // 故意把置顶项放在原始数组第二位：旧实现按原始下标取词会搜到"甲"
    useNotesStore.setState({
      searchHistory: [
        { id: 'h1', query: '甲', timestamp: '2026-01-02T00:00:00.000Z', resultCount: 1, pinned: false, useCount: 1 },
        { id: 'h2', query: '乙', timestamp: '2026-01-01T00:00:00.000Z', resultCount: 1, pinned: true, useCount: 1 },
      ],
    })
    const { input } = renderPanel()

    // 历史列表渲染顺序：置顶"乙"在前
    await waitFor(() => {
      const texts = Array.from(document.querySelectorAll('.history-text')).map(el => el.textContent)
      expect(texts).toEqual(['乙', '甲'])
    })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    // 输入框被填成置顶词"乙"，并搜出乙文档
    expect(input.value).toBe('乙')
    await waitFor(() => {
      expect(document.querySelector('.result-title')?.textContent).toContain('乙文档')
    })
  })
})

describe('SearchPanel - Escape 不再冒泡到全局链', () => {
  it('Escape 关闭面板，且父级与 window 监听都收不到该事件', () => {
    const parentKeyDown = vi.fn()
    const windowKeyDown = vi.fn()
    window.addEventListener('keydown', windowKeyDown)

    const onClose = vi.fn()
    render(
      <div onKeyDown={parentKeyDown}>
        <SearchPanel isOpen onClose={onClose} />
      </div>,
    )
    const input = screen.getByPlaceholderText('搜索标题、内容、标签...')
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
    expect(parentKeyDown).not.toHaveBeenCalled()
    expect(windowKeyDown).not.toHaveBeenCalled()

    window.removeEventListener('keydown', windowKeyDown)
  })
})