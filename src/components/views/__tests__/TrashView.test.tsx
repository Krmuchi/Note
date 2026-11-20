import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TrashView from '@/components/views/TrashView'
import type { TrashDoc } from '@/types'

/**
 * 回收站空态的 CTA 与搜索无结果文案（空态出口统一）。
 *
 * 旧空态没有「去文档」出口，搜索无结果也没有「清除搜索」出口，
 * 文案还与其它视图各写各的（「未找到匹配的文档」vs「没有匹配的X」）。
 */

const makeTrashDoc = (over: Partial<TrashDoc> = {}): TrashDoc => ({
  id: 't1',
  title: '被删的文档',
  content: '',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  notebookId: 'nb-1',
  notebookTitle: '我的知识库',
  originalParentId: null,
  deletedAt: new Date().toISOString(),
  ...over,
})

const renderTrash = (trash: TrashDoc[]): {
  onRestore: ReturnType<typeof vi.fn>
  onDelete: ReturnType<typeof vi.fn>
  onClearTrash: ReturnType<typeof vi.fn>
  onGoToDocs: ReturnType<typeof vi.fn>
} => {
  const props = {
    onRestore: vi.fn(),
    onDelete: vi.fn(),
    onClearTrash: vi.fn(),
    onGoToDocs: vi.fn(),
  }
  render(<TrashView trash={trash} {...props} />)
  return props
}

beforeEach(() => {
  localStorage.clear()
})

describe('回收站空态：「去文档」出口', () => {
  it('回收站为空时给出「去文档」按钮，点击跳回文档视图', () => {
    const props = renderTrash([])
    expect(screen.getByText('回收站为空')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '去文档' }))
    expect(props.onGoToDocs).toHaveBeenCalledTimes(1)
  })

  it('空态说明保留保留期描述', () => {
    renderTrash([])
    expect(screen.getByText(/删除的文档会在这里显示/)).toBeInTheDocument()
  })
})

describe('回收站搜索无结果：统一文案 + 清除搜索出口', () => {
  it('标题「没有匹配的文档」、提示与其他视图同款，「清除搜索」回到全量列表', () => {
    renderTrash([makeTrashDoc()])
    fireEvent.change(screen.getByPlaceholderText('搜索回收站文档...'), { target: { value: '不存在的词' } })

    expect(screen.getByText('没有匹配的文档')).toBeInTheDocument()
    expect(screen.getByText('试试其他关键词或调整筛选条件')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))
    expect(screen.getByText('被删的文档')).toBeInTheDocument()
  })

  it('旧文案不再出现（搜索无结果全库统一为一种写法）', () => {
    renderTrash([makeTrashDoc()])
    fireEvent.change(screen.getByPlaceholderText('搜索回收站文档...'), { target: { value: 'zzz' } })

    expect(screen.queryByText('未找到匹配的文档')).toBeNull()
    // 精确匹配：整句已换成「试试其他关键词或调整筛选条件」
    expect(screen.queryByText('试试其他关键词')).toBeNull()
  })
})
