import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TagPanel from '@/components/tags/TagPanel'
import SearchPanel from '@/components/search/SearchPanel'
import { getUIState, uiActions } from '@/hooks/useUIState'
import { useNotesStore } from '@/store'
import { resetTagSearch } from '@/store/slices/searchSlice'
import type { NoteDoc, Tag } from '@/types'

/**
 * P1-9：标签页的「按标签看文档」入口。
 * 旧标签页只有改名 / 删除 / 统计，点标签行只是勾选批量对象 —— 根本没有浏览入口。
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

const workTag: Tag = {
  id: 't-work',
  name: '工作',
  color: '#f00',
  icon: '',
  parentId: null,
  usageCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const emptyTag: Tag = { ...workTag, id: 't-empty', name: '空标签', usageCount: 0 }

beforeEach(() => {
  resetTagSearch()
  localStorage.clear()
  uiActions.setShowSearchPanel(false)
  useNotesStore.setState({
    notebooks: [
      {
        id: 'nb1',
        title: '知识库',
        docs: [
          doc({ id: 'd1', title: '带工作标签一', tags: ['t-work'] }),
          doc({ id: 'd2', title: '带工作标签二', tags: ['t-work'] }),
          doc({ id: 'd3', title: '不带标签' }),
        ],
      },
    ],
    tags: [workTag, emptyTag],
    trash: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: '',
  })
})

describe('TagPanel 按标签看文档（P1-9）', () => {
  it('标签行提供「查看关联文档」入口，点击置起搜索面板', () => {
    render(<TagPanel isOpen embedded />)
    const btn = screen.getByRole('button', { name: '查看「工作」关联的文档' })
    expect(getUIState().showSearchPanel).toBe(false)
    fireEvent.click(btn)
    expect(getUIState().showSearchPanel).toBe(true)
  })

  it('没有关联文档的标签给出禁用态而不是死按钮', () => {
    render(<TagPanel isOpen embedded />)
    const btn = screen.getByRole('button', { name: '查看「空标签」关联的文档' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(btn)
    expect(getUIState().showSearchPanel).toBe(false)
  })

  it('链路打通：面板打开后只列出带该标签的文档（空关键词也成立）', async () => {
    render(<TagPanel isOpen embedded />)
    fireEvent.click(screen.getByRole('button', { name: '查看「工作」关联的文档' }))

    // 与 AppPanels 一致：面板是挂载时才消费请求的
    render(<SearchPanel isOpen onClose={vi.fn()} />)
    await waitFor(() => expect(document.querySelectorAll('.result-item').length).toBe(2))
    const titles = Array.from(document.querySelectorAll('.result-title')).map((el) => el.textContent)
    expect(titles).toEqual(['带工作标签一', '带工作标签二'])
  })
})
