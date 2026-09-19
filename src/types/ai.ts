/**
 * AI 能力领域类型定义。
 *
 * 跨 IPC 约定：所有运行时错误都以信封（{ ok: false, error }）返回，不通过 throw 传递，
 * 因为 ipcMain.handle 抛出的错误经 Electron 序列化后只剩 message 字符串，
 * code / retryable / httpStatus 会全部丢失。
 */

export type AiCapability = 'generate' | 'optimize' | 'transform'

export type WritingStyle = 'formal' | 'casual' | 'technical' | 'creative' | 'academic'

export type WritingLength = 'short' | 'medium' | 'long'

export type OptimizeAction = 'polish' | 'rewrite' | 'expand' | 'summarize'

export type MaxTokensParam = 'max_tokens' | 'max_completion_tokens'

export type AiErrorCode =
  | 'AI_ERR_NOT_CONFIGURED'
  | 'AI_ERR_NETWORK'
  | 'AI_ERR_TIMEOUT'
  | 'AI_ERR_ABORTED'
  | 'AI_ERR_AUTH'
  | 'AI_ERR_FORBIDDEN'
  | 'AI_ERR_NOT_FOUND'
  | 'AI_ERR_RATE_LIMIT'
  | 'AI_ERR_SERVER'
  | 'AI_ERR_BAD_REQUEST'
  | 'AI_ERR_CONTENT_FILTER'
  | 'AI_ERR_BAD_FORMAT'
  | 'AI_ERR_EMPTY_CONTENT'
  | 'AI_ERR_INPUT_TOO_LONG'
  | 'AI_ERR_ENCRYPTION_UNAVAILABLE'
  | 'AI_ERR_UNKNOWN'

/** IPC 请求载荷：渲染进程只发结构化参数，messages 由主进程构造 */
export interface AiRequestPayload {
  requestId: string
  capability: AiCapability
  topic?: string
  text?: string
  action?: OptimizeAction
  targetStyle?: WritingStyle
  style?: WritingStyle
  length?: WritingLength
  includeOutline?: boolean
  includeExamples?: boolean
  instructions?: string
}

export interface AiUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface AiError {
  code: AiErrorCode
  message: string
  retryable: boolean
  httpStatus?: number
  attempts?: number
}

export interface AiSuccess {
  ok: true
  requestId: string
  capability: AiCapability
  text: string
  title?: string
  model: string
  usage?: AiUsage
  cached: boolean
  latencyMs: number
  firstDeltaMs?: number
}

export interface AiFailure {
  ok: false
  error: AiError
}

export type AiResponse = AiSuccess | AiFailure

export type AiStreamEvent =
  | { requestId: string; type: 'meta'; model: string; cached: boolean; attempt?: number }
  | { requestId: string; type: 'chunk'; delta: string }
  | {
      requestId: string
      type: 'done'
      text: string
      title?: string
      usage?: AiUsage
      model: string
      latencyMs: number
      firstDeltaMs?: number
      cached: boolean
    }
  | { requestId: string; type: 'error'; error: AiError }

/* ================= 配置 ================= */

export interface AiConfigView {
  configured: boolean
  hasKey: boolean
  encryptionAvailable: boolean
  /** safeStorage 不可用时密钥仅本次运行有效，UI 需提示用户 */
  sessionOnlyKey: boolean
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  timeoutMs: number
  stream: boolean
  maxTokensParam: MaxTokensParam
  disableStreamOptions: boolean
  concurrency: number
  maxInputTokens: number
  cacheEnabled: boolean
  consent: boolean
}

export interface AiConfigPatch {
  baseUrl?: string
  /** 空串表示清除密钥；不传表示保留原值 */
  apiKey?: string
  model?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  stream?: boolean
  maxTokensParam?: MaxTokensParam
  disableStreamOptions?: boolean
  concurrency?: number
  maxInputTokens?: number
  cacheEnabled?: boolean
  consent?: boolean
}

/** ai:config:test 的成功返回；失败时返回 AiFailure 信封 */
export interface AiTestResult {
  ok: true
  latencyMs: number
  model: string
  reply: string
  encryptionAvailable: boolean
}

/* ================= 渲染进程客户端接口 ================= */

export interface GenerateInput {
  topic: string
  style: WritingStyle
  length: WritingLength
  includeOutline: boolean
  includeExamples: boolean
}

export interface OptimizeInput {
  action: OptimizeAction
  text: string
  instructions?: string
}

export interface TransformInput {
  text: string
  targetStyle: WritingStyle
  instructions?: string
}

export interface CallOptions {
  signal?: AbortSignal
  /** 跳过读缓存（仍会写缓存），用于「重新生成」 */
  bypassCache?: boolean
  timeoutMs?: number
}

export interface BatchOptions {
  signal?: AbortSignal
  continueOnError?: boolean
}

export interface StreamHandlers {
  onMeta?: (meta: { model: string; cached: boolean; attempt?: number }) => void
  onDelta: (delta: string) => void
  onDone: (result: AiSuccess) => void
  onError: (error: AiError) => void
}

export interface AiStreamHandle {
  requestId: string
  cancel: () => void
  done: Promise<AiResponse>
}