import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

/**
 * P1-9：AI 生成完成 / 失败时的系统通知。
 *
 * 面板是浮层，用户常在等待期间切走窗口 —— 没有通知就只能回来干等。
 * 是否真的弹由主进程按「后台通知」设置判定，渲染层只负责**在状态跃迁时发起一次**。
 */
const stream = vi.hoisted(() => ({
  status: 'idle' as string,
  text: '',
  title: '',
  error: null as { code: string; message: string } | null,
  model: 'test-model',
  cached: false,
  elapsedMs: 0,
  isStreaming: false,
  run: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
}))

vi.mock('@/hooks/useAiTaskStream', () => ({
  useAiTaskStream: () => stream,
}))

const notifyMock = vi.hoisted(() => vi.fn())
vi.mock('@/services/storage', () => ({
  notify: notifyMock,
}))

import { useAiWriter } from '@/hooks/useAiWriter'

beforeEach(() => {
  stream.status = 'idle'
  stream.text = ''
  stream.title = ''
  stream.error = null
  stream.isStreaming = false
  notifyMock.mockClear()
})

describe('useAiWriter 后台通知（P1-9）', () => {
  it('生成完成时发起通知（带标题与内容摘要）', () => {
    const { rerender } = renderHook(() => useAiWriter(true))

    stream.status = 'done'
    stream.title = '季度总结'
    stream.text = '这是生成出来的正文内容，足够长，会被截断成摘要。'
    rerender()

    expect(notifyMock).toHaveBeenCalledTimes(1)
    const payload = notifyMock.mock.calls[0][0] as { title: string; body: string }
    expect(payload.title).toBe('AI 生成完成')
    expect(payload.body).toContain('季度总结')
    expect(payload.body.length).toBeLessThanOrEqual(80)
  })

  it('失败时发起通知（带错误原因）', () => {
    const { rerender } = renderHook(() => useAiWriter(true))

    stream.status = 'error'
    stream.error = { code: 'AI_ERR_TIMEOUT', message: '请求超时' }
    rerender()

    expect(notifyMock).toHaveBeenCalledTimes(1)
    const payload = notifyMock.mock.calls[0][0] as { title: string; body: string }
    expect(payload.title).toBe('AI 生成失败')
    expect(payload.body).toContain('请求超时')
  })

  it('同一状态只通知一次（流式期间不重复骚扰）', () => {
    const { rerender } = renderHook(() => useAiWriter(true))

    stream.status = 'done'
    stream.text = '第一版'
    rerender()
    // 流式/完成态下的内容变化不应再发第二条
    stream.text = '第一版（追加了更多字）'
    rerender()
    rerender()

    expect(notifyMock).toHaveBeenCalledTimes(1)
  })

  it('用户取消（回到 idle）不发通知', () => {
    const { rerender } = renderHook(() => useAiWriter(true))
    stream.status = 'done'
    stream.text = '完成'
    rerender()
    notifyMock.mockClear()

    stream.status = 'idle'
    stream.text = ''
    rerender()
    expect(notifyMock).not.toHaveBeenCalled()
  })
})
