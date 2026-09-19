import { describe, it, expect, vi } from 'vitest'
import {
  MAX_DELAY_MS,
  MAX_RETRY_AFTER_MS,
  computeDelay,
  parseRetryAfter,
  withRetry,
} from '../../electron/ai/retry.cjs'

describe('computeDelay - 指数退避 + 抖动', () => {
  it('无抖动时按 500 * 2^(n-1) 递增', () => {
    expect(computeDelay(1, () => 0)).toBe(500)
    expect(computeDelay(2, () => 0)).toBe(1000)
    expect(computeDelay(3, () => 0)).toBe(2000)
  })

  it('被 MAX_DELAY_MS 封顶', () => {
    expect(computeDelay(10, () => 0)).toBe(MAX_DELAY_MS)
    expect(computeDelay(50, () => 1)).toBe(Math.round(MAX_DELAY_MS * 1.3))
  })

  it('抖动落在 [0, 30%] 区间内', () => {
    const min = computeDelay(1, () => 0)
    const max = computeDelay(1, () => 1)
    expect(min).toBe(500)
    expect(max).toBe(650)
    const mid = computeDelay(1, () => 0.5)
    expect(mid).toBeGreaterThanOrEqual(min)
    expect(mid).toBeLessThanOrEqual(max)
  })
})

describe('parseRetryAfter - Retry-After 响应头解析', () => {
  const now = (): number => Date.parse('2026-01-01T00:00:00Z')

  it('数字秒', () => {
    expect(parseRetryAfter('3', now)).toBe(3000)
    expect(parseRetryAfter(2, now)).toBe(2000)
    expect(parseRetryAfter('0.5', now)).toBe(500)
  })

  it('HTTP-date 形式按当前时间换算', () => {
    expect(parseRetryAfter('2026-01-01T00:00:10Z', now)).toBe(10000)
  })

  it('非法值返回 null 以便回退指数退避', () => {
    expect(parseRetryAfter('soon', now)).toBeNull()
    expect(parseRetryAfter('', now)).toBeNull()
    expect(parseRetryAfter(undefined, now)).toBeNull()
    expect(parseRetryAfter(null, now)).toBeNull()
  })

  it('超过 30 秒被 clamp', () => {
    expect(parseRetryAfter('999', now)).toBe(MAX_RETRY_AFTER_MS)
    expect(parseRetryAfter('2026-01-01T01:00:00Z', now)).toBe(MAX_RETRY_AFTER_MS)
  })

  it('已过期的时间点归零', () => {
    expect(parseRetryAfter('2025-12-31T23:59:00Z', now)).toBe(0)
  })
})

describe('withRetry - 重试编排', () => {
  it('连续失败到 maxAttempts 后抛出（含首次共 3 次）', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const run = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(
      withRetry(run, { maxAttempts: 3, classify: () => ({ retryable: true }), sleep }),
    ).rejects.toThrow('boom')
    expect(run).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('首次即成功时不重试', async () => {
    const run = vi.fn().mockResolvedValue('ok')
    await expect(withRetry(run, { classify: () => ({ retryable: true }) })).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('错误不可重试时立即抛出', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const run = vi.fn().mockRejectedValue(new Error('auth'))
    await expect(
      withRetry(run, { maxAttempts: 3, classify: () => ({ retryable: false }), sleep }),
    ).rejects.toThrow('auth')
    expect(run).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('canRetry 返回 false 时立即放弃（已推送过流式 chunk 的场景）', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const run = vi.fn().mockRejectedValue(new Error('mid-stream'))
    const canRetry = vi.fn().mockReturnValue(false)
    await expect(
      withRetry(run, { maxAttempts: 3, classify: () => ({ retryable: true }), canRetry, sleep }),
    ).rejects.toThrow('mid-stream')
    expect(run).toHaveBeenCalledTimes(1)
    expect(canRetry).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('onRetry 回传下次尝试序号与延迟', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const onRetry = vi.fn()
    const run = vi.fn().mockRejectedValueOnce(new Error('e1')).mockResolvedValue('ok')
    await expect(
      withRetry(run, { maxAttempts: 3, classify: () => ({ retryable: true }), onRetry, sleep }),
    ).resolves.toBe('ok')
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry.mock.calls[0][0]).toBe(2)
    expect(onRetry.mock.calls[0][1]).toBeGreaterThan(0)
  })

  it('retryAfterMs 优先于指数退避', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const run = vi.fn().mockRejectedValueOnce(new Error('429')).mockResolvedValue('ok')
    await withRetry(run, {
      maxAttempts: 3,
      classify: () => ({ retryable: true }),
      retryAfterMs: () => 7000,
      sleep,
    })
    expect(sleep).toHaveBeenCalledWith(7000)
  })

  it('retryAfterMs 返回 null 时回退指数退避', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const run = vi.fn().mockRejectedValueOnce(new Error('e')).mockResolvedValue('ok')
    await withRetry(run, {
      maxAttempts: 3,
      classify: () => ({ retryable: true }),
      retryAfterMs: () => null,
      sleep,
    })
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(500)
  })
})