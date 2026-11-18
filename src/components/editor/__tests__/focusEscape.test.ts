import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  armFocusEscape,
  consumeFocusEscape,
  resetFocusEscape,
  resetFocusEscapeForTest,
} from '@/components/editor/focusEscape'

/**
 * P1-8：编辑器 Tab 逃生通道的纯逻辑。
 *
 * 为什么单独测：这是一次性的、带超时的开关 —— 
 * "用完即失效"与"超时失效"两条缺一条，都会让 Tab 的语义在用户不知情时改变。
 */
describe('focusEscape（P1-8 Tab 逃生）', () => {
  beforeEach(() => {
    resetFocusEscapeForTest()
    // Date 必须一并伪造：超时判断用的是 Date.now()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    resetFocusEscapeForTest()
  })

  it('未武装时 Tab 不放行（保持缩进语义）', () => {
    expect(consumeFocusEscape()).toBe(false)
  })

  it('Esc 武装后第一个 Tab 放行，并且一次性消费', () => {
    expect(armFocusEscape()).toBe(true)
    expect(consumeFocusEscape()).toBe(true)
    // 第二次必须是 false：逃生只针对紧随其后的那一个 Tab
    expect(consumeFocusEscape()).toBe(false)
  })

  it('超过 1.5 秒的武装自动失效', () => {
    armFocusEscape()
    vi.advanceTimersByTime(1600)
    expect(consumeFocusEscape()).toBe(false)
  })

  it('窗口期内的 Tab 仍然放行', () => {
    armFocusEscape()
    vi.advanceTimersByTime(1400)
    expect(consumeFocusEscape()).toBe(true)
  })

  it('提示只在本会话第一次武装时出现（返回 true）', () => {
    expect(armFocusEscape()).toBe(true)
    consumeFocusEscape()
    expect(armFocusEscape()).toBe(false)
    expect(armFocusEscape()).toBe(false)
  })

  it('继续输入会解除武装，避免影响很久之后的 Tab', () => {
    armFocusEscape()
    resetFocusEscape()
    expect(consumeFocusEscape()).toBe(false)
  })
})
