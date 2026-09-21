import { describe, it, expect, vi } from 'vitest'
import { createAiService } from '../../electron/ai/ai-service.cjs'

interface CapturedEvent {
  type: string
  requestId?: string
  delta?: string
  text?: string
  title?: string
  cached?: boolean
  attempt?: number
  model?: string
  latencyMs?: number
  firstDeltaMs?: number
  error?: { code: string; retryable: boolean; message: string; attempts?: number }
}

interface ConfigStoreStub {
  getConfig: () => Record<string, unknown>
  readApiKey: () => string
  getView: () => Record<string, unknown>
  isEncryptionAvailable: () => boolean
  update: ReturnType<typeof vi.fn>
  clearAll: ReturnType<typeof vi.fn>
  _config: Record<string, unknown>
  _update: ReturnType<typeof vi.fn>
  _clearAll: ReturnType<typeof vi.fn>
}

function makeConfigStore(
  overrides: Record<string, unknown> = {},
  apiKey = 'sk-test-key-1234',
): ConfigStoreStub {
  const config = {
    version: 1,
    baseUrl: 'https://api.example.com',
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
    ...overrides,
  }
  const update = vi.fn()
  const clearAll = vi.fn()
  return {
    getConfig: () => ({ ...config, apiKey }),
    readApiKey: () => apiKey,
    getView: () => ({ ...config }),
    isEncryptionAvailable: () => true,
    update,
    clearAll,
    _config: config,
    _update: update,
    _clearAll: clearAll,
  }
}

interface RequestPayload {
  requestId: string
  capability: string
  text?: string
  action?: string
  topic?: string
  style?: string
  length?: string
  includeOutline?: boolean
  includeExamples?: boolean
}

function makeRequest(requestId = 'req-12345678', capability = 'generate'): RequestPayload {
  if (capability === 'optimize') {
    return {
      requestId,
      capability,
      text: '待优化的原文内容',
      action: 'polish',
    }
  }
  return {
    requestId,
    capability: 'generate',
    topic: '测试主题',
    style: 'formal',
    length: 'medium',
    includeOutline: false,
    includeExamples: false,
  }
}

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function sseDelta(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
}

/**
 * 模拟真实 fetch 的 signal 语义：signal 已中止时立即 reject，
 * 否则等 abort 事件再 reject。若忘记处理已中止情形，Promise 会永远挂住。
 */
function hangingFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(
    (_url: string, init: { signal: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        const fail = (): void => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        }
        if (init.signal.aborted) {
          fail()
          return
        }
        init.signal.addEventListener('abort', fail)
      }),
  )
}

