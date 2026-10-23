import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OnboardingDialog from '@/components/onboarding/OnboardingDialog'

describe('OnboardingDialog', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('三步导航可走通，并在最后一步创建第一篇文档', () => {
    const onClose = vi.fn()
    const onCreateFirstDoc = vi.fn()
    render(<OnboardingDialog onClose={onClose} onCreateFirstDoc={onCreateFirstDoc} />)

    expect(screen.getByText('欢迎使用「笔记」')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByText('有现成的笔记吗？')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    const input = screen.getByLabelText('文档标题') as HTMLInputElement
    fireEvent.change(input, { target: { value: '第一篇笔记' } })
    fireEvent.click(screen.getByRole('button', { name: '创建并开始写作' }))

    expect(onCreateFirstDoc).toHaveBeenCalledWith('第一篇笔记')
  })

  it('标题为空时禁用创建按钮', () => {
    render(<OnboardingDialog onClose={vi.fn()} onCreateFirstDoc={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    fireEvent.change(screen.getByLabelText('文档标题'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: '创建并开始写作' })).toBeDisabled()
  })

  it('跳过会标记已引导并关闭', () => {
    const onClose = vi.fn()
    render(<OnboardingDialog onClose={onClose} onCreateFirstDoc={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '跳过' }))
    expect(onClose).toHaveBeenCalled()
    expect(localStorage.getItem('notes-onboarding-done')).toBe('1')
  })

  it('可以返回上一步', () => {
    render(<OnboardingDialog onClose={vi.fn()} onCreateFirstDoc={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    fireEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByText('欢迎使用「笔记」')).toBeInTheDocument()
  })
})
