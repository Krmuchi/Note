import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import AiWriter from '@/components/ai/AiWriter'
import AiSelectionMenu from '@/components/ai/AiSelectionMenu'
import { aiClient } from '@/services/ai/aiClient'
import type { StreamHandlers } from '@/types/ai'
import { uiActions, getUIState } from '@/hooks/useUIState'

/** 让 aiClient.stream 立即以指定错误结算，驱动组件进入 error 态 */
function mockStreamError(code: string): void {
  vi.spyOn(aiClient, 'stream').mockImplementation((_task, handlers: StreamHandlers) => {
    const error = { code, message: '错误文案', retryable: false } as Parameters<
      StreamHandlers['onError']
    >[0]
    handlers.onError(error)
    return { requestId: 'req-test1234', cancel: vi.fn(), done: Promise.resolve({ ok: false, error }) }
  })
}

beforeEach(() => {
  uiActions.reset()
  vi.restoreAllMocks()
})

describe('AiWriter - 配置类错误的「去设置」（缺陷7）', () => {
  it('NOT_CONFIGURED 时显示「去设置」，点击打开设置并定位 AI 页签', () => {
    mockStreamError('AI_ERR_NOT_CONFIGURED')
    render(<AiWriter isOpen onClose={vi.fn()} onInsert={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText(/请输入你想写的主题/), {
      target: { value: '测试主题' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始生成' }))

    const goSettings = screen.getByRole('button', { name: '去设置' })
    fireEvent.click(goSettings)
    expect(getUIState().showSettings).toBe(true)
    expect(getUIState().settingsTab).toBe('ai')
  })

  it('可重试错误（NETWORK）不显示「去设置」，而是重试按钮', () => {
    vi.spyOn(aiClient, 'stream').mockImplementation((_task, handlers: StreamHandlers) => {
      const error = { code: 'AI_ERR_NETWORK', message: '网络失败', retryable: true } as Parameters<
        StreamHandlers['onError']
      >[0]
      handlers.onError(error)
      return { requestId: 'req-test1234', cancel: vi.fn(), done: Promise.resolve({ ok: false, error }) }
    })
    render(<AiWriter isOpen onClose={vi.fn()} onInsert={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/请输入你想写的主题/), {
      target: { value: '测试主题' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始生成' }))

    expect(screen.queryByRole('button', { name: '去设置' })).toBeNull()
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })
})

describe('AiSelectionMenu - 配置类错误的「去设置」（缺陷7）', () => {
  const selection = { start: 0, end: 4, text: '原文内容' }
  const position = { top: 100, left: 100 }

  it('AUTH 时显示「去设置」，点击打开 AI 设置并关闭浮层', () => {
    mockStreamError('AI_ERR_AUTH')
    const onClose = vi.fn()
    render(
      <AiSelectionMenu selection={selection} position={position} onApply={vi.fn()} onClose={onClose} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /润色/ }))
    const goSettings = screen.getByRole('button', { name: '去设置' })
    fireEvent.click(goSettings)

    expect(getUIState().showSettings).toBe(true)
    expect(getUIState().settingsTab).toBe('ai')
    expect(onClose).toHaveBeenCalled()
  })
})