/** 先投递一个 chunk，再让流失败的响应（用于验证「已推送 chunk 后禁止重试」） */
function streamErrorAfterFirstDelta(error: Error): Response {
  const encoder = new TextEncoder()
  let pulls = 0
  const stream = new ReadableStream({
    pull(controller) {
      pulls += 1
      if (pulls === 1) {
        controller.enqueue(encoder.encode(sseDelta('已发出的开头')))
      } else {
        controller.error(error)
      }
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('等待流事件超时')
}

describe('runNonStream - 非流式请求', () => {
  it('未配置（缺少 baseUrl）时返回 NOT_CONFIGURED 信封', async () => {
    const service = createAiService({
      configStore: makeConfigStore({ baseUrl: '', model: '' }),
      fetchImpl: vi.fn(),
    })
    const result = await service.runNonStream(makeRequest())
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('AI_ERR_NOT_CONFIGURED')
    expect(result.error.retryable).toBe(false)
  })

  it('未授予数据外发同意时同样拒绝', async () => {
    const service = createAiService({
      configStore: makeConfigStore({ consent: false }),
      fetchImpl: vi.fn(),
    })
    const result = await service.runNonStream(makeRequest())
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('AI_ERR_NOT_CONFIGURED')
  })

  it('成功时返回归一化正文、标题与 usage', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        model: 'test-model',
        choices: [{ message: { content: '```markdown\n# 我的标题\n\n正文内容\n```' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    )
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })
    const result = await service.runNonStream(makeRequest())

    expect(result.ok).toBe(true)
    expect(result.text).toBe('# 我的标题\n\n正文内容')
    expect(result.title).toBe('我的标题')
    expect(result.model).toBe('test-model')
    expect(result.cached).toBe(false)
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 })
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('相同请求第二次命中缓存，不再发起网络请求', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '内容' } }] }))
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })
    const request = makeRequest()

    const first = await service.runNonStream(request)
    const second = await service.runNonStream(request)

    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(second.text).toBe('内容')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('bypassCache 跳过读缓存，但仍写入缓存（「重新生成」语义）', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '内容' } }] }))
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })
    const request = makeRequest()

    await service.runNonStream(request)
    const regenerated = await service.runNonStream(request, { bypassCache: true })
    expect(regenerated.cached).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    // 第三次不带 bypass，应命中第二次写入的缓存
    const third = await service.runNonStream(request)
    expect(third.cached).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('cacheEnabled 关闭时完全不使用缓存', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '内容' } }] }))
    const service = createAiService({ configStore: makeConfigStore({ cacheEnabled: false }), fetchImpl })
    const request = makeRequest()

    await service.runNonStream(request)
    await service.runNonStream(request)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('不同能力/参数产生不同缓存键', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '内容' } }] }))
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })

    await service.runNonStream(makeRequest('req-aaaaaaaa'))
    await service.runNonStream(makeRequest('req-bbbbbbbb', 'optimize'))
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('runNonStream - 错误处理', () => {
  it('401 归类为 AUTH 且不重试', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'invalid key' } }, { status: 401 }))
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl, sleep: vi.fn() })
    const result = await service.runNonStream(makeRequest())

    expect(result.error.code).toBe('AI_ERR_AUTH')
    expect(result.error.retryable).toBe(false)
    expect(result.error.httpStatus).toBe(401)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('503 归类为 SERVER 并重试到上限（共 3 次）', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'down' } }, { status: 503 }))
    const sleep = vi.fn().mockResolvedValue(undefined)
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl, sleep })
    const result = await service.runNonStream(makeRequest())

    expect(result.error.code).toBe('AI_ERR_SERVER')
    expect(result.error.retryable).toBe(true)
    expect(result.error.attempts).toBe(3)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('400 且响应体含安全策略关键词归类为 CONTENT_FILTER', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: 'blocked by content_policy' } }, { status: 400 }))
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl, sleep: vi.fn() })
    const result = await service.runNonStream(makeRequest())

    expect(result.error.code).toBe('AI_ERR_CONTENT_FILTER')
    expect(result.error.retryable).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('网络异常归类为 NETWORK 且可重试', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const sleep = vi.fn().mockResolvedValue(undefined)
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl, sleep })
    const result = await service.runNonStream(makeRequest())

    expect(result.error.code).toBe('AI_ERR_NETWORK')
    expect(result.error.retryable).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('429 携带 Retry-After 时按该延迟退避并最终成功', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'rate limited' } }, { status: 429, headers: { 'retry-after': '2' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '重试成功' } }] }))
    const sleep = vi.fn().mockResolvedValue(undefined)
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl, sleep })
    const result = await service.runNonStream(makeRequest())

    expect(sleep).toHaveBeenCalledWith(2000)
    expect(result.ok).toBe(true)
    expect(result.text).toBe('重试成功')
  })

  it('响应不是合法 JSON 时归类为 BAD_FORMAT（可重试）', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<html>bad gateway</html>', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const sleep = vi.fn().mockResolvedValue(undefined)
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl, sleep })
    const result = await service.runNonStream(makeRequest())

    expect(result.error.code).toBe('AI_ERR_BAD_FORMAT')
    expect(result.error.retryable).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('请求超时归类为 TIMEOUT 并走重试', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          )
        }),
    )
    const sleep = vi.fn().mockResolvedValue(undefined)
    const service = createAiService({
      configStore: makeConfigStore({ timeoutMs: 20 }),
      fetchImpl,
      sleep,
    })
    const result = await service.runNonStream(makeRequest())

    expect(result.error.code).toBe('AI_ERR_TIMEOUT')
    expect(result.error.retryable).toBe(true)
  })

  it('正文为空归类为 EMPTY_CONTENT', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: '   ' }, finish_reason: 'stop' }] }),
    )
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl, sleep: vi.fn().mockResolvedValue(undefined) })
    const result = await service.runNonStream(makeRequest())

    expect(result.error.code).toBe('AI_ERR_EMPTY_CONTENT')
  })
})

