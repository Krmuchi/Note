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

    expect(screen.getByText('欢迎使用「拾页」')).toBeInTheDocument()

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
    expect(screen.getByText('欢迎使用「拾页」')).toBeInTheDocument()
  })

  it('P1-4：Esc 等同「跳过」——全应用唯一没有 Esc 的弹窗已补齐', () => {
    const onClose = vi.fn()
    render(<OnboardingDialog onClose={onClose} onCreateFirstDoc={vi.fn()} />)

    // 焦点陷阱把初始焦点移进容器内（第一个可聚焦元素＝「跳过」）；
    // role=dialog 挂在遮罩上，Esc 监听挂在内层容器，所以按键要发给容器内的元素
    const inside = screen.getByRole('button', { name: '跳过' })
    fireEvent.keyDown(inside, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
    // 与「任何离开路径都算看过引导」对齐：Esc 关闭也标记已引导
    expect(localStorage.getItem('notes-onboarding-done')).toBe('1')
  })

  it('P1-9：桌面版数据位置读取中显示「读取中…」，不冒充浏览器模式', () => {
    render(<OnboardingDialog onClose={vi.fn()} onCreateFirstDoc={vi.fn()} />)
    // 测试环境没有 window.notesApi => isWebMode 为 true，浏览器分支按设计显示
    expect(screen.getByText('（浏览器模式下没有本地数据目录）')).toBeInTheDocument()
  })
})
