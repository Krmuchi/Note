/**
 * AI 统一对外接口。
 *
 * UI 只依赖这个模块，不直接接触 IPC。职责：
 * - 把「文本生成 / 内容优化 / 风格转换」三种能力映射成结构化请求载荷；
 * - 渲染侧同 key 去重（防止连点导致重复请求）；结果缓存以主进程为权威，这里不存副本；
 * - 把 IPC 拒绝、异常统一转成结构化 AiError，保证 UI 永远拿到中文提示。
 *
 * 注意：messages 由主进程构造，渲染进程只发结构化参数 —— 这样 payload 白名单简单、
 * 缓存键稳定，也无法注入任意 system prompt。
 */

import type {
  AiConfigPatch,
  AiConfigView,
  AiFailure,
  AiModelsResult,
  AiRequestPayload,
  AiResponse,
  AiStreamHandle,
  AiTestResult,
  BatchOptions,
  CallOptions,
  GenerateInput,
  OptimizeInput,
  StreamHandlers,
  TransformInput,
} from '@/types/ai'

import { createAbortedError, fallbackMessage, isAiFailure, normalizeAiError } from './errors'
import { createRequestId, openStreamSession } from './stream'

export type AiTaskSpec =
  | ({ capability: 'generate' } & GenerateInput)
  | ({ capability: 'optimize' } & OptimizeInput)
  | ({ capability: 'transform' } & TransformInput)

const NOT_AVAILABLE: AiFailure = {
  ok: false,
  error: {
    code: 'AI_ERR_UNKNOWN',
    message: '当前环境不支持 AI 能力，请在桌面应用中使用',
    retryable: false,
  },
}

function getApi(): Window['notesApi'] | null {
  if (typeof window === 'undefined') return null
  const api = window.notesApi
  if (
    !api ||
    typeof api.aiGenerate !== 'function' ||
    typeof api.aiConfigGet !== 'function' ||
    typeof api.aiStreamStart !== 'function'
  ) {
    return null
  }
  return api
}

function failure(error: unknown): AiFailure {
  return { ok: false, error: normalizeAiError(error) }
}

function buildPayload(task: AiTaskSpec, requestId: string): AiRequestPayload {
  if (task.capability === 'generate') {
    const payload: AiRequestPayload = {
      requestId,
      capability: 'generate',
      topic: task.topic,
      style: task.style,
      length: task.length,
      includeOutline: task.includeOutline,
      includeExamples: task.includeExamples,
    }
    if (task.instructions) payload.instructions = task.instructions
    return payload
  }

  if (task.capability === 'optimize') {
    const payload: AiRequestPayload = {
      requestId,
      capability: 'optimize',
      action: task.action,
      text: task.text,
    }
    if (task.instructions) payload.instructions = task.instructions
    return payload
  }

  const payload: AiRequestPayload = {
    requestId,
    capability: 'transform',
    targetStyle: task.targetStyle,
    text: task.text,
  }
  if (task.instructions) payload.instructions = task.instructions
  return payload
}

/**
 * 渲染侧同 key 去重。相同参数在途时复用同一个 Promise，避免用户连点「生成」
 * 造成重复请求与重复计费。注意这不是结果缓存 —— 结果缓存只存在于主进程。
 */
const inFlight = new Map<string, Promise<AiResponse>>()

function dedupeKey(task: AiTaskSpec, bypassCache: boolean): string {
  const payload = buildPayload(task, '')
  return JSON.stringify([
    payload.capability,
    payload.topic ?? '',
    payload.text ?? '',
    payload.action ?? '',
    payload.targetStyle ?? '',
    payload.style ?? '',
    payload.length ?? '',
    payload.includeOutline === true,
    payload.includeExamples === true,
    payload.instructions ?? '',
    bypassCache,
  ])
}