describe('并发闸门', () => {
  it('批量请求的并发峰值不超过配置的 concurrency', async () => {
    let active = 0
    let peak = 0
    const fetchImpl = vi.fn(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active -= 1
      return jsonResponse({ choices: [{ message: { content: '内容' } }] })
    })
    const service = createAiService({
      configStore: makeConfigStore({ concurrency: 2, cacheEnabled: false }),
      fetchImpl,
    })

    const results = await service.runBatch([
      makeRequest('req-aaaaaaaa'),
      makeRequest('req-bbbbbbbb'),
      makeRequest('req-cccccccc'),
      makeRequest('req-dddddddd'),
    ])

    expect(results).toHaveLength(4)
    expect(results.every((item: { ok: boolean }) => item.ok)).toBe(true)
    expect(peak).toBeLessThanOrEqual(2)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('批量中单项失败不影响其他项（continueOnError）', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body)
      if (body.messages[1].content.includes('待优化的原文内容')) {
        return jsonResponse({ error: { message: 'invalid key' } }, { status: 401 })
      }
      return jsonResponse({ choices: [{ message: { content: '成功内容' } }] })
    })
    const service = createAiService({
      configStore: makeConfigStore({ cacheEnabled: false }),
      fetchImpl,
      sleep: vi.fn().mockResolvedValue(undefined),
    })

    const results = await service.runBatch([
      makeRequest('req-aaaaaaaa'),
      makeRequest('req-bbbbbbbb', 'optimize'),
      makeRequest('req-cccccccc'),
    ])

    expect(results[0].ok).toBe(true)
    expect(results[1].ok).toBe(false)
    expect(results[1].error.code).toBe('AI_ERR_AUTH')
    expect(results[2].ok).toBe(true)
  })
})

