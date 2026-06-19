import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocumentOutline } from '@/components/outline/DocumentOutline'

describe('DocumentOutline', () => {
  const mockContent = `# Heading 1

Some text here

## Heading 2

More text

### Heading 3

Even more text

# Another Heading 1

## Another Heading 2`

  it('should not render when isOpen is false', () => {
    const { container } = render(
      <DocumentOutline
        content={mockContent}
        onHeadingClick={() => {}}
        isOpen={false}
        onClose={() => {}}
      />
    )
    expect(container.querySelector('.outline-panel')).toBeNull()
  })

  it('should render when isOpen is true', () => {
    const { container } = render(
      <DocumentOutline
        content={mockContent}
        onHeadingClick={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )
    expect(container.querySelector('.outline-panel')).not.toBeNull()
  })

  it('should extract headings from content', () => {
    render(
      <DocumentOutline
        content={mockContent}
        onHeadingClick={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )

    const buttons = screen.getAllByRole('button', { name: /heading/i })
    expect(buttons.length).toBe(5)
  })

  it('should show empty state when no headings', () => {
    render(
      <DocumentOutline
        content="No headings here"
        onHeadingClick={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )

    expect(screen.getByText('暂无标题')).not.toBeNull()
  })

  it('should call onHeadingClick when a heading is clicked', () => {
    const handleClick = vi.fn()
    render(
      <DocumentOutline
        content="# Clickable Heading"
        onHeadingClick={handleClick}
        isOpen={true}
        onClose={() => {}}
      />
    )

    const button = screen.getByRole('button', { name: /clickable heading/i })
    fireEvent.click(button)

    expect(handleClick).toHaveBeenCalledTimes(1)
    expect(handleClick).toHaveBeenCalledWith(0)
  })

  it('should call onClose when close button is clicked', () => {
    const handleClose = vi.fn()
    render(
      <DocumentOutline
        content="# Test"
        onHeadingClick={() => {}}
        isOpen={true}
        onClose={handleClose}
      />
    )

    const closeBtn = screen.getByText('✕')
    fireEvent.click(closeBtn)

    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('should apply correct heading level classes', () => {
    const content = '# H1\n## H2\n### H3'
    const { container } = render(
      <DocumentOutline
        content={content}
        onHeadingClick={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )

    const items = container.querySelectorAll('.outline-item')
    expect(items.length).toBe(3)
    expect(items[0].classList.contains('heading-level-1')).toBe(true)
    expect(items[1].classList.contains('heading-level-2')).toBe(true)
    expect(items[2].classList.contains('heading-level-3')).toBe(true)
  })
})