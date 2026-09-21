import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cancelAllStreams,
  createRequestId,
  getActiveStreamCount,
  openStreamSession,
} from '@/services/ai/stream'
import type { AiStreamEvent } from '@/types/ai'

type StreamListener = (event: AiStreamEvent) => void

let listeners: Map<string, StreamListener>

function installApi(): void {
  listeners = new Map()
  const api = {
    aiStreamSubscribe: vi.fn((requestId: string, onEvent: StreamListener) => {
      listeners.set(requestId, onEvent)
      return () => {
        listeners.delete(requestId)
      }
    }),
    aiStreamUnsubscribe: vi.fn((requestId: string) => {
      listeners.delete(requestId)
    }),
    aiCancel: vi.fn(async () => ({ ok: true, cancelled: true })),
  }
  Object.defineProperty(window, 'notesApi', { value: api, configurable: true, writable: true })
}

function emit(requestId: string, event: AiStreamEvent): void {
  listeners.get(requestId)?.(event)
}

function makeHandlers() {
  return {
    onDelta: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onMeta: vi.fn(),
  }
}

const flushFrame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 32))

beforeEach(() => {
  installApi()
})

afterEach(() => {
  cancelAllStreams()
  Object.defineProperty(window, 'notesApi', { value: undefined, configurable: true, writable: true })
})

describe('createRequestId', () => {
  it('产出符合主进程校验规则的 id（8-64 位字母数字下划线连字符）', () => {
    for (let i = 0; i < 20; i += 1) {
      const id = createRequestId()
      expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    }
  })

  it('每次生成都不同', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createRequestId()))
    expect(ids.size).toBe(50)
  })
})

describe('会话注册与释放', () => {
  it('打开会话时注册 preload 回调', () => {
    const handlers = makeHandlers()
    const session = openStreamSession({ capability: 'generate', handlers, requestId: 'req-abcdefgh' })

    expect(listeners.has('req-abcdefgh')).toBe(true)
    expect(getActiveStreamCount()).toBe(1)
    expect(session.handle.requestId).toBe('req-abcdefgh')
  })

  it('done 之后注册表被清空', async () => {
    const handlers = makeHandlers()
    const session = openStreamSession({ capability: 'generate', handlers, requestId: 'req-abcdefgh' })

    emit('req-abcdefgh', {
      requestId: 'req-abcdefgh',
      type: 'done',
      text: '全文内容',
      model: 'test-model',
      cached: false,
      latencyMs: 500,
    })

    expect(handlers.onDone).toHaveBeenCalledTimes(1)
    expect(getActiveStreamCount()).toBe(0)
    expect(listeners.has('req-abcdefgh')).toBe(false)
    const result = await session.handle.done
    expect(result.ok).toBe(true)
  })

  it('error 之后注册表被清空', async () => {
    const handlers = makeHandlers()
    const session = openStreamSession({ capability: 'generate', handlers, requestId: 'req-abcdefgh' })

    const error = { code: 'AI_ERR_TIMEOUT' as const, message: '请求超时', retryable: true }
    emit('req-abcdefgh', { requestId: 'req-abcdefgh', type: 'error', error })

    expect(handlers.onError).toHaveBeenCalledWith(error)
    expect(getActiveStreamCount()).toBe(0)
    const result = await session.handle.done
    expect(result.ok).toBe(false)
  })

  it('cancel 之后注册表被清空并通知主进程', async () => {
    const handlers = makeHandlers()
    const session = openStreamSession({ capability: 'generate', handlers, requestId: 'req-abcdefgh' })

    session.handle.cancel()

    expect(getActiveStreamCount()).toBe(0)
    expect(listeners.has('req-abcdefgh')).toBe(false)
    expect(window.notesApi.aiCancel).toHaveBeenCalledWith('req-abcdefgh')
    const result = await session.handle.done
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('预期失败')
    expect(result.error.code).toBe('AI_ERR_ABORTED')
  })

  it('cancelAllStreams 一次释放所有在途会话（用于弹窗关闭/卸载）', () => {
    const ids = ['req-aaaaaaaa', 'req-bbbbbbbb', 'req-cccccccc']
    ids.forEach((requestId) =>
      openStreamSession({ capability: 'optimize', handlers: makeHandlers(), requestId }),
    )
    expect(getActiveStreamCount()).toBe(3)

    cancelAllStreams()

    expect(getActiveStreamCount()).toBe(0)
    ids.forEach((requestId) => expect(listeners.has(requestId)).toBe(false))
  })

  it('同 requestId 重复注册被拒绝，不覆盖已有会话', async () => {
    const first = makeHandlers()
    const second = makeHandlers()
    const firstSession = openStreamSession({ capability: 'generate', handlers: first, requestId: 'req-abcdefgh' })
    const secondSession = openStreamSession({ capability: 'generate', handlers: second, requestId: 'req-abcdefgh' })

    expect(second.onError).toHaveBeenCalledTimes(1)
    expect(second.onError.mock.calls[0][0].code).toBe('AI_ERR_BAD_REQUEST')
    expect(secondSession.isSettled()).toBe(true)

    // 旧会话仍然可用，其 done 不会因为被覆盖而永不落定
    emit('req-abcdefgh', {
      requestId: 'req-abcdefgh',
      type: 'done',
      text: '旧会话结果',
      model: 'test-model',
      cached: false,
      latencyMs: 10,
    })
    expect(first.onDone).toHaveBeenCalledTimes(1)
    const result = await firstSession.handle.done
    expect(result.ok).toBe(true)
  })
})

