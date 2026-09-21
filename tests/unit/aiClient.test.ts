import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { aiClient } from '@/services/ai/aiClient'
import { cancelAllStreams, getActiveStreamCount } from '@/services/ai/stream'

type StreamListener = (event: Record<string, unknown>) => void

interface FakeApi {
  aiConfigGet: ReturnType<typeof vi.fn>
  aiConfigSet: ReturnType<typeof vi.fn>
  aiConfigClear: ReturnType<typeof vi.fn>
  aiConfigTest: ReturnType<typeof vi.fn>
  aiGenerate: ReturnType<typeof vi.fn>
  aiBatch: ReturnType<typeof vi.fn>
  aiStreamStart: ReturnType<typeof vi.fn>
  aiCancel: ReturnType<typeof vi.fn>
  aiStreamSubscribe: ReturnType<typeof vi.fn>
  aiStreamUnsubscribe: ReturnType<typeof vi.fn>
}

const CONFIG_VIEW = {
  configured: true,
  hasKey: true,
  encryptionAvailable: true,
  sessionOnlyKey: false,
  baseUrl: 'https://api.example.com/v1',
  model: 'test-model',
  temperature: 0.7,
  maxTokens: 1600,
  timeoutMs: 60000,
  stream: true,
  maxTokensParam: 'max_tokens',
  disableStreamOptions: false,
  concurrency: 3,
  maxInputTokens: 8000,
  cacheEnabled: true,
  consent: true,
}

const SUCCESS = {
  ok: true,
  requestId: 'req-x',
  capability: 'generate',
  text: '# 标题\n正文',
  title: '标题',
  model: 'test-model',
  cached: false,
  latencyMs: 120,
}

const AUTH_FAILURE = {
  ok: false,
  error: { code: 'AI_ERR_AUTH', message: 'API Key 无效或已过期，请重新配置', retryable: false, httpStatus: 401 },
}

let api: FakeApi
let listeners: Map<string, StreamListener>

function installApi(overrides: Partial<FakeApi> = {}): void {
  listeners = new Map()
  api = {
    aiConfigGet: vi.fn(async () => CONFIG_VIEW),
    aiConfigSet: vi.fn(async () => CONFIG_VIEW),
    aiConfigClear: vi.fn(async () => CONFIG_VIEW),
    aiConfigTest: vi.fn(async () => ({
      ok: true,
      latencyMs: 12,
      model: 'test-model',
      reply: '可用',
      encryptionAvailable: true,
    })),
    aiGenerate: vi.fn(async () => SUCCESS),
    aiBatch: vi.fn(async (payloads: unknown[]) => ({
      ok: true,
      results: payloads.map(() => SUCCESS),
    })),
    aiStreamStart: vi.fn(async (payload: { requestId: string }) => ({ ok: true, requestId: payload.requestId })),
    aiCancel: vi.fn(async () => ({ ok: true, cancelled: true })),
    aiStreamSubscribe: vi.fn((requestId: string, onEvent: StreamListener) => {
      listeners.set(requestId, onEvent)
      return () => {
        listeners.delete(requestId)
      }
    }),
    aiStreamUnsubscribe: vi.fn((requestId: string) => {
      listeners.delete(requestId)
    }),
    ...overrides,
  }
  Object.defineProperty(window, 'notesApi', { value: api, configurable: true, writable: true })
}

function emit(event: Record<string, unknown> & { requestId: string }): void {
  const listener = listeners.get(event.requestId)
  expect(listener, `没有找到 requestId=${event.requestId} 的流监听器`).toBeTruthy()
  listener?.(event)
}

const flushFrame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 32))

const GENERATE_INPUT = {
  topic: '如何提高效率',
  style: 'formal' as const,
  length: 'medium' as const,
  includeOutline: true,
  includeExamples: false,
}

beforeEach(() => {
  installApi()
})

afterEach(() => {
  cancelAllStreams()
  Object.defineProperty(window, 'notesApi', { value: undefined, configurable: true, writable: true })
})

