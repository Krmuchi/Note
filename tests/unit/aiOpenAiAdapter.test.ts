import { describe, it, expect } from 'vitest'
import {
  normalizeBaseUrl,
  buildChatUrl,
  buildModelsUrl,
  buildHeaders,
  buildModelsHeaders,
  buildChatRequest,
  isStreamOptionsRejection,
  extractErrorDetail,
  parseModelsResponse,
  normalizeMarkdown,
  extractTitle,
  parseChatCompletion,
} from '../../electron/ai/openai-adapter.cjs'

interface CodedError {
  aiError?: { code?: string }
}

function expectCode(fn: () => unknown, code: string): void {
  let caught: CodedError | null = null
  try {
    fn()
  } catch (err) {
    caught = err as CodedError
  }
  expect(caught).not.toBeNull()
  expect(caught?.aiError?.code).toBe(code)
}

describe('normalizeBaseUrl - 覆盖主流服务商', () => {
  it('已是 /v1 结尾时保持原样', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1')
    expect(normalizeBaseUrl('https://api.moonshot.cn/v1')).toBe('https://api.moonshot.cn/v1')
  })

  it('无版本段时补 /v1', () => {
    expect(normalizeBaseUrl('https://api.deepseek.com')).toBe('https://api.deepseek.com/v1')
    expect(normalizeBaseUrl('http://localhost:11434')).toBe('http://localhost:11434/v1')
  })

  it('保留多级路径并去除尾部斜杠', () => {
    expect(normalizeBaseUrl('https://dashscope.aliyuncs.com/compatible-mode/v1/')).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    )
    expect(normalizeBaseUrl('https://api.openai.com/v1///')).toBe('https://api.openai.com/v1')
  })

  it('拒绝非 http/https 协议（SSRF 面收敛）', () => {
    expectCode(() => normalizeBaseUrl('file:///etc/passwd'), 'AI_ERR_BAD_REQUEST')
    expectCode(() => normalizeBaseUrl('javascript:alert(1)'), 'AI_ERR_BAD_REQUEST')
    expectCode(() => normalizeBaseUrl(''), 'AI_ERR_BAD_REQUEST')
    expectCode(() => normalizeBaseUrl('not a url'), 'AI_ERR_BAD_REQUEST')
  })

  it('拼接 chat/completions 路径', () => {
    expect(buildChatUrl('https://api.deepseek.com')).toBe('https://api.deepseek.com/v1/chat/completions')
  })
})

describe('buildChatRequest - 请求体构造', () => {
  const base = { model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }], temperature: 0.5, maxTokens: 800 }

  it('非流式不携带 stream_options', () => {
    const body = buildChatRequest({ ...base, stream: false })
    expect(body.stream).toBe(false)
    expect(body).not.toHaveProperty('stream_options')
    expect(body.max_tokens).toBe(800)
  })

  it('流式默认携带 stream_options.include_usage', () => {
    const body = buildChatRequest({ ...base, stream: true })
    expect(body.stream_options).toEqual({ include_usage: true })
  })

  it('disableStreamOptions 时不带 stream_options', () => {
    const body = buildChatRequest({ ...base, stream: true, disableStreamOptions: true })
    expect(body).not.toHaveProperty('stream_options')
  })

  it('maxTokensParam 可切换为 max_completion_tokens', () => {
    const body = buildChatRequest({ ...base, stream: false, maxTokensParam: 'max_completion_tokens' })
    expect(body.max_completion_tokens).toBe(800)
    expect(body).not.toHaveProperty('max_tokens')
  })

  it('请求头带 Bearer 鉴权与流式 Accept', () => {
    const headers = buildHeaders('sk-test-key-123456', true)
    expect(headers.Authorization).toBe('Bearer sk-test-key-123456')
    expect(headers.Accept).toBe('text/event-stream')
    expect(buildHeaders('k', false).Accept).toBe('application/json')
  })

  it('识别 400 因 stream_options 被拒的场景', () => {
    expect(isStreamOptionsRejection(400, '{"error":{"message":"unknown parameter stream_options"}}')).toBe(true)
    expect(isStreamOptionsRejection(400, '{"error":{"message":"invalid model"}}')).toBe(false)
    expect(isStreamOptionsRejection(500, 'stream_options')).toBe(false)
  })

  it('从错误响应体提取可读 detail', () => {
    expect(extractErrorDetail('{"error":{"message":"model not found"}}')).toBe('model not found')
    expect(extractErrorDetail('{"message":"bad"}')).toBe('bad')
    expect(extractErrorDetail('纯文本错误')).toBe('纯文本错误')
    expect(extractErrorDetail('')).toBe('')
  })
})