describe('流式请求', () => {
  it('逐块推送增量，done 事件给出归一化全文', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        sseDelta('# 流式标题\n'),
        sseDelta('正文第一段。'),
        `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } })}\n\n`,
        'data: [DONE]\n\n',
      ]),
    )
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })
    const events: CapturedEvent[] = []

    const handle = service.startStream(makeRequest(), (event: CapturedEvent) => events.push(event))
    expect(handle.ok).toBe(true)
    expect(typeof handle.requestId).toBe('string')

    await waitFor(() => events.some((event) => event.type === 'done'))
    const done = events.find((event) => event.type === 'done')
    expect(events[0].type).toBe('meta')
    expect(done?.text).toBe('# 流式标题\n正文第一段。')
    expect(done?.title).toBe('流式标题')
    expect(done?.cached).toBe(false)
    expect(done?.firstDeltaMs).toBeGreaterThanOrEqual(0)
    expect(events.filter((event) => event.type === 'chunk').map((event) => event.delta).join('')).toBe(
      '# 流式标题\n正文第一段。',
    )
    expect(service.activeStreamCount).toBe(0)
  })

  it('流式增量按 16ms 合流，不逐字推送', async () => {
    const chunks = ['甲', '乙', '丙', '丁', '戊'].map(sseDelta)
    chunks.push('data: [DONE]\n\n')
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse(chunks))
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })
    const events: CapturedEvent[] = []
    service.startStream(makeRequest(), (event: CapturedEvent) => events.push(event))
    await waitFor(() => events.some((event) => event.type === 'done'))

    const chunkEvents = events.filter((event) => event.type === 'chunk')
    // 5 个字应在同一个 16ms 窗口内合流成 1 条（而非 5 条）
    expect(chunkEvents.length).toBeLessThanOrEqual(2)
    expect(chunkEvents.map((event) => event.delta).join('')).toBe('甲乙丙丁戊')
  })

  it('上游忽略 stream 参数返回 JSON 时按非流式兜底', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '非流式兜底内容' } }] }))
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })
    const events: CapturedEvent[] = []
    service.startStream(makeRequest(), (event: CapturedEvent) => events.push(event))
    await waitFor(() => events.some((event) => event.type === 'done'))

    const done = events.find((event) => event.type === 'done')
    expect(done?.text).toBe('非流式兜底内容')
    expect(events.filter((event) => event.type === 'chunk').map((event) => event.delta).join('')).toBe('非流式兜底内容')
  })

  it('400 因 stream_options 被拒时自动去掉该字段重试一次', async () => {
    const bodies: string[] = []
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(init.body)
      if (bodies.length === 1) {
        return jsonResponse({ error: { message: 'unknown parameter: stream_options' } }, { status: 400 })
      }
      return sseResponse([sseDelta('降级成功'), 'data: [DONE]\n\n'])
    })
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl, sleep: vi.fn().mockResolvedValue(undefined) })
    const events: CapturedEvent[] = []
    service.startStream(makeRequest(), (event: CapturedEvent) => events.push(event))
    await waitFor(() => events.some((event) => event.type === 'done'))

    expect(bodies).toHaveLength(2)
    expect(JSON.parse(bodies[0])).toHaveProperty('stream_options')
    expect(JSON.parse(bodies[1])).not.toHaveProperty('stream_options')
    const done = events.find((event) => event.type === 'done')
    expect(done?.text).toBe('降级成功')
  })

  it('取消后推送 ABORTED 且不重试', async () => {
    const fetchImpl = hangingFetch()
    const service = createAiService({
      configStore: makeConfigStore(),
      fetchImpl,
      sleep: vi.fn().mockResolvedValue(undefined),
    })
    const events: CapturedEvent[] = []
    const handle = service.startStream(makeRequest(), (event: CapturedEvent) => events.push(event))

    expect(service.cancel(handle.requestId)).toBe(true)

    await waitFor(() => events.some((event) => event.type === 'error'))
    const error = events.find((event) => event.type === 'error')
    expect(error?.error?.code).toBe('AI_ERR_ABORTED')
    expect(error?.error?.retryable).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('取消不存在的 requestId 返回 false', () => {
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl: vi.fn() })
    expect(service.cancel('req-not-exist')).toBe(false)
  })

  it('已推送 chunk 后失败不再重试（避免用户看到两遍内容）', async () => {
    let call = 0
    const fetchImpl = vi.fn(async () => {
      call += 1
      if (call === 1) {
        // 必须是 NETWORK（可重试的错误），才能真正验证 canRetry 守卫生效
        return streamErrorAfterFirstDelta(new TypeError('fetch failed'))
      }
      return sseResponse([sseDelta('重试内容'), 'data: [DONE]\n\n'])
    })
    const service = createAiService({
      configStore: makeConfigStore(),
      fetchImpl,
      sleep: vi.fn().mockResolvedValue(undefined),
    })
    const events: CapturedEvent[] = []
    service.startStream(makeRequest(), (event: CapturedEvent) => events.push(event))

    await waitFor(() => events.some((event) => event.type === 'error'))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(events.find((event) => event.type === 'error')?.error?.code).toBe('AI_ERR_NETWORK')
    expect(events.filter((event) => event.type === 'chunk').map((event) => event.delta).join('')).toBe(
      '已发出的开头',
    )
    expect(events.some((event) => event.type === 'done')).toBe(false)
  })

  it('重复的 requestId 被拒绝', async () => {
    const fetchImpl = hangingFetch()
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })
    const request = makeRequest('req-duplicate1')
    const events: CapturedEvent[] = []

    const first = service.startStream(request, (event: CapturedEvent) => events.push(event))
    const second = service.startStream(request, (event: CapturedEvent) => events.push(event))

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    expect(events.some((event) => event.type === 'error')).toBe(true)

    service.cancel('req-duplicate1')
    await tick()
  })

  it('未配置时立即推送 NOT_CONFIGURED 而不发起请求', async () => {
    const fetchImpl = vi.fn()
    const service = createAiService({
      configStore: makeConfigStore({ baseUrl: '' }),
      fetchImpl,
    })
    const events: CapturedEvent[] = []
    service.startStream(makeRequest(), (event: CapturedEvent) => events.push(event))

    await waitFor(() => events.some((event) => event.type === 'error'))
    expect(events[0].error?.code).toBe('AI_ERR_NOT_CONFIGURED')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('流式响应内容为空时推送 EMPTY_CONTENT', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(['data: [DONE]\n\n']))
    const service = createAiService({
      configStore: makeConfigStore(),
      fetchImpl,
      sleep: vi.fn().mockResolvedValue(undefined),
    })
    const events: CapturedEvent[] = []
    service.startStream(makeRequest(), (event: CapturedEvent) => events.push(event))

    await waitFor(() => events.some((event) => event.type === 'error'))
    expect(events.find((event) => event.type === 'error')?.error?.code).toBe('AI_ERR_EMPTY_CONTENT')
  })
})

