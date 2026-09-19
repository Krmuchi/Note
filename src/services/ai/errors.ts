/**
 * 渲染侧错误兜底。
 *
 * 正常情况下错误文案已由主进程 error-map.cjs 生成好中文，这里只负责：
 * 1. 把 IPC 通道本身被拒绝（preload 未加载、通道不存在）等情况转成结构化 AiError；
 * 2. 万一主进程返回的 code 未知，提供中文兜底文案，避免 UI 出现英文堆栈。
 */

import type { AiError, AiErrorCode, AiFailure } from '@/types/ai'

const FALLBACK_MESSAGES: Record<AiErrorCode, string> = {
  AI_ERR_NOT_CONFIGURED: '尚未配置 AI 服务，请前往「设置 → AI」完成配置',
  AI_ERR_NETWORK: '网络连接失败，请检查网络或接口地址是否正确',
  AI_ERR_TIMEOUT: '请求超时，请稍后重试',
  AI_ERR_ABORTED: '已取消生成',
  AI_ERR_AUTH: 'API Key 无效或已过期，请重新配置',
  AI_ERR_FORBIDDEN: '无访问权限：可能是 Key 权限不足、模型未开通或账户余额不足',
  AI_ERR_NOT_FOUND: '接口地址或模型名称不存在，请检查配置',
  AI_ERR_RATE_LIMIT: '请求过于频繁或已达配额上限，请稍后重试',
  AI_ERR_SERVER: 'AI 服务暂时不可用，请稍后重试',
  AI_ERR_BAD_REQUEST: '请求参数被服务端拒绝，请检查配置',
  AI_ERR_CONTENT_FILTER: '内容被模型安全策略拦截，请调整输入后再试',
  AI_ERR_BAD_FORMAT: '服务返回格式异常，可能不是 OpenAI 兼容接口',
  AI_ERR_EMPTY_CONTENT: '模型没有返回内容，请重试或更换模型',
  AI_ERR_INPUT_TOO_LONG: '输入内容过长，请缩短后重试',
  AI_ERR_ENCRYPTION_UNAVAILABLE: '当前系统不支持安全存储，API Key 仅本次运行有效',
  AI_ERR_UNKNOWN: '生成失败，请稍后重试',
}

/**
 * 判定信封是否为失败。对所有 AI 通道返回值统一有效：
 * AiConfigView 没有 ok 字段，因此不会被误判为失败。
 */
export function isAiFailure(value: unknown): value is AiFailure {
  return !!value && typeof value === 'object' && (value as { ok?: unknown }).ok === false
}

export function isAiErrorCode(value: unknown): value is AiErrorCode {
  return typeof value === 'string' && value in FALLBACK_MESSAGES
}

export function fallbackMessage(code: AiErrorCode): string {
  return FALLBACK_MESSAGES[code] ?? FALLBACK_MESSAGES.AI_ERR_UNKNOWN
}

/** 把任意异常/未知形状统一转成结构化 AiError */
export function normalizeAiError(err: unknown): AiError {
  if (err && typeof err === 'object') {
    const candidate = err as Partial<AiError>
    if (isAiErrorCode(candidate.code)) {
      const error: AiError = {
        code: candidate.code,
        message:
          typeof candidate.message === 'string' && candidate.message
            ? candidate.message
            : fallbackMessage(candidate.code),
        retryable: candidate.retryable === true,
      }
      if (typeof candidate.httpStatus === 'number') error.httpStatus = candidate.httpStatus
      if (typeof candidate.attempts === 'number') error.attempts = candidate.attempts
      return error
    }
  }
  const message = err instanceof Error && err.message ? err.message : FALLBACK_MESSAGES.AI_ERR_UNKNOWN
  return { code: 'AI_ERR_UNKNOWN', message, retryable: false }
}

export function createAbortedError(): AiError {
  return { code: 'AI_ERR_ABORTED', message: FALLBACK_MESSAGES.AI_ERR_ABORTED, retryable: false }
}

/** 是否应展示「重试」按钮 */
export function shouldOfferRetry(error: AiError): boolean {
  return error.retryable && error.code !== 'AI_ERR_ABORTED'
}