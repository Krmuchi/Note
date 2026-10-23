import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BacklinksBar from '@/components/editor/BacklinksBar'
import { useNotesStore } from '@/store'
import { subscribeDocOpen, type DocOpenRequest } from '@/utils/docNavigation'
import type { NoteDoc, Notebook } from '@/types'

/** 反向链接条（K1）：展示 + 点击跳转。 */

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

const notebooks: Notebook[] = [
  {
    id: 'nb1',
    title: '工作',
    docs: [
      doc({ id: 'target', title: '项目计划' }),
      doc({ id: 'src1', title: '周报', content: '见 [[项目计划]]' }),
      doc({ id: 'src2', title: '待办', content: '[[项目计划]] 待更新' }),
    ],
  },
]

let received: DocOpenRequest[] = []
// 统一登记取消订阅：每个用例都新建订阅，漏掉取消会让监听器跨用例累积
let unsubscribers: Array<() => void> = []

beforeEach(() => {
  received = []
  unsubscribers.push(subscribeDocOpen((req) => received.push(req)))
  useNotesStore.setState({
    notebooks,
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'target',
  })
})

afterEach(() => {
  unsubscribers.forEach((off) => off())
  unsubscribers = []
})

describe('BacklinksBar', () => {
  it('有引用时显示计数，默认收起', async () => {
    render(<BacklinksBar />)
    // 索引计算放在空闲回调里（避免每次击键都重算），因此需要等它落地
    expect(await screen.findByText('2 篇文档引用了本文')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '周报' })).toBeNull()
  })

  it('展开后列出引用方，点击跳转过去', async () => {
    render(<BacklinksBar />)

    fireEvent.click(await screen.findByRole('button', { name: /2 篇文档引用了本文/ }))
    fireEvent.click(screen.getByRole('button', { name: '周报' }))

    expect(received).toEqual([{ notebookId: 'nb1', docId: 'src1' }])
  })

  it('没有引用时不渲染（不占版面）', async () => {
    useNotesStore.setState({ activeDocId: 'src1' })
    const { container } = render(<BacklinksBar />)
    // 等一次空闲回调后再断言"仍然为空"，确认不是"还没算出来"
    await waitFor(() => expect(container.firstChild).toBeNull())
  })
})
