import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { copyToClipboard, copyWithFeedback } from '@/utils/clipboard'
import { subscribeToast } from '@/services/toast'
import type { ToastMessage } from '@/services/toast'

/**
 * 「复制假成功」修复的回归。
 *
 * 旧实现的 4 处调用点不判断 copyToClipboard 的返回值就无条件 toast.success，
 * 复制失败时用户收到假成功提示、剪贴板里却什么都没有。
 * copyWithFeedback 必须按真实结果给中文反馈：成功才提示成功，失败必须提示失败。
 */

const captured: ToastMessage[] = []
let unsubscribe: () => void = () => {}

/** 强制走 execCommand 回退路径，复制结果由测试逐例控制（jsdom 默认两条路径都不可用） */
const stubExecCommand = (impl: () => boolean): void => {
  document.execCommand = vi.fn(impl) as unknown as typeof document.execCommand
}

beforeEach(() => {
  captured.length = 0
  unsubscribe = subscribeToast((m) => {
    captured.push(m)
    return 'test-id'
  })
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
})

afterEach(() => {
  unsubscribe()
})

describe('copyToClipboard：按真实结果返回', () => {
  it('execCommand 成功返回 true', async () => {
    stubExecCommand(() => true)
    expect(await copyToClipboard('你好')).toBe(true)
  })

  it('execCommand 失败返回 false（而不是抛错）', async () => {
    stubExecCommand(() => false)
    expect(await copyToClipboard('你好')).toBe(false)
  })

  it('execCommand 不可用（抛异常）返回 false', async () => {
    document.execCommand = vi.fn(() => {
      throw new Error('not implemented')
    }) as unknown as typeof document.execCommand
    expect(await copyToClipboard('你好')).toBe(false)
  })
})

describe('copyWithFeedback：成功/失败各自给正确中文反馈', () => {
  it('成功：success toast 用定制文案，返回 true', async () => {
    stubExecCommand(() => true)
    const ok = await copyWithFeedback('诊断内容', '诊断信息已复制')
    expect(ok).toBe(true)
    expect(captured).toHaveLength(1)
    expect(captured[0]).toMatchObject({ type: 'success', message: '诊断信息已复制' })
  })

  it('成功但未指定文案：使用默认「已复制到剪贴板」', async () => {
    stubExecCommand(() => true)
    await copyWithFeedback('你好')
    expect(captured[0]).toMatchObject({ type: 'success', message: '已复制到剪贴板' })
  })

  it('失败：error toast 提示复制失败，绝不出现成功文案（假成功回归）', async () => {
    stubExecCommand(() => false)
    const ok = await copyWithFeedback('诊断内容', '诊断信息已复制')
    expect(ok).toBe(false)
    expect(captured).toHaveLength(1)
    expect(captured[0].type).toBe('error')
    expect(captured[0].message).toContain('复制失败')
    // 旧实现会把成功文案原样弹出来 —— 这是最关键的回归断言
    expect(captured.some((m) => m.message === '诊断信息已复制')).toBe(false)
  })

  it('execCommand 抛异常同样按失败反馈', async () => {
    document.execCommand = vi.fn(() => {
      throw new Error('not implemented')
    }) as unknown as typeof document.execCommand
    const ok = await copyWithFeedback('内容')
    expect(ok).toBe(false)
    expect(captured[0]).toMatchObject({ type: 'error' })
  })
})