describe('aiClient - 三种能力映射', () => {
  it('generate 把结构化参数映射为请求载荷', async () => {
    const result = await aiClient.generate(GENERATE_INPUT)
    expect(result.ok).toBe(true)

    const payload = api.aiGenerate.mock.calls[0][0]
    expect(payload.capability).toBe('generate')
    expect(payload.topic).toBe('如何提高效率')
    expect(payload.style).toBe('formal')
    expect(payload.length).toBe('medium')
    expect(payload.includeOutline).toBe(true)
    expect(payload.includeExamples).toBe(false)
    expect(typeof payload.requestId).toBe('string')
    // 渲染进程不拼 messages，无法注入 system prompt
    expect(payload).not.toHaveProperty('messages')
  })

  it('optimize 映射 action 与原文', async () => {
    await aiClient.optimize({ action: 'polish', text: '需要润色的原文' })
    const payload = api.aiGenerate.mock.calls[0][0]
    expect(payload.capability).toBe('optimize')
    expect(payload.action).toBe('polish')
    expect(payload.text).toBe('需要润色的原文')
  })

  it('transform 映射 targetStyle 与原文', async () => {
    await aiClient.transform({ text: '原文', targetStyle: 'academic' })
    const payload = api.aiGenerate.mock.calls[0][0]
    expect(payload.capability).toBe('transform')
    expect(payload.targetStyle).toBe('academic')
    expect(payload.text).toBe('原文')
  })

  it('bypassCache 透传给主进程（「重新生成」语义）', async () => {
    await aiClient.generate(GENERATE_INPUT, { bypassCache: true })
    expect(api.aiGenerate.mock.calls[0][0].bypassCache).toBe(true)
  })
})

describe('aiClient - 失败信封与异常归一化', () => {
  it('主进程返回失败信封时原样透传结构化错误', async () => {
    installApi({ aiGenerate: vi.fn(async () => AUTH_FAILURE) })
    const result = await aiClient.generate(GENERATE_INPUT)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('预期失败')
    expect(result.error.code).toBe('AI_ERR_AUTH')
    expect(result.error.httpStatus).toBe(401)
  })

  it('IPC 被拒绝时归一化为 AI_ERR_UNKNOWN 且带中文文案', async () => {
    installApi({
      aiGenerate: vi.fn(async () => {
        throw new Error("Error invoking remote method 'ai:generate'")
      }),
    })
    const result = await aiClient.generate(GENERATE_INPUT)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('预期失败')
    expect(result.error.code).toBe('AI_ERR_UNKNOWN')
    expect(result.error.message).toContain('remote method')
  })

  it('缺少 notesApi 时返回不可用信封而非抛错', async () => {
    Object.defineProperty(window, 'notesApi', { value: undefined, configurable: true, writable: true })
    const result = await aiClient.generate(GENERATE_INPUT)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('预期失败')
    expect(result.error.message).toContain('桌面应用')
  })
})

describe('aiClient - 渲染侧去重', () => {
  it('相同参数连续调用只触发一次 IPC', async () => {
    const [first, second] = await Promise.all([
      aiClient.generate(GENERATE_INPUT),
      aiClient.generate(GENERATE_INPUT),
    ])
    expect(api.aiGenerate).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
  })

  it('参数不同则各自发起请求', async () => {
    await Promise.all([
      aiClient.generate(GENERATE_INPUT),
      aiClient.generate({ ...GENERATE_INPUT, topic: '另一个主题' }),
    ])
    expect(api.aiGenerate).toHaveBeenCalledTimes(2)
  })

  it('去重不缓存结果：前一次结束后再次调用会发新请求', async () => {
    await aiClient.generate(GENERATE_INPUT)
    await aiClient.generate(GENERATE_INPUT)
    expect(api.aiGenerate).toHaveBeenCalledTimes(2)
  })
})

