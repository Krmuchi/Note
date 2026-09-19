import { describe, it, expect, vi } from 'vitest'
import { createSseParser, decodeChunk, flushDecoder } from '../../electron/ai/sse-parser.cjs'

const deltaLine = (text: string): string =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`

describe('createSseParser - SSE 流解析', () => {
  it('解析单包 delta 并累积正文', () => {
    const parser = createSseParser()
    const events = parser.push(deltaLine('你好'))
    expect(events).toEqual([{ type: 'delta', delta: '你好' }])
    expect(parser.text).toBe('你好')
    expect(parser.sawDelta).toBe(true)
  })

  it('一个 data 行被 TCP 从中间切开时能拼回', () => {
    const parser = createSseParser()
    const full = deltaLine('跨分片内容')
    const mid = Math.floor(full.length / 2)
    expect(parser.push(full.slice(0, mid))).toEqual([])
    expect(parser.push(full.slice(mid))).toEqual([{ type: 'delta', delta: '跨分片内容' }])
  })

  it('忽略 : keep-alive 注释行、空行与非 data 字段', () => {
    const parser = createSseParser()
    expect(parser.push(': keep-alive\n\n')).toEqual([])
    expect(parser.push('event: message\n\n')).toEqual([])
    expect(parser.push('data:\n\n')).toEqual([])
  })

  it('data: [DONE] 触发 done', () => {
    const parser = createSseParser()
    parser.push(deltaLine('x'))
    const events = parser.push('data: [DONE]\n\n')
    expect(events).toContainEqual({ type: 'done' })
    expect(parser.done).toBe(true)
  })

  it('非法 JSON 行被跳过且不中断整条流', () => {
    const warn = vi.fn()
    const parser = createSseParser({ warn })
    expect(parser.push('data: {不是合法 JSON}\n\n')).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(parser.push(deltaLine('后续正常'))).toEqual([{ type: 'delta', delta: '后续正常' }])
  })

  it('忽略 delta.reasoning_content（思维链不算正文）', () => {
    const parser = createSseParser()
    const events = parser.push(
      `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: '思考中…' } }] })}\n\n`,
    )
    expect(events).toEqual([])
    expect(parser.sawDelta).toBe(false)
    expect(parser.text).toBe('')
  })

  it('usage 仅在带 include_usage 的末包解析', () => {
    const parser = createSseParser()
    const events = parser.push(
      `data: ${JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
      })}\n\n`,
    )
    expect(events).toEqual([
      { type: 'usage', usage: { promptTokens: 5, completionTokens: 7, totalTokens: 12 } },
    ])
    expect(parser.getState().usage).toEqual({ promptTokens: 5, completionTokens: 7, totalTokens: 12 })
  })

  it('末包没有换行时由 flush 处理残留尾行', () => {
    const parser = createSseParser()
    const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: '尾包' } }] })}`
    expect(parser.push(payload)).toEqual([])
    expect(parser.flush()).toEqual([{ type: 'delta', delta: '尾包' }])
    // flush 后 buffer 已清空，重复调用无副作用
    expect(parser.flush()).toEqual([])
  })

  it('中文多字节序列跨 chunk 解码不产生替换字符', () => {
    const bytes = new TextEncoder().encode('中文测试内容跨分片')
    const decoder = new TextDecoder('utf-8')
    const step = Math.ceil(bytes.length / 3)
    let decoded = ''
    for (let i = 0; i < bytes.length; i += step) {
      decoded += decodeChunk(decoder, bytes.slice(i, i + step))
    }
    decoded += flushDecoder(decoder)
    expect(decoded).toBe('中文测试内容跨分片')
    expect(decoded).not.toContain('\uFFFD')
  })
})