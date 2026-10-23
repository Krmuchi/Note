import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SESSION_ACTIVE, beginSession, endSession } from '@/utils/sessionGuard'

describe('sessionGuard', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('首次启动不算异常退出，并标记为运行中', () => {
    expect(beginSession()).toBe(false)
    expect(localStorage.getItem('notes-session-active')).toBe(SESSION_ACTIVE)
  })

  it('上次没有正常退出时返回 true', () => {
    beginSession() // 模拟上次启动
    // 没有调用 endSession —— 相当于进程被杀
    expect(beginSession()).toBe(true)
  })

  it('正常退出后再启动不算异常', () => {
    beginSession()
    endSession()
    expect(beginSession()).toBe(false)
  })

  it('存储不可用时按正常退出处理，不反复告警', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    expect(beginSession()).toBe(false)
    getSpy.mockRestore()

    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    expect(() => endSession()).not.toThrow()
    setSpy.mockRestore()
  })
})
