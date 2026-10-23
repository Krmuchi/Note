import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommentsPanel } from '@/components/comments/CommentsPanel'
import type { Comment } from '@/types'

const mockComments: Comment[] = [
  {
    id: 'c1',
    docId: 'doc1',
    author: 'Alice',
    content: 'First comment',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'c2',
    docId: 'doc1',
    author: 'Bob',
    content: 'Second comment',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
]

describe('CommentsPanel', () => {
  it('should not render when isOpen is false', () => {
    const { container } = render(
      <CommentsPanel
        comments={mockComments}
        docId="doc1"
        onAddComment={() => {}}
        onDeleteComment={() => {}}
        isOpen={false}
        onClose={() => {}}
      />
    )
    expect(container.querySelector('.comments-panel')).toBeNull()
  })

  it('should render when isOpen is true', () => {
    const { container } = render(
      <CommentsPanel
        comments={mockComments}
        docId="doc1"
        onAddComment={() => {}}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )
    expect(container.querySelector('.comments-panel')).not.toBeNull()
  })

  it('should display comments count in header', () => {
    render(
      <CommentsPanel
        comments={mockComments}
        docId="doc1"
        onAddComment={() => {}}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )
    expect(screen.getByText(/评论 \(2\)/)).not.toBeNull()
  })

  it('should display comment content', () => {
    render(
      <CommentsPanel
        comments={mockComments}
        docId="doc1"
        onAddComment={() => {}}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )
    expect(screen.getByText('First comment')).not.toBeNull()
    expect(screen.getByText('Second comment')).not.toBeNull()
  })

  it('should display author names', () => {
    render(
      <CommentsPanel
        comments={mockComments}
        docId="doc1"
        onAddComment={() => {}}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )
    expect(screen.getByText('Alice')).not.toBeNull()
    expect(screen.getByText('Bob')).not.toBeNull()
  })

  it('should show empty state when no comments', () => {
    render(
      <CommentsPanel
        comments={[]}
        docId="doc1"
        onAddComment={() => {}}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )
    expect(screen.getByText('暂无评论')).not.toBeNull()
    // 空态改为统一 EmptyState 组件（V1 四态一致性），说明文案随之更新
    expect(screen.getByText(/选中正文中的文字可以就某段内容评论/)).not.toBeNull()
  })

  it('should call onDeleteComment when delete button is clicked', () => {
    const handleDelete = vi.fn()
    render(
      <CommentsPanel
        comments={mockComments}
        docId="doc1"
        onAddComment={() => {}}
        onDeleteComment={handleDelete}
        isOpen={true}
        onClose={() => {}}
      />
    )

    const deleteButtons = screen.getAllByText('删除')
    fireEvent.click(deleteButtons[0])

    expect(handleDelete).toHaveBeenCalledTimes(1)
    expect(handleDelete).toHaveBeenCalledWith('doc1', 'c1')
  })

  it('should call onAddComment when form is submitted', () => {
    const handleAdd = vi.fn()
    render(
      <CommentsPanel
        comments={[]}
        docId="doc1"
        onAddComment={handleAdd}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )

    const textarea = screen.getByPlaceholderText('写下你的评论...')
    fireEvent.change(textarea, { target: { value: 'New comment' } })

    const submitBtn = screen.getByText('发表评论')
    fireEvent.click(submitBtn)

    expect(handleAdd).toHaveBeenCalledTimes(1)
    expect(handleAdd).toHaveBeenCalledWith('doc1', 'New comment')
  })

  it('should not submit empty comment', () => {
    const handleAdd = vi.fn()
    render(
      <CommentsPanel
        comments={[]}
        docId="doc1"
        onAddComment={handleAdd}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )

    const submitBtn = screen.getByText('发表评论')
    fireEvent.click(submitBtn)

    expect(handleAdd).not.toHaveBeenCalled()
  })

  it('should call onClose when close button is clicked', () => {
    const handleClose = vi.fn()
    render(
      <CommentsPanel
        comments={[]}
        docId="doc1"
        onAddComment={() => {}}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={handleClose}
      />
    )

    const closeBtn = screen.getByText('✕')
    fireEvent.click(closeBtn)

    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('should format relative dates correctly', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString()
    const comments: Comment[] = [
      {
        id: 'c1',
        docId: 'doc1',
        author: 'Test',
        content: 'Yesterday comment',
        createdAt: yesterday,
      },
    ]

    render(
      <CommentsPanel
        comments={comments}
        docId="doc1"
        onAddComment={() => {}}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )

    expect(screen.getByText('昨天')).not.toBeNull()
  })
})

describe('划词评论（锚点）', () => {
  const docContent = '第一段内容。\n第二段里有关键词。'

  it('有选区时把锚点作为第三个参数传给 onAddComment', () => {
    const handleAdd = vi.fn()
    render(
      <CommentsPanel
        comments={[]}
        docId="doc1"
        onAddComment={handleAdd}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={() => {}}
        pendingAnchor={{ start: 0, end: 5, quote: '第一段内容' }}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('针对选中内容写评论…'), {
      target: { value: '这条针对选中内容' },
    })
    fireEvent.click(screen.getByText('发表评论'))

    expect(handleAdd).toHaveBeenCalledWith('doc1', '这条针对选中内容', {
      start: 0,
      end: 5,
      quote: '第一段内容',
    })
  })

  it('提交后清掉待评论选区（下一条评论不该粘同一个锚点）', () => {
    const handleCancel = vi.fn()
    render(
      <CommentsPanel
        comments={[]}
        docId="doc1"
        onAddComment={() => {}}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={() => {}}
        pendingAnchor={{ start: 0, end: 5, quote: '第一段内容' }}
        onCancelPendingAnchor={handleCancel}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('针对选中内容写评论…'), {
      target: { value: 'x' },
    })
    fireEvent.click(screen.getByText('发表评论'))

    expect(handleCancel).toHaveBeenCalled()
  })

  it('已有评论的锚点显示为可点击的引用片段', () => {
    const onJump = vi.fn()
    const comments: Comment[] = [
      {
        id: 'c-anchor',
        docId: 'doc1',
        author: '我',
        content: '针对这段的评论',
        createdAt: new Date().toISOString(),
        anchor: { start: 0, end: 5, quote: '第一段内容' },
      },
    ]

    render(
      <CommentsPanel
        comments={comments}
        docId="doc1"
        onAddComment={() => {}}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={() => {}}
        docContent={docContent}
        onJumpToAnchor={onJump}
      />
    )

    const quote = screen.getByText('第一段内容')
    fireEvent.click(quote)
    expect(onJump).toHaveBeenCalledWith(0, 5)
  })

  it('锚点原文已不存在时不显示引用（退化为文档级评论）', () => {
    const comments: Comment[] = [
      {
        id: 'c-lost',
        docId: 'doc1',
        author: '我',
        content: '评论',
        createdAt: new Date().toISOString(),
        anchor: { start: 0, end: 5, quote: '已经被删除的原文' },
      },
    ]

    render(
      <CommentsPanel
        comments={comments}
        docId="doc1"
        onAddComment={() => {}}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={() => {}}
        docContent={docContent}
      />
    )

    expect(screen.queryByText('已经被删除的原文')).toBeNull()
    // 评论本身仍然可见
    expect(screen.getByText('评论')).not.toBeNull()
  })
})