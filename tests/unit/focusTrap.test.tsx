import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

function Dialog({ onEscape }: { onEscape?: () => void }): React.JSX.Element {
  const ref = useFocusTrap<HTMLDivElement>(true, onEscape)
  return (
    <div ref={ref} role="dialog">
      <button>第一</button>
      <button>第二</button>
    </div>
  )
}

describe('useFocusTrap（P1-2 初始焦点 + Esc）', () => {
  it('打开时焦点即移入容器内第一个可聚焦元素（否则首次 Tab 逃出陷阱）', () => {
    render(<Dialog />)
    expect(document.activeElement).toBe(screen.getByText('第一'))
  })

  it('容器内按 Esc 调用 onEscape', () => {
    const onEscape = vi.fn()
    render(<Dialog onEscape={onEscape} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('未提供 onEscape 时不误伤（Esc 不做任何事）', () => {
    render(<Dialog />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    // 无异常即通过
  })

  it('Tab 在末元素上循环回首元素', () => {
    render(<Dialog />)
    screen.getByText('第二').focus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByText('第一'))
  })
});
