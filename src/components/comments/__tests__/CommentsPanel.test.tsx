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
    expect(screen.getByText('发表第一条评论吧')).not.toBeNull()
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

  it('should render anchored quote when comment has quote field', () => {
    const comments: Comment[] = [
      {
        id: 'c1',
        docId: 'doc1',
        author: 'Alice',
        content: 'Anchored comment',
        createdAt: new Date().toISOString(),
        quote: '被选中的文本',
        anchorStart: 10,
        anchorEnd: 16,
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

    expect(screen.getByText('“被选中的文本”')).not.toBeNull()
  })

  it('should show pending quote hint when pendingQuote is provided', () => {
    render(
      <CommentsPanel
        comments={[]}
        docId="doc1"
        onAddComment={() => {}}
        onDeleteComment={() => {}}
        isOpen={true}
        onClose={() => {}}
        pendingQuote="将评论的选中文本"
      />
    )

    expect(screen.getByText(/将关联选中文本/)).not.toBeNull()
    expect(screen.getByText('“将评论的选中文本”')).not.toBeNull()
  })
})