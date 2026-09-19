import { describe, it, expect } from 'vitest'
import {
  TEMPLATE_VERSION,
  STYLE_KEYS,
  LENGTH_KEYS,
  ACTION_KEYS,
  STYLE_SYSTEM,
  STYLE_TEMPERATURE,
  LENGTH_MAX_TOKENS,
  ACTION_INSTRUCTION,
  ACTION_TEMPERATURE,
  OUTPUT_CONSTRAINT,
  buildMessages,
  resolveParams,
} from '../../electron/ai/prompt-templates.cjs'
import {
  WRITING_STYLES,
  WRITING_LENGTHS,
  OPTIMIZE_ACTIONS,
  AI_CAPABILITIES,
} from '@/services/ai/prompts'

describe('prompt 模板与渲染端选项的 key 集合一致性（防双源漂移）', () => {
  it('风格 key 集合一致', () => {
    expect(STYLE_KEYS).toEqual(WRITING_STYLES.map((o) => o.value))
  })

  it('长度 key 集合一致', () => {
    expect(LENGTH_KEYS).toEqual(WRITING_LENGTHS.map((o) => o.value))
  })

  it('优化动作 key 集合一致', () => {
    expect(ACTION_KEYS).toEqual(OPTIMIZE_ACTIONS.map((o) => o.value))
  })

  it('能力枚举与客户端声明一致', () => {
    for (const capability of AI_CAPABILITIES) {
      expect(() =>
        buildMessages(
          capability === 'generate'
            ? { capability, topic: '主题', style: 'formal', length: 'short' }
            : capability === 'optimize'
              ? { capability, text: '原文', action: 'polish' }
              : { capability, text: '原文', targetStyle: 'technical' },
        ),
      ).not.toThrow()
    }
  })
})

describe('prompt 模板', () => {
  it('TEMPLATE_VERSION 非空（缓存 key 依赖它）', () => {
    expect(typeof TEMPLATE_VERSION).toBe('string')
    expect(TEMPLATE_VERSION.length).toBeGreaterThan(0)
  })

  it('5 种风格的 system prompt 均非空且两两不同', () => {
    const prompts = STYLE_KEYS.map((key: string) => STYLE_SYSTEM[key])
    prompts.forEach((p: string) => expect(typeof p === 'string' && p.length > 20).toBe(true))
    expect(new Set(prompts).size).toBe(STYLE_KEYS.length)
  })

  it('生成能力的 system 追加输出约束，用户文本只进 user message', () => {
    const messages = buildMessages({ capability: 'generate', topic: '如何提高效率', style: 'formal', length: 'medium' })
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain(OUTPUT_CONSTRAINT)
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toContain('如何提高效率')
    expect(messages[1].content).toContain('正式')
    expect(messages[0].content).not.toContain('如何提高效率')
  })

  it('生成能力的 user prompt 反映大纲与示例选项', () => {
    const withExtras = buildMessages({
      capability: 'generate',
      topic: 'T',
      style: 'casual',
      length: 'long',
      includeOutline: true,
      includeExamples: true,
    })
    expect(withExtras[1].content).toContain('包含文档大纲')
    expect(withExtras[1].content).toContain('包含示例内容')

    const withoutExtras = buildMessages({ capability: 'generate', topic: 'T', style: 'casual', length: 'long' })
    expect(withoutExtras[1].content).toContain('不需要文档大纲')
    expect(withoutExtras[1].content).toContain('不需要示例内容')
  })

  it('优化能力的 prompt 内含原文与对应指令', () => {
    const messages = buildMessages({ capability: 'optimize', text: '待润色的原文', action: 'polish' })
    expect(messages[0].content).toBe(OUTPUT_CONSTRAINT)
    expect(messages[1].content).toContain(ACTION_INSTRUCTION.polish)
    expect(messages[1].content).toContain('待润色的原文')
  })

  it('风格转换的 prompt 含目标风格与原文', () => {
    const messages = buildMessages({ capability: 'transform', text: '原文内容', targetStyle: 'academic' })
    expect(messages[0].content).toContain(STYLE_SYSTEM.academic)
    expect(messages[0].content).toContain('不得增删任何事实信息')
    expect(messages[1].content).toContain('学术')
    expect(messages[1].content).toContain('原文内容')
  })

  it('未知能力类型抛错', () => {
    expect(() => buildMessages({ capability: 'unknown' })).toThrow()
  })

  it('四个优化动作都有非空指令', () => {
    ACTION_KEYS.forEach((key: string) => {
      expect(typeof ACTION_INSTRUCTION[key]).toBe('string')
      expect(ACTION_INSTRUCTION[key].length).toBeGreaterThan(10)
    })
  })
})

describe('参数映射', () => {
  it('所有 temperature 落在 0..2', () => {
    Object.values(STYLE_TEMPERATURE).forEach((t) => {
      expect(t as number).toBeGreaterThanOrEqual(0)
      expect(t as number).toBeLessThanOrEqual(2)
    })
    Object.values(ACTION_TEMPERATURE).forEach((t) => {
      expect(t as number).toBeGreaterThanOrEqual(0)
      expect(t as number).toBeLessThanOrEqual(2)
    })
  })

  it('长度映射为 800 / 1600 / 3200', () => {
    expect(LENGTH_MAX_TOKENS.short).toBe(800)
    expect(LENGTH_MAX_TOKENS.medium).toBe(1600)
    expect(LENGTH_MAX_TOKENS.long).toBe(3200)
  })

  it('生成能力按风格与长度取值', () => {
    const short = resolveParams({ capability: 'generate', style: 'technical', length: 'short' })
    expect(short.temperature).toBe(STYLE_TEMPERATURE.technical)
    expect(short.maxTokens).toBe(800)

    const long = resolveParams({ capability: 'generate', style: 'creative', length: 'long' })
    expect(long.temperature).toBe(STYLE_TEMPERATURE.creative)
    expect(long.maxTokens).toBe(3200)
  })

  it('优化能力按输入长度换算，扩写翻倍且封顶 4096', () => {
    const longText = 'x'.repeat(1000)
    const polish = resolveParams({ capability: 'optimize', action: 'polish', text: longText })
    expect(polish.maxTokens).toBe(Math.ceil(1000 * 1.8))
    expect(polish.temperature).toBe(ACTION_TEMPERATURE.polish)

    const expand = resolveParams({ capability: 'optimize', action: 'expand', text: longText })
    expect(expand.maxTokens).toBe(polish.maxTokens * 2)
    expect(expand.maxTokens).toBeLessThanOrEqual(4096)

    const huge = resolveParams({ capability: 'optimize', action: 'expand', text: 'x'.repeat(4000) })
    expect(huge.maxTokens).toBe(4096)
  })

  it('短文本也保证最小 max_tokens 为 800', () => {
    const result = resolveParams({ capability: 'optimize', action: 'summarize', text: '短' })
    expect(result.maxTokens).toBe(800)
  })

  it('maxTokensCap 作为上限封顶（配置项生效）', () => {
    const result = resolveParams({ capability: 'generate', style: 'formal', length: 'long' }, { maxTokensCap: 500 })
    expect(result.maxTokens).toBe(500)
  })

  it('风格转换使用目标风格的 temperature', () => {
    const result = resolveParams({ capability: 'transform', targetStyle: 'casual', text: 'x'.repeat(10) })
    expect(result.temperature).toBe(STYLE_TEMPERATURE.casual)
  })
})