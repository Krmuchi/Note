/**
 * 流式会话注册表。
 *
 * 设计要点（每一条都对应一个真实会踩的坑）：
 * 1. requestId 由**渲染进程**生成：主进程生成会存在丢首包竞态 —— 首个 chunk 可能在
 *    ipcRenderer.invoke 尚未 resolve、前端还不知道 requestId 时就发出。因此这里
 *    **先注册回调、再发出启动请求**（由 aiClient 保证顺序）。
 * 2. 单通道 + requestId 多路复用：不使用动态通道名（preload 无法做白名单），
 *    也绝不每次调用都 ipcRenderer.on + removeListener（并发 10 个流即触发
 *    MaxListenersExceededWarning）。
 * 3. 四条路径都必须释放注册表：done / error / cancel / 组件卸载。任一漏掉都会让
 *    Map 随会话无限增长。
 * 4. 增量按帧合流：chunk 先写入 buffer，用 requestAnimationFrame 节流后一次性回调，
 *    避免每个 chunk 触发一次 React 重渲染。
 */

import type {
  AiCapability,
  AiError,
  AiResponse,
  AiStreamEvent,
  AiStreamHandle,
  AiSuccess,
  StreamHandlers,
} from '@/types/ai'

import { createAbortedError } from './errors'

interface Session {
  requestId: string
  capability: AiCapability
  handlers: StreamHandlers
  buffer: string
  cancelFrame: (() => void) | null
  settled: boolean
  resolveDone: (result: AiResponse) => void
  unsubscribe: (() => void) | null
}

const sessions = new Map<string, Session>()

export function createRequestId(): string {
  const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID()
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function getActiveStreamCount(): number {
  return sessions.size
}

function getNotesApi(): Window['notesApi'] | null {
  if (typeof window === 'undefined') return null
  const api = window.notesApi
  if (!api || typeof api.aiStreamSubscribe !== 'function' || typeof api.aiCancel !== 'function') return null
  return api
}

function flushBuffered(session: Session): void {
  if (session.cancelFrame) {
    session.cancelFrame()
    session.cancelFrame = null
  }
  if (!session.buffer) return
  const delta = session.buffer
  session.buffer = ''
  session.handlers.onDelta(delta)
}

function scheduleFlush(session: Session): void {
  if (session.cancelFrame) return
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(() => {
      session.cancelFrame = null
      flushBuffered(session)
    })
    session.cancelFrame = () => cancelAnimationFrame(id)
    return
  }
  const id = setTimeout(() => {
    session.cancelFrame = null
    flushBuffered(session)
  }, 16)
  session.cancelFrame = () => clearTimeout(id)
}

function releaseSession(session: Session): void {
  if (session.cancelFrame) {
    session.cancelFrame()
    session.cancelFrame = null
  }
  if (session.unsubscribe) {
    const unsubscribe = session.unsubscribe
    session.unsubscribe = null
    unsubscribe()
  }
  sessions.delete(session.requestId)
}

function buildSuccess(session: Session, event: Extract<AiStreamEvent, { type: 'done' }>): AiSuccess {
  const success: AiSuccess = {
    ok: true,
    requestId: session.requestId,
    capability: session.capability,
    text: event.text,
    model: event.model,
    cached: event.cached,
    latencyMs: event.latencyMs,
  }
  if (event.title !== undefined) success.title = event.title
  if (event.usage !== undefined) success.usage = event.usage
  if (event.firstDeltaMs !== undefined) success.firstDeltaMs = event.firstDeltaMs
  return success
}

/** 结算会话：先冲刷残留增量，再释放注册表，最后回调，保证释放一定发生 */
function settle(session: Session, result: AiResponse): void {
  if (session.settled) return
  session.settled = true
  flushBuffered(session)
  releaseSession(session)
  if (result.ok) session.handlers.onDone(result)
  else session.handlers.onError(result.error)
  session.resolveDone(result)
}

/** 模块级单例回调：preload 只注册一次监听，靠 requestId 分发 */
function dispatchStreamEvent(event: AiStreamEvent): void {
  const session = sessions.get(event.requestId)
  if (!session || session.settled) return

  switch (event.type) {
    case 'meta':
      session.handlers.onMeta?.({
        model: event.model,
        cached: event.cached,
        ...(event.attempt !== undefined ? { attempt: event.attempt } : null),
      })
      return
    case 'chunk':
      session.buffer += event.delta
      scheduleFlush(session)
      return
    case 'done':
      settle(session, buildSuccess(session, event))
      return
    case 'error':
      settle(session, { ok: false, error: event.error })
      return
  }
}

export interface StreamSession {
  requestId: string
  handle: AiStreamHandle
  /** 启动阶段（ai:stream:start）失败时直接结算 */
  fail: (error: AiError) => void
  isSettled: () => boolean
}

/**
 * 打开一个流式会话并注册事件回调。
 * 调用方必须在**之后**才发出 ai:stream:start，否则可能丢首包。
 */
export function openStreamSession(params: {
  capability: AiCapability
  handlers: StreamHandlers
  requestId: string
}): StreamSession {
  const { requestId, capability, handlers } = params

  let resolveDone: (result: AiResponse) => void = () => {}
  const done = new Promise<AiResponse>((resolve) => {
    resolveDone = resolve
  })

  const session: Session = {
    requestId,
    capability,
    handlers,
    buffer: '',
    cancelFrame: null,
    settled: false,
    resolveDone,
    unsubscribe: null,
  }
  sessions.set(requestId, session)

  const api = getNotesApi()
  if (api) {
    session.unsubscribe = api.aiStreamSubscribe(requestId, dispatchStreamEvent)
  }

  const handle: AiStreamHandle = {
    requestId,
    cancel: () => {
      if (session.settled) return
      // 先本地结算，保证句柄与注册表一定被释放（即使主进程无响应）；
      // 再把取消意图发给主进程，避免上游继续消耗配额。
      settle(session, { ok: false, error: createAbortedError() })
      void api?.aiCancel(requestId).catch(() => {
        /* 通道异常时忽略：本地已结算，不影响用户体验 */
      })
    },
    done,
  }

  return {
    requestId,
    handle,
    fail: (error: AiError) => settle(session, { ok: false, error }),
    isSettled: () => session.settled,
  }
}

/** 取消所有在途流（弹窗关闭、页面卸载时调用，避免后台继续跑并 setState） */
export function cancelAllStreams(): void {
  for (const session of Array.from(sessions.values())) {
    if (session.settled) continue
    const api = getNotesApi()
    settle(session, { ok: false, error: createAbortedError() })
    void api?.aiCancel(session.requestId).catch(() => {
      /* 同上 */
    })
  }
}