describe('normalizeMarkdown - 输出归一化', () => {
  it('CRLF/CR 统一为 LF', () => {
    expect(normalizeMarkdown('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('剥离整体包裹的代码围栏', () => {
    expect(normalizeMarkdown('```markdown\n# 标题\n正文\n```')).toBe('# 标题\n正文')
    expect(normalizeMarkdown('```\n纯内容\n```')).toBe('纯内容')
  })

  it('折叠 3 个以上连续空行', () => {
    expect(normalizeMarkdown('a\n\n\n\n\nb')).toBe('a\n\nb')
  })

  it('不裁剪正文内部的代码块', () => {
    const md = '# 标题\n\n```js\nconst a = 1\n```'
    expect(normalizeMarkdown(md)).toBe(md)
  })
})

describe('extractTitle - 标题抽取', () => {
  it('取首个一级标题', () => {
    expect(extractTitle('# 我的文档\n\n正文')).toBe('我的文档')
  })

  it('无一级标题时回退', () => {
    expect(extractTitle('## 二级标题', '主题')).toBe('主题')
    expect(extractTitle('', '兜底')).toBe('兜底')
  })
})

describe('parseChatCompletion - 非流式响应解析', () => {
  it('解析正文、模型与 usage', () => {
    const result = parseChatCompletion(
      {
        model: 'deepseek-chat',
        choices: [{ message: { role: 'assistant', content: '# 标题\n\n正文' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      },
      { capability: 'generate', topic: '主题' },
    )
    expect(result.text).toBe('# 标题\n\n正文')
    expect(result.title).toBe('标题')
    expect(result.model).toBe('deepseek-chat')
    expect(result.finishReason).toBe('stop')
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 })
  })

  it('兼容 content 为分段数组的返回', () => {
    const result = parseChatCompletion({
      choices: [{ message: { content: [{ type: 'text', text: '第一段' }, { type: 'text', text: '第二段' }] } }],
    })
    expect(result.text).toBe('第一段第二段')
  })

  it('兼容 output_text 风格返回', () => {
    const result = parseChatCompletion({ output_text: '直接文本' })
    expect(result.text).toBe('直接文本')
  })

  it('缺少 choices 时抛 BAD_FORMAT', () => {
    expectCode(() => parseChatCompletion({}), 'AI_ERR_BAD_FORMAT')
    expectCode(() => parseChatCompletion({ choices: [] }), 'AI_ERR_BAD_FORMAT')
    expectCode(() => parseChatCompletion(null), 'AI_ERR_BAD_FORMAT')
  })

  it('finish_reason 为 content_filter 时抛 CONTENT_FILTER', () => {
    expectCode(
      () =>
        parseChatCompletion({
          choices: [{ message: { content: '内容' }, finish_reason: 'content_filter' }],
        }),
      'AI_ERR_CONTENT_FILTER',
    )
  })

  it('正文为空时抛 EMPTY_CONTENT', () => {
    expectCode(
      () => parseChatCompletion({ choices: [{ message: { content: '   \n  ' } }] }),
      'AI_ERR_EMPTY_CONTENT',
    )
  })

  it('非 generate 能力不抽标题', () => {
    const result = parseChatCompletion({ choices: [{ message: { content: '# 标题\n正文' } }] })
    expect(result.title).toBeUndefined()
  })
})

describe('parseChatCompletion - 推理型模型只返回思维链', () => {
  const reasoningOnlyBody = {
    model: 'mimo-v2.5-pro',
    choices: [
      {
        message: { role: 'assistant', content: '', reasoning_content: '让我想想…用户想让我自我介绍。' },
        finish_reason: 'length',
      },
    ],
  }

  it('可见正文为空但存在 reasoning_content 时抛 REASONING_ONLY（而非笼统的 EMPTY_CONTENT）', () => {
    expectCode(() => parseChatCompletion(reasoningOnlyBody), 'AI_ERR_REASONING_ONLY')
  })

  it('错误文案带上当前 max_tokens，便于用户直接调参', () => {
    let caught: { aiError?: { message?: string } } | null = null
    try {
      parseChatCompletion(reasoningOnlyBody, { maxTokens: 256 })
    } catch (err) {
      caught = err as { aiError?: { message?: string } }
    }
    expect(caught?.aiError?.message).toContain('256')
  })

  it('没有 reasoning_content 的空正文仍归类为 EMPTY_CONTENT', () => {
    expectCode(
      () => parseChatCompletion({ choices: [{ message: { content: '   ' }, finish_reason: 'stop' }] }),
      'AI_ERR_EMPTY_CONTENT',
    )
  })

  it('allowEmpty 时不抛错，返回空正文并标记 reasoningOnly（连通性测试用）', () => {
    const result = parseChatCompletion(reasoningOnlyBody, { allowEmpty: true, maxTokens: 256 })
    expect(result.text).toBe('')
    expect(result.reasoningOnly).toBe(true)
    expect(result.finishReason).toBe('length')
    expect(result.model).toBe('mimo-v2.5-pro')
  })

  it('allowEmpty 但响应结构非法时仍抛 BAD_FORMAT（不能把无效响应当连通成功）', () => {
    expectCode(() => parseChatCompletion({ unexpected: true }, { allowEmpty: true }), 'AI_ERR_BAD_FORMAT')
    expectCode(() => parseChatCompletion(null, { allowEmpty: true }), 'AI_ERR_BAD_FORMAT')
  })

  it('allowEmpty 且正常返回正文时照常给出 text', () => {
    const result = parseChatCompletion(
      { choices: [{ message: { content: '可用' } }] },
      { allowEmpty: true, maxTokens: 256 },
    )
    expect(result.text).toBe('可用')
    expect(result.reasoningOnly).toBeUndefined()
  })
})

describe('buildModelsUrl / buildModelsHeaders - 模型列表请求', () => {
  it('拼出 /v1/models，且不会出现重复版本段', () => {
    expect(buildModelsUrl('https://api.deepseek.com')).toBe('https://api.deepseek.com/v1/models')
    expect(buildModelsUrl('https://api.xiaomimimo.com/v1')).toBe('https://api.xiaomimimo.com/v1/models')
    expect(buildModelsUrl('http://localhost:11434')).toBe('http://localhost:11434/v1/models')
    expect(buildModelsUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/models')
  })

  it('有 Key 时带 Bearer，无 Key 时不发 Authorization（本地服务）', () => {
    expect(buildModelsHeaders('sk-abc').Authorization).toBe('Bearer sk-abc')
    expect(buildModelsHeaders('')).not.toHaveProperty('Authorization')
    expect(buildModelsHeaders(undefined)).not.toHaveProperty('Authorization')
    expect(buildModelsHeaders('').Accept).toBe('application/json')
  })
})

describe('parseModelsResponse - 模型列表解析', () => {
  it('解析 OpenAI 标准形状并排序', () => {
    const models = parseModelsResponse({
      object: 'list',
      data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: 'o1' }],
    })
    expect(models).toEqual(['gpt-4o', 'gpt-4o-mini', 'o1'])
  })

  it('兼容 models 数组与 name 字段（Ollama 风格）', () => {
    expect(parseModelsResponse({ models: [{ name: 'qwen2.5:7b' }, { name: 'llama3' }] })).toEqual([
      'llama3',
      'qwen2.5:7b',
    ])
  })

  it('兼容裸数组（字符串或对象）', () => {
    expect(parseModelsResponse(['b', 'a'])).toEqual(['a', 'b'])
    expect(parseModelsResponse([{ id: 'x' }, 'y'])).toEqual(['x', 'y'])
  })

  it('去重、去空白、忽略无 id 的条目', () => {
    const models = parseModelsResponse({
      data: [{ id: 'dup' }, { id: 'dup' }, { id: '  ' }, { id: '' }, {}, { id: 'other' }, 'dup'],
    })
    expect(models).toEqual(['dup', 'other'])
  })

  it('形状无法识别或没有有效模型时抛 BAD_FORMAT', () => {
    expectCode(() => parseModelsResponse(null), 'AI_ERR_BAD_FORMAT')
    expectCode(() => parseModelsResponse({ object: 'list' }), 'AI_ERR_BAD_FORMAT')
    expectCode(() => parseModelsResponse({ data: [] }), 'AI_ERR_BAD_FORMAT')
    expectCode(() => parseModelsResponse({ data: [{ noId: 1 }] }), 'AI_ERR_BAD_FORMAT')
    expectCode(() => parseModelsResponse('oops'), 'AI_ERR_BAD_FORMAT')
  })
})