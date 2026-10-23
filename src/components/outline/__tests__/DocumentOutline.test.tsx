import { describe, it, expect, vi } from 'vitest'
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

  it('折叠单个节点只隐藏它自己的子项，不联动同级别节点', () => {
    // 旧实现按 level 记录折叠态，折叠一个 h2 会把全文所有 h2 的子项一起隐藏
    const content = '# H1\n## A\n### A1\n## B\n### B1'
    const { container } = render(
      <DocumentOutline
        content={content}
        onHeadingClick={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )

    const visible = (): (string | null)[] =>
      Array.from(container.querySelectorAll('.outline-item-text')).map((n) => n.textContent)
    // 默认全部展开
    expect(visible()).toEqual(['H1', 'A', 'A1', 'B', 'B1'])

    // 第 2 个展开按钮属于 h2「A」（第 1 个是 H1）
    const expandButtons = container.querySelectorAll('.outline-expand-btn')
    expect(expandButtons.length).toBe(3)
    fireEvent.click(expandButtons[1])

    expect(visible()).toEqual(['H1', 'A', 'B', 'B1'])
  })

  it('再次点击可恢复展开', () => {
    const content = '# H1\n## A\n### A1'
    const { container } = render(
      <DocumentOutline
        content={content}
        onHeadingClick={() => {}}
        isOpen={true}
        onClose={() => {}}
      />
    )

    const btn = container.querySelectorAll('.outline-expand-btn')[1]
    fireEvent.click(btn)
    expect(Array.from(container.querySelectorAll('.outline-item-text')).map((n) => n.textContent))
      .toEqual(['H1', 'A'])

    fireEvent.click(btn)
    expect(Array.from(container.querySelectorAll('.outline-item-text')).map((n) => n.textContent))
      .toEqual(['H1', 'A', 'A1'])
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