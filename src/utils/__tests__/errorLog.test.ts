import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  appendErrorLog,
  clearErrorLogs,
  formatErrorLogs,
  installGlobalErrorLogging,
  readErrorLogs,
} from '@/utils/errorLog'

describe('errorLog 读写', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('写入后可读回，并补齐时间戳', () => {
    appendErrorLog({ source: 'render', message: '炸了', stack: 'at x' })
    const logs = readErrorLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ source: 'render', message: '炸了', stack: 'at x' })
    expect(Number.isNaN(new Date(logs[0].timestamp).getTime())).toBe(false)
  })

  it('兼容早期只写了 error 字段的旧数据', () => {
    localStorage.setItem('error-logs', JSON.stringify([{ timestamp: '2026-01-01T00:00:00.000Z', error: '旧格式', stack: null }]))
    const logs = readErrorLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].message).toBe('旧格式')
    expect(logs[0].source).toBe('render')
  })

  it('损坏的存储内容不会抛错，返回空数组', () => {
    localStorage.setItem('error-logs', '{ not json')
    expect(readErrorLogs()).toEqual([])
  })

  it('最多保留 50 条（环形裁剪）', () => {
    for (let i = 0; i < 60; i++) appendErrorLog({ source: 'window', message: 'e' + i })
    const logs = readErrorLogs()
    expect(logs).toHaveLength(50)
    expect(logs[0].message).toBe('e10')
    expect(logs[49].message).toBe('e59')
  })

  it('清空后不再有记录', () => {
    appendErrorLog({ source: 'render', message: 'x' })
    clearErrorLogs()
    expect(readErrorLogs()).toEqual([])
  })

  it('格式化输出带来源标签与时间', () => {
    appendErrorLog({ source: 'promise', message: 'async 崩了' })
    const text = formatErrorLogs(readErrorLogs())
    expect(text).toContain('未处理的 Promise')
    expect(text).toContain('async 崩了')
    expect(formatErrorLogs([])).toBe('(没有错误记录)')
  })
})

describe('installGlobalErrorLogging', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('捕获未捕获错误与未处理的 Promise 拒绝', () => {
    const uninstall = installGlobalErrorLogging()

    window.dispatchEvent(new ErrorEvent('error', { message: 'window 崩了', error: new Error('window 崩了') }))

    const rejection = new Event('unhandledrejection') as Event & { reason?: unknown }
    rejection.reason = new Error('promise 崩了')
    window.dispatchEvent(rejection)

    const logs = readErrorLogs()
    expect(logs.map((l) => l.source)).toEqual(['window', 'promise'])
    expect(logs[0].message).toBe('window 崩了')
    expect(logs[1].message).toBe('promise 崩了')

    uninstall()
    window.dispatchEvent(new ErrorEvent('error', { message: '忽略我' }))
    expect(readErrorLogs()).toHaveLength(2)
  })

  it('记录日志失败时不抛错（存储不可用）', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => appendErrorLog({ source: 'render', message: 'x' })).not.toThrow()
    spy.mockRestore()
  })
})