/**
 * 非流式调用。
 *
 * CallOptions 契约（旧实现把 signal/timeoutMs 静默丢弃，调用方以为能取消/限时，实际不能）：
 * - signal：已 abort 直接返回 ABORTED；在途 abort 立即以 ABORTED 结算，不再等待底层请求；
 * - timeoutMs：等待超过该时长立即以 TIMEOUT 结算；
 * - 两者触发时都会 best-effort 发 ai:cancel(requestId) 通知主进程中止底层 fetch
 *   （主进程对未登记的 requestId 返回 cancelled:false，无副作用）。
 * - 带 signal/timeoutMs 的请求**不参与同 key 去重**：一个调用方的取消/超时
 *   不能把复用同一 Promise 的其他调用方一起结算掉。
 */
async function invokeNonStream(task: AiTaskSpec, options?: CallOptions): Promise<AiResponse> {
  const api = getApi()
  if (!api) return NOT_AVAILABLE

  const signal = options?.signal
  const timeoutMs = options?.timeoutMs !== undefined && options.timeoutMs > 0 ? options.timeoutMs : null
  const bypassCache = options?.bypassCache === true

  if (signal?.aborted) return failure(createAbortedError())

  const dedupe = !signal && timeoutMs === null
  const key = dedupeKey(task, bypassCache)
  if (dedupe) {
    const pending = inFlight.get(key)
    if (pending) return pending
  }

  const requestId = createRequestId()
  const request = (async (): Promise<AiResponse> => {
    try {
      const result = await api.aiGenerate({ ...buildPayload(task, requestId), bypassCache })
      return isAiFailure(result) ? failure(result.error) : result
    } catch (err) {
      return failure(err)
    } finally {
      if (dedupe) inFlight.delete(key)
    }
  })()

  if (dedupe) {
    inFlight.set(key, request)
    return request
  }

  // 取消/超时与底层请求赛跑：先结算者生效，后到的结果被忽略
  return new Promise<AiResponse>((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (response: AiResponse): void => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(response)
    }
    const cancelUnderlying = (): void => {
      if (typeof api.aiCancel === 'function') {
        void api.aiCancel(requestId).catch(() => {
          /* best-effort：通道异常不影响本地已结算的结果 */
        })
      }
    }
    const onAbort = (): void => {
      cancelUnderlying()
      finish(failure(createAbortedError()))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    if (timeoutMs !== null) {
      timer = setTimeout(() => {
        cancelUnderlying()
        finish(failure({ code: 'AI_ERR_TIMEOUT', message: fallbackMessage('AI_ERR_TIMEOUT'), retryable: true }))
      }, timeoutMs)
    }
    void request.then(finish)
  })
}

async function getConfig(): Promise<AiConfigView | AiFailure> {
  const api = getApi()
  if (!api) return NOT_AVAILABLE
  try {
    const result = await api.aiConfigGet()
    return isAiFailure(result) ? failure(result.error) : result
  } catch (err) {
    return failure(err)
  }
}

async function setConfig(patch: AiConfigPatch): Promise<AiConfigView | AiFailure> {
  const api = getApi()
  if (!api) return NOT_AVAILABLE
  try {
    const result = await api.aiConfigSet(patch)
    return isAiFailure(result) ? failure(result.error) : result
  } catch (err) {
    return failure(err)
  }
}

async function clearConfig(): Promise<AiConfigView | AiFailure> {
  const api = getApi()
  if (!api) return NOT_AVAILABLE
  try {
    const result = await api.aiConfigClear()
    return isAiFailure(result) ? failure(result.error) : result
  } catch (err) {
    return failure(err)
  }
}

async function testConfig(patch?: AiConfigPatch): Promise<AiTestResult | AiFailure> {
  const api = getApi()
  if (!api) return NOT_AVAILABLE
  try {
    const result = await api.aiConfigTest(patch)
    return isAiFailure(result) ? failure(result.error) : result
  } catch (err) {
    return failure(err)
  }
}

/**
 * 拉取服务商当前提供的模型列表。
 * 可携带未保存的 baseUrl / apiKey（「先看列表再保存」场景）。
 */
