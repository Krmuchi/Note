import { describe, it, expect } from 'vitest'
import { PROVIDER_PRESETS, MAX_TOKENS_PARAMS, presetToFormPatch } from '@/services/ai'
import { assertAiConfigPayload } from '../../electron/ai/ai-validate.cjs'
import { normalizeBaseUrl, buildChatUrl } from '../../electron/ai/openai-adapter.cjs'

/**
 * 预设是「一键填配置」的入口，一旦 baseUrl 或 model 不合法，
 * 用户会在点保存时才发现失败（主进程 assertAiConfigPayload 抛错）。
 * 这里用主进程同一套校验函数把每个预设都过一遍，把问题拦在提交前。
 */
describe('服务商预设 - 与主进程校验规则一致性', () => {
  it('每个预设的 baseUrl 都能通过主进程校验', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(
        () => assertAiConfigPayload({ baseUrl: preset.baseUrl }),
        `预设 ${preset.id} 的 baseUrl 非法：${preset.baseUrl}`,
      ).not.toThrow()
    }
  })

  it('每个预设的 model 都能通过主进程校验', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(
        () => assertAiConfigPayload({ model: preset.model }),
        `预设 ${preset.id} 的 model 非法：${preset.model}`,
      ).not.toThrow()
    }
  })

  it('maxTokensParam 只能是主进程接受的两种取值', () => {
    for (const preset of PROVIDER_PRESETS) {
      if (!preset.maxTokensParam) continue
      expect(MAX_TOKENS_PARAMS).toContain(preset.maxTokensParam)
      expect(() => assertAiConfigPayload({ maxTokensParam: preset.maxTokensParam })).not.toThrow()
    }
  })

  it('归一化后请求地址统一落在 /v1/chat/completions', () => {
    for (const preset of PROVIDER_PRESETS) {
      const url = buildChatUrl(preset.baseUrl)
      expect(url, `预设 ${preset.id} 的请求地址异常：${url}`).toMatch(/\/v1\/chat\/completions$/)
      // 不应出现 /v1/v1 这类重复版本段
      expect(url).not.toContain('/v1/v1')
    }
  })

  it('id 唯一且非空，label 非空', () => {
    const ids = PROVIDER_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.id.length).toBeGreaterThan(0)
      expect(preset.label.length).toBeGreaterThan(0)
    }
  })
})

describe('小米 MiMo 预设', () => {
  const xiaomiPresets = PROVIDER_PRESETS.filter((preset) => preset.id.startsWith('xiaomi-'))

  it('按量付费与 Token Plan 两种接入方式都已提供', () => {
    expect(xiaomiPresets.map((preset) => preset.id)).toEqual(['xiaomi-mimo', 'xiaomi-mimo-plan'])
  })

  it('baseUrl 指向官方 OpenAI 兼容端点且已含版本段', () => {
    const byId = new Map(xiaomiPresets.map((preset) => [preset.id, preset]))
    expect(byId.get('xiaomi-mimo')?.baseUrl).toBe('https://api.xiaomimimo.com/v1')
    expect(byId.get('xiaomi-mimo-plan')?.baseUrl).toBe('https://token-plan-cn.xiaomimimo.com/v1')

    // 已含 /v1 时归一化必须保持原样（不能被再补一次）
    for (const preset of xiaomiPresets) {
      expect(normalizeBaseUrl(preset.baseUrl)).toBe(preset.baseUrl)
    }
  })

  it('模型为官方旗舰 mimo-v2.5-pro', () => {
    for (const preset of xiaomiPresets) {
      expect(preset.model).toBe('mimo-v2.5-pro')
    }
  })

  it('必须使用 max_completion_tokens（官方参数表未提供 max_tokens）', () => {
    for (const preset of xiaomiPresets) {
      expect(preset.maxTokensParam).toBe('max_completion_tokens')
    }
  })
})

describe('presetToFormPatch - 应用预设后的表单补丁', () => {
  it('不填模型：所有预设的补丁 model 都为空（模型必须由用户显式选择）', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(presetToFormPatch(preset).model, `预设 ${preset.id} 不应自动填入模型`).toBe('')
    }
  })

  it('只带入接口地址', () => {
    const preset = PROVIDER_PRESETS[0]
    expect(presetToFormPatch(preset).baseUrl).toBe(preset.baseUrl)
  })

  it('maxTokensParam 仅在预设声明时才带入', () => {
    const deepseek = PROVIDER_PRESETS.find((item) => item.id === 'deepseek')
    const xiaomi = PROVIDER_PRESETS.find((item) => item.id === 'xiaomi-mimo')
    expect(deepseek && presetToFormPatch(deepseek)).not.toHaveProperty('maxTokensParam')
    expect(xiaomi && presetToFormPatch(xiaomi).maxTokensParam).toBe('max_completion_tokens')
  })

  it('返回新对象，不修改预设本身（预设的 model 仍作为示例提示保留）', () => {
    const preset = PROVIDER_PRESETS.find((item) => item.id === 'xiaomi-mimo')
    if (!preset) throw new Error('缺少小米预设')
    const before = preset.model
    const patch = presetToFormPatch(preset)
    patch.model = '被改坏的值'
    expect(preset.model).toBe(before)
  })
})