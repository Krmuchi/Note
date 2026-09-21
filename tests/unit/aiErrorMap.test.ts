import { describe, it, expect } from 'vitest'
import {
  AI_ERROR_CODES,
  RETRYABLE_CODES,
  formatMessage,
  isRetryable,
  aiError,
  toAiError,
  classifyHttpStatus,
  classifyException,
  redactSecrets,
} from '../../electron/ai/error-map.cjs'

describe('错误码元数据', () => {
  it('每个错误码都有非空中文文案且不残留占位符', () => {
    for (const code of Object.values(AI_ERROR_CODES)) {
      const message = formatMessage(code as string)
      expect(typeof message).toBe('string')
      expect(message.length).toBeGreaterThan(0)
      expect(message).not.toMatch(/[{}]/)
    }
  })

  it('可重试集合符合设计', () => {
    expect(isRetryable(AI_ERROR_CODES.NETWORK)).toBe(true)
    expect(isRetryable(AI_ERROR_CODES.TIMEOUT)).toBe(true)
    expect(isRetryable(AI_ERROR_CODES.RATE_LIMIT)).toBe(true)
    expect(isRetryable(AI_ERROR_CODES.SERVER)).toBe(true)
    expect(isRetryable(AI_ERROR_CODES.BAD_FORMAT)).toBe(true)
    expect(isRetryable(AI_ERROR_CODES.EMPTY_CONTENT)).toBe(true)

    expect(isRetryable(AI_ERROR_CODES.AUTH)).toBe(false)
    expect(isRetryable(AI_ERROR_CODES.FORBIDDEN)).toBe(false)
    expect(isRetryable(AI_ERROR_CODES.NOT_FOUND)).toBe(false)
    expect(isRetryable(AI_ERROR_CODES.CONTENT_FILTER)).toBe(false)
    expect(isRetryable(AI_ERROR_CODES.ABORTED)).toBe(false)
    expect(isRetryable(AI_ERROR_CODES.INPUT_TOO_LONG)).toBe(false)
    expect(isRetryable(AI_ERROR_CODES.NOT_CONFIGURED)).toBe(false)
    // 思维链吃光 token 是配置问题，重试无用
    expect(isRetryable(AI_ERROR_CODES.REASONING_ONLY)).toBe(false)
  })

  it('REASONING_ONLY 文案给出可操作的调整方向', () => {
    const message = formatMessage(AI_ERROR_CODES.REASONING_ONLY, { n: 256 })
    expect(message).toContain('256')
    expect(message).toContain('单次最大输出 token')
    expect(message).not.toMatch(/[{}]/)
  })

  it('变量被正确渲染进文案', () => {
    expect(formatMessage(AI_ERROR_CODES.SERVER, { status: 503 })).toContain('503')
    expect(formatMessage(AI_ERROR_CODES.BAD_REQUEST, { detail: 'model 不存在' })).toContain('model 不存在')
    expect(formatMessage(AI_ERROR_CODES.TIMEOUT, { n: 30 })).toContain('30')
  })

  it('缺失变量时用兜底值填充，不输出空占位', () => {
    const message = formatMessage(AI_ERROR_CODES.UNKNOWN)
    expect(message).toBe('生成失败：未知错误')
  })

  it('aiError 产出结构化对象并附带 httpStatus', () => {
    const error = aiError(AI_ERROR_CODES.RATE_LIMIT, { httpStatus: 429, attempts: 3 })
    expect(error).toEqual({
      code: 'AI_ERR_RATE_LIMIT',
      message: '请求过于频繁或已达配额上限，请稍后重试',
      retryable: true,
      httpStatus: 429,
      attempts: 3,
    })
  })

  it('未知错误码回退为 UNKNOWN', () => {
    expect(aiError('AI_ERR_NOT_EXIST').code).toBe('AI_ERR_UNKNOWN')
  })

  it('toAiError 优先取异常上挂载的结构化错误', () => {
    const err = new Error('包装信息')
    ;(err as unknown as { aiError: unknown }).aiError = aiError(AI_ERROR_CODES.CONTENT_FILTER)
    expect(toAiError(err).code).toBe('AI_ERR_CONTENT_FILTER')
  })

  it('toAiError 对普通异常落 UNKNOWN 并带上原始信息', () => {
    const result = toAiError(new Error('莫名其妙'))
    expect(result.code).toBe('AI_ERR_UNKNOWN')
    expect(result.message).toContain('莫名其妙')
    expect(result.retryable).toBe(false)
  })
})

