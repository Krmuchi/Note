import { describe, it, expect, vi, beforeEach } from 'vitest'
import { debounce } from '@/utils/debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('should call the function after the specified delay', () => {
    const func = vi.fn()
    const debouncedFunc = debounce(func, 300)

    debouncedFunc('test')
    expect(func).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(func).toHaveBeenCalledTimes(1)
    expect(func).toHaveBeenCalledWith('test')
  })

  it('should only call the last invocation when called multiple times', () => {
    const func = vi.fn()
    const debouncedFunc = debounce(func, 300)

    debouncedFunc('first')
    debouncedFunc('second')
    debouncedFunc('third')

    vi.advanceTimersByTime(300)
    expect(func).toHaveBeenCalledTimes(1)
    expect(func).toHaveBeenCalledWith('third')
  })

  it('should reset the timer on each call', () => {
    const func = vi.fn()
    const debouncedFunc = debounce(func, 300)

    debouncedFunc('first')
    vi.advanceTimersByTime(200)
    debouncedFunc('second')
    vi.advanceTimersByTime(200)

    expect(func).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(func).toHaveBeenCalledTimes(1)
    expect(func).toHaveBeenCalledWith('second')
  })

  it('should handle multiple arguments', () => {
    const func = vi.fn()
    const debouncedFunc = debounce(func, 100)

    debouncedFunc('a', 'b', 'c')
    vi.advanceTimersByTime(100)

    expect(func).toHaveBeenCalledWith('a', 'b', 'c')
  })

  it('should work with zero delay', () => {
    const func = vi.fn()
    const debouncedFunc = debounce(func, 0)

    debouncedFunc()
    vi.advanceTimersByTime(0)

    expect(func).toHaveBeenCalledTimes(1)
  })
})