describe('增量合流', () => {
  it('同一帧内的多个 chunk 只触发一次 onDelta', async () => {
    const handlers = makeHandlers()
    openStreamSession({ capability: 'generate', handlers, requestId: 'req-abcdefgh' })

    for (const delta of ['一', '二', '三', '四', '五']) {
      emit('req-abcdefgh', { requestId: 'req-abcdefgh', type: 'chunk', delta })
    }

    // rAF 尚未触发，回调还没发生
    expect(handlers.onDelta).toHaveBeenCalledTimes(0)
    await flushFrame()
    expect(handlers.onDelta).toHaveBeenCalledTimes(1)
    expect(handlers.onDelta).toHaveBeenCalledWith('一二三四五')
  })

  it('跨帧的增量分多次回调，内容顺序不变', async () => {
    const handlers = makeHandlers()
    openStreamSession({ capability: 'generate', handlers, requestId: 'req-abcdefgh' })

    emit('req-abcdefgh', { requestId: 'req-abcdefgh', type: 'chunk', delta: '第一批' })
    await flushFrame()
    emit('req-abcdefgh', { requestId: 'req-abcdefgh', type: 'chunk', delta: '第二批' })
    await flushFrame()

    expect(handlers.onDelta).toHaveBeenCalledTimes(2)
    expect(handlers.onDelta.mock.calls.map((call) => call[0]).join('')).toBe('第一批第二批')
  })

  it('done 之前先冲刷残留增量，保证「最后一段」不丢', () => {
    const handlers = makeHandlers()
    openStreamSession({ capability: 'generate', handlers, requestId: 'req-abcdefgh' })

    emit('req-abcdefgh', { requestId: 'req-abcdefgh', type: 'chunk', delta: '最后一小段' })
    emit('req-abcdefgh', {
      requestId: 'req-abcdefgh',
      type: 'done',
      text: '最后一小段',
      model: 'test-model',
      cached: false,
      latencyMs: 5,
    })

    // 不等待帧，done 必须自己把 buffer 冲出来
    expect(handlers.onDelta).toHaveBeenCalledWith('最后一小段')
    // 且 onDelta 必须早于 onDone
    const deltaOrder = handlers.onDelta.mock.invocationCallOrder[0]
    const doneOrder = handlers.onDone.mock.invocationCallOrder[0]
    expect(deltaOrder).toBeLessThan(doneOrder)
  })

  it('meta 事件不进入 buffer', async () => {
    const handlers = makeHandlers()
    openStreamSession({ capability: 'generate', handlers, requestId: 'req-abcdefgh' })

    emit('req-abcdefgh', { requestId: 'req-abcdefgh', type: 'meta', model: 'test-model', cached: false })
    await flushFrame()

    expect(handlers.onMeta).toHaveBeenCalledWith({ model: 'test-model', cached: false })
    expect(handlers.onDelta).not.toHaveBeenCalled()
  })

  it('结算后到达的 chunk 被忽略（不会写进已释放的会话）', async () => {
    const handlers = makeHandlers()
    const session = openStreamSession({ capability: 'generate', handlers, requestId: 'req-abcdefgh' })
    session.handle.cancel()

    expect(() => emit('req-abcdefgh', { requestId: 'req-abcdefgh', type: 'chunk', delta: '迟到' })).not.toThrow()
    await flushFrame()
    expect(handlers.onDelta).not.toHaveBeenCalled()
  })

  it('位置无关的 requestId 不会串台', () => {
    const other = makeHandlers()
    openStreamSession({ capability: 'generate', handlers: other, requestId: 'req-bbbbbbbb' })
    const handlers = makeHandlers()
    openStreamSession({ capability: 'generate', handlers, requestId: 'req-aaaaaaaa' })

    emit('req-bbbbbbbb', { requestId: 'req-bbbbbbbb', type: 'chunk', delta: '属于 B' })
    expect(handlers.onDelta).not.toHaveBeenCalled()

    emit('req-aaaaaaaa', { requestId: 'req-aaaaaaaa', type: 'chunk', delta: '属于 A' })
    expect(other.onDelta).not.toHaveBeenCalled()
  })
})

describe('fail 路径', () => {
  it('fail 结算会话并清理注册表', async () => {
    const handlers = makeHandlers()
    const session = openStreamSession({ capability: 'transform', handlers, requestId: 'req-abcdefgh' })

    session.fail({ code: 'AI_ERR_BAD_REQUEST', message: '参数非法', retryable: false })

    expect(session.isSettled()).toBe(true)
    expect(getActiveStreamCount()).toBe(0)
    expect(handlers.onError).toHaveBeenCalledTimes(1)
    const result = await session.handle.done
    expect(result.ok).toBe(false)
  })

  it('fail 之后再 fail 不重复回调', () => {
    const handlers = makeHandlers()
    const session = openStreamSession({ capability: 'transform', handlers, requestId: 'req-abcdefgh' })
    const error = { code: 'AI_ERR_BAD_REQUEST' as const, message: 'x', retryable: false }
    session.fail(error)
    session.fail(error)
    expect(handlers.onError).toHaveBeenCalledTimes(1)
  })
})

describe('缺少 notesApi 的环境', () => {
  it('打开会话不抛错，fail 仍能正常结算', async () => {
    Object.defineProperty(window, 'notesApi', { value: undefined, configurable: true, writable: true })
    const handlers = makeHandlers()
    const session = openStreamSession({ capability: 'generate', handlers, requestId: 'req-abcdefgh' })

    session.fail({ code: 'AI_ERR_UNKNOWN', message: '当前环境不支持 AI 能力', retryable: false })
    expect(handlers.onError).toHaveBeenCalledTimes(1)
    expect(getActiveStreamCount()).toBe(0)
    await session.handle.done
  })
})