describe('listModels - 拉取服务商模型列表', () => {
  const MODELS_BODY = { object: 'list', data: [{ id: 'm-b' }, { id: 'm-a' }] }

  it('成功返回去重排序后的模型 id 与查询地址', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(MODELS_BODY))
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })

    const result = await service.listModels()
    expect(result).toEqual({ ok: true, models: ['m-a', 'm-b'], baseUrl: 'https://api.example.com' })

    // 必须打 /models 且用 GET
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.example.com/v1/models')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer sk-test-key-1234')
  })

  it('可携带未保存的 baseUrl 与 apiKey（先看列表再保存）', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(MODELS_BODY))
    const configStore = makeConfigStore({ baseUrl: '' }, '')
    const service = createAiService({ configStore, fetchImpl })

    const result = await service.listModels({
      baseUrl: 'https://api.xiaomimimo.com/v1',
      apiKey: 'sk-temp-key-abcdef',
    })

    expect(result.ok).toBe(true)
    expect(result.baseUrl).toBe('https://api.xiaomimimo.com/v1')
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.xiaomimimo.com/v1/models')
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-temp-key-abcdef')
    // 临时 patch 不得写入配置
    expect(configStore._update).not.toHaveBeenCalled()
  })

  it('本地服务无 Key 时不发送 Authorization', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ models: [{ name: 'qwen2.5:7b' }] }))
    const configStore = makeConfigStore({ baseUrl: 'http://localhost:11434' }, '')
    const service = createAiService({ configStore, fetchImpl })

    const result = await service.listModels()
    expect(result).toEqual({ ok: true, models: ['qwen2.5:7b'], baseUrl: 'http://localhost:11434' })
    expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
  })

  it('未配置 baseUrl 时抛 NOT_CONFIGURED 且不发请求', async () => {
    const fetchImpl = vi.fn()
    const service = createAiService({ configStore: makeConfigStore({ baseUrl: '' }, ''), fetchImpl })

    await expect(service.listModels()).rejects.toMatchObject({
      aiError: { code: 'AI_ERR_NOT_CONFIGURED' },
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('鉴权失败抛结构化 AUTH 错误', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'bad key' } }, { status: 401 }))
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })

    await expect(service.listModels()).rejects.toMatchObject({
      aiError: { code: 'AI_ERR_AUTH', retryable: false },
    })
  })

  it('服务商未开放 /models（404）抛 NOT_FOUND，供 UI 提示手动输入', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'not found' } }, { status: 404 }))
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })

    await expect(service.listModels()).rejects.toMatchObject({
      aiError: { code: 'AI_ERR_NOT_FOUND' },
    })
  })

  it('响应形状无法识别时抛 BAD_FORMAT', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ unexpected: true }))
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })

    await expect(service.listModels()).rejects.toMatchObject({
      aiError: { code: 'AI_ERR_BAD_FORMAT' },
    })
  })

  it('网络异常抛 NETWORK', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })

    await expect(service.listModels()).rejects.toMatchObject({
      aiError: { code: 'AI_ERR_NETWORK' },
    })
  })

  it('超时抛 TIMEOUT', async () => {
    const service = createAiService({
      configStore: makeConfigStore({ timeoutMs: 20 }),
      fetchImpl: hangingFetch(),
    })

    await expect(service.listModels()).rejects.toMatchObject({
      aiError: { code: 'AI_ERR_TIMEOUT' },
    })
  })
})