describe('aiClient - 流式', () => {
  it('先注册回调再启动，增量按帧合流后回调', async () => {
    const deltas: string[] = []
    const done = vi.fn()
    const handle = aiClient.stream(
      { capability: 'generate', ...GENERATE_INPUT },
      { onDelta: (delta) => deltas.push(delta), onDone: done, onError: vi.fn() },
    )

    // 订阅必须早于 aiStreamStart，否则首个 chunk 会丢
    expect(listeners.has(handle.requestId)).toBe(true)
    expect(api.aiStreamStart).toHaveBeenCalledTimes(1)

    emit({ requestId: handle.requestId, type: 'chunk', delta: '第一段' })
    emit({ requestId: handle.requestId, type: 'chunk', delta: '第二段' })
    // 同一帧内的多个 chunk 应合流成一次回调
    expect(deltas).toHaveLength(0)
    await flushFrame()
    expect(deltas).toEqual(['第一段第二段'])

    emit({ requestId: handle.requestId, type: 'chunk', delta: '第三段' })
    emit({
      requestId: handle.requestId,
      type: 'done',
      text: '第一段第二段第三段',
      title: '标题',
      model: 'test-model',
      cached: false,
      latencyMs: 800,
      firstDeltaMs: 120,
    })

    expect(done).toHaveBeenCalledTimes(1)
    expect(deltas.join('')).toBe('第一段第二段第三段')

    const result = await handle.done
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('预期成功')
    expect(result.text).toBe('第一段第二段第三段')
    expect(result.title).toBe('标题')
    expect(result.capability).toBe('generate')
    expect(result.firstDeltaMs).toBe(120)
    expect(getActiveStreamCount()).toBe(0)
  })

  it('meta 事件回传模型与重试次数', async () => {
    const onMeta = vi.fn()
    const handle = aiClient.stream(
      { capability: 'generate', ...GENERATE_INPUT },
      { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onMeta },
    )
    emit({ requestId: handle.requestId, type: 'meta', model: 'test-model', cached: false })
    emit({ requestId: handle.requestId, type: 'meta', model: 'test-model', cached: false, attempt: 2 })
    expect(onMeta).toHaveBeenNthCalledWith(1, { model: 'test-model', cached: false })
    expect(onMeta).toHaveBeenNthCalledWith(2, { model: 'test-model', cached: false, attempt: 2 })
  })

  it('error 事件结算会话并回传结构化错误', async () => {
    const onError = vi.fn()
    const handle = aiClient.stream(
      { capability: 'generate', ...GENERATE_INPUT },
      { onDelta: vi.fn(), onDone: vi.fn(), onError },
    )
    emit({ requestId: handle.requestId, type: 'error', error: AUTH_FAILURE.error })

    expect(onError).toHaveBeenCalledWith(AUTH_FAILURE.error)
    const result = await handle.done
    expect(result.ok).toBe(false)
    expect(getActiveStreamCount()).toBe(0)
  })

  it('取消后：本地立即结算、通知主进程、且不再接受后续事件', async () => {
    const onDelta = vi.fn()
    const onError = vi.fn()
    const handle = aiClient.stream(
      { capability: 'generate', ...GENERATE_INPUT },
      { onDelta, onDone: vi.fn(), onError },
    )

    const staleListener = listeners.get(handle.requestId)
    handle.cancel()

    expect(api.aiCancel).toHaveBeenCalledWith(handle.requestId)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0].code).toBe('AI_ERR_ABORTED')

    const result = await handle.done
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('预期失败')
    expect(result.error.code).toBe('AI_ERR_ABORTED')

    // 即使持有取消前的旧监听器引用，迟到的事件也必须被忽略
    const callsAfterCancel = onDelta.mock.calls.length
    expect(() => staleListener?.({ requestId: handle.requestId, type: 'chunk', delta: '迟到内容' })).not.toThrow()
    expect(onDelta).toHaveBeenCalledTimes(callsAfterCancel)
    expect(getActiveStreamCount()).toBe(0)
  })

  it('取消已结算的流不会重复回调', async () => {
    const onError = vi.fn()
    const handle = aiClient.stream(
      { capability: 'generate', ...GENERATE_INPUT },
      { onDelta: vi.fn(), onDone: vi.fn(), onError },
    )
    emit({ requestId: handle.requestId, type: 'error', error: AUTH_FAILURE.error })
    handle.cancel()
    handle.cancel()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('aiStreamStart 返回失败时结算为对应错误', async () => {
    installApi({
      aiStreamStart: vi.fn(async () => ({
        ok: false,
        error: { code: 'AI_ERR_NOT_CONFIGURED', message: '尚未配置', retryable: false },
      })),
    })
    const onError = vi.fn()
    const handle = aiClient.stream(
      { capability: 'generate', ...GENERATE_INPUT },
      { onDelta: vi.fn(), onDone: vi.fn(), onError },
    )

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(onError.mock.calls[0][0].code).toBe('AI_ERR_NOT_CONFIGURED')
    expect(getActiveStreamCount()).toBe(0)
    await handle.done
  })

  it('已中止的 signal 会立即取消流', () => {
    const onError = vi.fn()
    const controller = new AbortController()
    controller.abort()
    const handle = aiClient.stream(
      { capability: 'generate', ...GENERATE_INPUT },
      { onDelta: vi.fn(), onDone: vi.fn(), onError },
      { signal: controller.signal },
    )
    expect(onError.mock.calls[0][0].code).toBe('AI_ERR_ABORTED')
    expect(api.aiCancel).toHaveBeenCalledWith(handle.requestId)
  })

  it('signal 中止时取消流，且监听器被移除', async () => {
    const controller = new AbortController()
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener')
    const handle = aiClient.stream(
      { capability: 'generate', ...GENERATE_INPUT },
      { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
      { signal: controller.signal },
    )
    controller.abort()
    await handle.done
    expect(removeSpy).toHaveBeenCalled()
    expect(getActiveStreamCount()).toBe(0)
  })
})

describe('aiClient - 批量', () => {
  it('批量请求结果长度与入参一致', async () => {
    const results = await aiClient.batch([
      { capability: 'generate', ...GENERATE_INPUT },
      { capability: 'optimize', action: 'summarize', text: '甲' },
      { capability: 'transform', text: '乙', targetStyle: 'casual' },
    ])
    expect(results).toHaveLength(3)
    expect(results.every((item) => item.ok)).toBe(true)

    const payloads = api.aiBatch.mock.calls[0][0]
    expect(payloads.map((item: { capability: string }) => item.capability)).toEqual([
      'generate',
      'optimize',
      'transform',
    ])
  })

  it('空数组不发请求', async () => {
    expect(await aiClient.batch([])).toEqual([])
    expect(api.aiBatch).not.toHaveBeenCalled()
  })

  it('批次被整体拒绝时每项都返回同一错误', async () => {
    installApi({
      aiBatch: vi.fn(async () => ({
        ok: false,
        error: { code: 'AI_ERR_INPUT_TOO_LONG', message: '输入过长', retryable: false },
      })),
    })
    const results = await aiClient.batch([
      { capability: 'generate', ...GENERATE_INPUT },
      { capability: 'generate', ...GENERATE_INPUT },
    ])
    expect(results).toHaveLength(2)
    expect(results.every((item) => !item.ok)).toBe(true)
    expect(results[0].ok).toBe(false)
    if (results[0].ok) throw new Error('预期失败')
    expect(results[0].error.code).toBe('AI_ERR_INPUT_TOO_LONG')
  })

  it('signal 已中止时直接返回取消错误，不发请求', async () => {
    const controller = new AbortController()
    controller.abort()
    const results = await aiClient.batch([{ capability: 'generate', ...GENERATE_INPUT }], {
      signal: controller.signal,
    })
    expect(api.aiBatch).not.toHaveBeenCalled()
    expect(results[0].ok).toBe(false)
    if (results[0].ok) throw new Error('预期失败')
    expect(results[0].error.code).toBe('AI_ERR_ABORTED')
  })
})

describe('aiClient - 配置', () => {
  it('get 返回配置视图', async () => {
    const view = await aiClient.config.get()
    expect(view).toEqual(CONFIG_VIEW)
  })

  it('get 失败时返回信封', async () => {
    installApi({ aiConfigGet: vi.fn(async () => AUTH_FAILURE) })
    const result = await aiClient.config.get()
    expect(result).toEqual(AUTH_FAILURE)
  })

  it('set 透传补丁', async () => {
    await aiClient.config.set({ baseUrl: 'https://api.deepseek.com', apiKey: 'sk-x', consent: true })
    const patch = api.aiConfigSet.mock.calls[0][0]
    expect(patch).toEqual({ baseUrl: 'https://api.deepseek.com', apiKey: 'sk-x', consent: true })
  })

  it('test 返回连通性结果', async () => {
    const result = await aiClient.config.test({ apiKey: 'sk-temp' })
    expect(result.ok).toBe(true)
    expect(api.aiConfigTest).toHaveBeenCalledWith({ apiKey: 'sk-temp' })
  })

  it('test 失败时返回信封', async () => {
    installApi({
      aiConfigTest: vi.fn(async () => ({
        ok: false,
        error: { code: 'AI_ERR_NETWORK', message: '网络连接失败', retryable: true },
      })),
    })
    const result = await aiClient.config.test()
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('预期失败')
    expect(result.error.retryable).toBe(true)
  })

  it('clear 返回清空后的视图', async () => {
    const view = await aiClient.config.clear()
    expect(api.aiConfigClear).toHaveBeenCalledTimes(1)
    expect(view).toEqual(CONFIG_VIEW)
  })
})