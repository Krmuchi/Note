import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useToast, toast } from '@/components/common/Toast'
import { ToastContainer } from '@/components/common/ToastView'

/**
 * Toast 队列与播报分级契约。
 * 错误提示必须走 role=alert（assertive）播报；同文案 3 秒内去重、队列上限 5 条，
 * 避免批量操作 / 连点把提示刷成一整屏。
 */

function Harness(): React.JSX.Element {
  const { toasts, removeToast } = useToast()
  return <ToastContainer toasts={toasts} onClose={removeToast} />
}

/**
 * toast.* 是模块级单例 store，在 React 事件处理器之外调用。
 * 必须包在 act() 里，否则 React 不会在断言前 flush 这次更新，
 * DOM 里什么都查不到（此前 4 个用例就是因此失败）。
 */
function emit(fn: () => void): void {
  act(() => {
    fn()
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('Toast 播报分级', () => {
  it('error 走 role=alert 容器，其余走 role=status', () => {
    render(<Harness />)
    emit(() => {
      toast.success('成功提示')
      toast.error('错误提示')
    })

    const polite = document.querySelector('[role="status"]')!
    const assertive = document.querySelector('[role="alert"]')!
    expect(assertive.getAttribute('aria-live')).toBe('assertive')
    expect(polite.getAttribute('aria-live')).toBe('polite')
    expect(assertive.textContent).toContain('错误提示')
    expect(assertive.textContent).not.toContain('成功提示')
    expect(polite.textContent).toContain('成功提示')
    expect(polite.textContent).not.toContain('错误提示')
  })
})

describe('Toast 队列', () => {
  it('同 type + message 3 秒内只弹一次', () => {
    render(<Harness />)
    emit(() => {
      toast.info('正在导入…')
      toast.info('正在导入…')
      toast.info('正在导入…')
    })

    expect(screen.getAllByText('正在导入…')).toHaveLength(1)
  })

  it('不同文案不受去重影响', () => {
    render(<Harness />)
    emit(() => {
      toast.info('第一条提示')
      toast.info('第二条提示')
    })

    expect(screen.getByText('第一条提示')).toBeTruthy()
    expect(screen.getByText('第二条提示')).toBeTruthy()
  })

  it('队列上限 5 条，超出丢弃最旧', () => {
    render(<Harness />)
    const messages = ['提示-1', '提示-2', '提示-3', '提示-4', '提示-5', '提示-6']
    emit(() => {
      messages.forEach((message) => toast.info(message))
    })

    expect(screen.queryByText('提示-1')).toBeNull()
    expect(screen.getByText('提示-6')).toBeTruthy()
    expect(document.querySelectorAll('.toast')).toHaveLength(5)
  })
})