describe('testConnection - 连通性测试', () => {
  it('成功后返回延迟、模型与回复', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ model: 'test-model', choices: [{ message: { content: '可用' } }] }))
    const configStore = makeConfigStore()
    const service = createAiService({ configStore, fetchImpl })

    const result = await service.testConnection()
    expect(result.ok).toBe(true)
    expect(result.model).toBe('test-model')
    expect(result.reply).toBe('可用')
    expect(result.encryptionAvailable).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('可携带临时 apiKey（先测后存），且不写入配置', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      expect(init.headers.Authorization).toBe('Bearer sk-temp-key-abcdef')
      return jsonResponse({ model: 'm', choices: [{ message: { content: '可用' } }] })
    })
    const configStore = makeConfigStore({ baseUrl: '', model: '' })
    const service = createAiService({ configStore, fetchImpl })

    const result = await service.testConnection({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiKey: 'sk-temp-key-abcdef',
    })
    expect(result.ok).toBe(true)
    expect(configStore._update).not.toHaveBeenCalled()
  })

  it('缺少密钥时返回 NOT_CONFIGURED', async () => {
    const configStore = makeConfigStore({}, '')
    const service = createAiService({ configStore, fetchImpl: vi.fn() })

    await expect(service.testConnection()).rejects.toMatchObject({
      aiError: { code: 'AI_ERR_NOT_CONFIGURED' },
    })
  })

  it('鉴权失败时抛出结构化 AUTH 错误', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad key' } }, { status: 401 }))
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })

    await expect(service.testConnection()).rejects.toMatchObject({
      aiError: { code: 'AI_ERR_AUTH', retryable: false },
    })
  })

  it('推理型模型只返回思维链时仍判定连通成功，并给出可操作说明', async () => {
    // 小米 MiMo / DeepSeek-R1 等在 max_tokens 偏小时会返回空 content + 有 reasoning_content
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        model: 'mimo-v2.5-pro',
        choices: [
          {
            message: { content: '', reasoning_content: '用户想让我回复「可用」，我直接回复即可…' },
            finish_reason: 'length',
          },
        ],
      }),
    )
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })

    const result = await service.testConnection()
    expect(result.ok).toBe(true)
    expect(result.reply).toBe('')
    expect(result.note).toContain('思维链')
    expect(result.note).toContain('单次最大输出 token')
  })

  it('响应结构非法时仍报错，不会把无效响应当成连通成功', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ unexpected: true }))
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })

    await expect(service.testConnection()).rejects.toMatchObject({
      aiError: { code: 'AI_ERR_BAD_FORMAT' },
    })
  })

  it('连通性测试的输出预算足够推理模型使用（不能被思维链吃光）', async () => {
    const bodies: string[] = []
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(init.body)
      return jsonResponse({ choices: [{ message: { content: '可用' } }] })
    })
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl })
    await service.testConnection()

    const sent = JSON.parse(bodies[0])
    expect(sent.max_tokens).toBeGreaterThanOrEqual(128)
  })
})

describe('配置管理', () => {
  it('updateConfig 校验补丁并同步并发闸门上限', async () => {
    const configStore = makeConfigStore()
    configStore.update = vi.fn(async (patch: Record<string, unknown>) => ({
      ...configStore.getView(),
      ...patch,
      concurrency: 5,
      cacheEnabled: true,
    }))
    const service = createAiService({ configStore, fetchImpl: vi.fn() })

    const view = await service.updateConfig({ baseUrl: 'https://api.openai.com/v1', concurrency: 5 })
    expect(configStore.update).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://api.openai.com/v1', concurrency: 5 }),
    )
    expect(view.concurrency).toBe(5)
    expect(service.gate.limit).toBe(5)
  })

  it('updateConfig 拒绝非法补丁', async () => {
    const service = createAiService({ configStore: makeConfigStore(), fetchImpl: vi.fn() })
    await expect(service.updateConfig({ baseUrl: 'file:///etc/passwd' })).rejects.toMatchObject({
      aiError: { code: 'AI_ERR_BAD_REQUEST' },
    })
  })

  it('关闭缓存时清空已有缓存', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '内容' } }] }))
    const configStore = makeConfigStore()
    const service = createAiService({ configStore, fetchImpl })
    await service.runNonStream(makeRequest())
    expect(service.cache.size).toBe(1)

    configStore.update = vi.fn(async () => ({ ...configStore.getView(), cacheEnabled: false }))
    await service.updateConfig({ cacheEnabled: false })
    expect(service.cache.size).toBe(0)
  })

  it('clearConfig 清空缓存', async () => {
    const configStore = makeConfigStore()
    configStore.clearAll = vi.fn(async () => configStore.getView())
    const service = createAiService({ configStore, fetchImpl: vi.fn() })
    await service.clearConfig()
    expect(configStore.clearAll).toHaveBeenCalled()
    expect(service.cache.size).toBe(0)
  })
})