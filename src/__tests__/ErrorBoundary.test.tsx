import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from '@/ErrorBoundary'

/**
 * P2-12：崩溃页渲染在 ToastContainer 之外（Toast 挂在 App 内部，出错时已被替换掉），
 * 复制结果只能就地反馈 —— 否则点「复制错误信息」毫无反应，用户会反复点、或以为没复制上。
 */

function Boom(): never {
  throw new Error('渲染炸了')
}

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary · 复制反馈（P2-12）', () => {
  it('复制成功后按钮就地变成「✓ 已复制」', async () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    const button = screen.getByRole('button', { name: '复制错误信息' })
    fireEvent.click(button)

    await screen.findByRole('button', { name: '✓ 已复制' })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain('渲染炸了')
  })

  it('复制失败时给出可执行的替代做法，而不是默默无反应', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    fireEvent.click(screen.getByRole('button', { name: '复制错误信息' }))

    await screen.findByRole('button', { name: '复制失败：请展开「错误详情」手动选择' })
  })

  it('错误详情仍可展开，其它出口（重试 / 重新加载）保留', () => {
    const { container } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByText('应用出错了')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument()
    expect(container.querySelector('.error-boundary-details')).toBeTruthy()
  })
})