async function listModels(patch?: AiConfigPatch): Promise<AiModelsResult | AiFailure> {
  const api = getApi()
  if (!api || typeof api.aiListModels !== 'function') return NOT_AVAILABLE
  try {
    const result = await api.aiListModels(patch)
    return isAiFailure(result) ? failure(result.error) : result
  } catch (err) {
    return failure(err)
  }
}

/**
 * 启动流式生成。**同步返回句柄**，错误通过 handlers.onError 与 handle.done 反馈。
 */
function stream(task: AiTaskSpec, handlers: StreamHandlers, options?: CallOptions): AiStreamHandle {
  const api = getApi()
  const requestId = createRequestId()

  // 先注册回调，再发出启动请求 —— 否则首个 chunk 可能因为前端还不知道 requestId 而丢失
  const session = openStreamSession({ capability: task.capability, handlers, requestId })

  // 流式依赖 aiStreamSubscribe + aiCancel 两个通道。
  // 只检查 window.notesApi 存在是不够的：preload 版本不匹配时（例如升级后旧 preload 仍被加载），
  // 这两个方法可能缺失，openStreamSession 会注册不上回调，
  // 主进程照常开始推流，而前端 handle.done 永不 settle —— 表现为界面永久"生成中"。
  if (!api || typeof api.aiStreamSubscribe !== 'function' || typeof api.aiCancel !== 'function') {
    session.fail(NOT_AVAILABLE.error)
    return session.handle
  }

  const signal = options?.signal
  if (signal) {
    if (signal.aborted) {
      session.handle.cancel()
      return session.handle
    }
    const onAbort = (): void => session.handle.cancel()
    signal.addEventListener('abort', onAbort, { once: true })
    // 必须移除，否则跨请求累积监听器
    void session.handle.done.finally(() => signal.removeEventListener('abort', onAbort))
  }

  void api
    .aiStreamStart(buildPayload(task, requestId))
    .then((result) => {
      if (session.isSettled()) {
        // 启动尚未返回时用户已取消，补发取消意图给主进程
        void api.aiCancel(requestId).catch(() => {
          /* 本地已结算，忽略通道异常 */
        })
        return
      }
      if (isAiFailure(result)) session.fail(result.error)
    })
    .catch((err: unknown) => {
      if (!session.isSettled()) session.fail(normalizeAiError(err))
    })

  return session.handle
}

/**
 * 批量执行。单项失败不影响其他项；若整个批次被主进程拒绝（如超长、参数非法），
 * 则每一项都返回同一个错误，保证返回值长度与入参一致。
 */
async function batch(tasks: AiTaskSpec[], options?: BatchOptions): Promise<AiResponse[]> {
  if (tasks.length === 0) return []
  const api = getApi()
  if (!api) return tasks.map(() => NOT_AVAILABLE)
  if (options?.signal?.aborted) return tasks.map(() => failure(createAbortedError()))

  try {
    const payloads = tasks.map((task) => buildPayload(task, createRequestId()))
    const result = await api.aiBatch(payloads, { bypassCache: options?.bypassCache === true })
    if (isAiFailure(result)) {
      return tasks.map(() => failure(result.error))
    }
    return result.results
  } catch (err) {
    return tasks.map(() => failure(err))
  }
}

export const aiClient = {
  generate(input: GenerateInput, options?: CallOptions): Promise<AiResponse> {
    return invokeNonStream({ capability: 'generate', ...input }, options)
  },

  optimize(input: OptimizeInput, options?: CallOptions): Promise<AiResponse> {
    return invokeNonStream({ capability: 'optimize', ...input }, options)
  },

  transform(input: TransformInput, options?: CallOptions): Promise<AiResponse> {
    return invokeNonStream({ capability: 'transform', ...input }, options)
  },

  stream,
  batch,

  config: {
    get: getConfig,
    set: setConfig,
    clear: clearConfig,
    test: testConfig,
    listModels,
  },
}

export type AiClient = typeof aiClient