describe('HTTP 状态码分类', () => {
  it('按状态码映射到对应错误码', () => {
    expect(classifyHttpStatus(400)).toBe(AI_ERROR_CODES.BAD_REQUEST)
    expect(classifyHttpStatus(401)).toBe(AI_ERROR_CODES.AUTH)
    expect(classifyHttpStatus(403)).toBe(AI_ERROR_CODES.FORBIDDEN)
    expect(classifyHttpStatus(404)).toBe(AI_ERROR_CODES.NOT_FOUND)
    expect(classifyHttpStatus(408)).toBe(AI_ERROR_CODES.TIMEOUT)
    expect(classifyHttpStatus(422)).toBe(AI_ERROR_CODES.BAD_REQUEST)
    expect(classifyHttpStatus(429)).toBe(AI_ERROR_CODES.RATE_LIMIT)
    expect(classifyHttpStatus(500)).toBe(AI_ERROR_CODES.SERVER)
    expect(classifyHttpStatus(503)).toBe(AI_ERROR_CODES.SERVER)
  })

  it('400 且响应体含安全策略关键词时归类为内容过滤', () => {
    expect(classifyHttpStatus(400, 'request blocked by content_policy')).toBe(AI_ERROR_CODES.CONTENT_FILTER)
    expect(classifyHttpStatus(400, '触发安全策略，内容涉嫌违规')).toBe(AI_ERROR_CODES.CONTENT_FILTER)
    expect(classifyHttpStatus(400, 'invalid model')).toBe(AI_ERROR_CODES.BAD_REQUEST)
  })
})

describe('异常分类', () => {
  it('用户取消优先于超时判定', () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' })
    expect(classifyException(abortError, { userCancelled: true, timedOut: true })).toBe(AI_ERROR_CODES.ABORTED)
    expect(classifyException(abortError, { userCancelled: true })).toBe(AI_ERROR_CODES.ABORTED)
    expect(classifyException(abortError, { timedOut: true })).toBe(AI_ERROR_CODES.TIMEOUT)
    expect(classifyException(abortError, {})).toBe(AI_ERROR_CODES.TIMEOUT)
  })

  it('TypeError 归类为网络错误', () => {
    expect(classifyException(new TypeError('fetch failed'))).toBe(AI_ERROR_CODES.NETWORK)
  })

  it('已挂载结构化错误的异常直接取其错误码', () => {
    const err = Object.assign(new Error('x'), { aiError: aiError(AI_ERROR_CODES.BAD_FORMAT) })
    expect(classifyException(err)).toBe(AI_ERROR_CODES.BAD_FORMAT)
  })

  it('其他异常落 UNKNOWN', () => {
    expect(classifyException(new Error('???'), {})).toBe(AI_ERROR_CODES.UNKNOWN)
  })
})

describe('日志脱敏', () => {
  it('遮蔽 API Key 与 Bearer 头', () => {
    const text = 'Authorization: Bearer sk-abcdefgh12345678 failed, {"apiKey":"sk-secret-value-1234"}'
    const redacted = redactSecrets(text)
    expect(redacted).not.toContain('sk-abcdefgh12345678')
    expect(redacted).not.toContain('sk-secret-value-1234')
    expect(redacted).toContain('***')
  })

  it('非字符串输入安全返回空串', () => {
    expect(redactSecrets(undefined as unknown as string)).toBe('')
  })
})

describe('重试码集合与元数据一致性', () => {
  it('RETRYABLE_CODES 全部标记为可重试', () => {
    expect(RETRYABLE_CODES.length).toBeGreaterThan(0)
    RETRYABLE_CODES.forEach((code: string) => expect(isRetryable(code)).toBe(true))
  })
})