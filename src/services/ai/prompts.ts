/**
 * AI 能力的 UI 选项常量与展示文案。
 *
 * 这些 key 集合必须与主进程 electron/ai/prompt-templates.cjs 的 STYLE_KEYS / LENGTH_KEYS /
 * ACTION_KEYS 完全一致，由 tests/unit/aiPromptTemplates.test.ts 交叉断言，防止双源漂移。
 */

import type { AiCapability, MaxTokensParam, OptimizeAction, WritingLength, WritingStyle } from '@/types/ai'

/**
 * UI 选项的图标标识（数据层侧）。
 *
 * services 层不许 import 组件（分层方向），只存 id；
 * 实际图形由 src/components/ai/aiOptionIcon.tsx 按 id 映射到统一 SVG 线性图标集
 * —— 与 shared/hooks 的 ThemeIconName / SettingsPanel 的 THEME_OPTION_ICONS 同一模式。
 */
export type AiIconName =
  | 'document'
  | 'comment'
  | 'settings'
  | 'image'
  | 'book'
  | 'sparkle'
  | 'edit'
  | 'chart'
  | 'archive'

export interface StyleOption {
  value: WritingStyle
  label: string
  icon: AiIconName
  description: string
}

export const WRITING_STYLES: StyleOption[] = [
  { value: 'formal', label: '正式', icon: 'document', description: '适合商务、工作场景' },
  { value: 'casual', label: '轻松', icon: 'comment', description: '适合日常、随笔记录' },
  { value: 'technical', label: '技术', icon: 'settings', description: '适合技术文档、教程' },
  { value: 'creative', label: '创意', icon: 'image', description: '适合创意写作、故事' },
  { value: 'academic', label: '学术', icon: 'book', description: '适合论文、研究报告' },
]

export interface LengthOption {
  value: WritingLength
  label: string
  description: string
}

export const WRITING_LENGTHS: LengthOption[] = [
  { value: 'short', label: '简短', description: '约 200-400 字' },
  { value: 'medium', label: '中等', description: '约 500-800 字' },
  { value: 'long', label: '详细', description: '约 1000-1500 字' },
]

export interface OptimizeActionOption {
  value: OptimizeAction
  label: string
  icon: AiIconName
  description: string
}

export const OPTIMIZE_ACTIONS: OptimizeActionOption[] = [
  { value: 'polish', label: '润色', icon: 'sparkle', description: '修正语病、统一术语、提升可读性' },
  { value: 'rewrite', label: '改写', icon: 'edit', description: '调整句式与段落组织，保留原意' },
  { value: 'expand', label: '扩写', icon: 'chart', description: '补充细节与例证，篇幅约 1.5-2 倍' },
  { value: 'summarize', label: '总结', icon: 'archive', description: '提炼核心结论与要点' },
]

export const AI_CAPABILITIES: AiCapability[] = ['generate', 'optimize', 'transform']

/**
 * 附加指令（instructions）的最大长度。
 * 必须与主进程 electron/ai/ai-validate.cjs 的 LIMITS.INSTRUCTIONS_MAX 保持一致，
 * 由 tests/unit/aiPromptTemplates.test.ts 交叉断言，防止 UI 允许输入但主进程拒收。
 */
export const INSTRUCTIONS_MAX_LENGTH = 500

export const MAX_TOKENS_PARAMS: MaxTokensParam[] = ['max_tokens', 'max_completion_tokens']

export interface ProviderPreset {
  id: string
  label: string
  baseUrl: string
  /** 官方推荐模型，仅用作输入框的示例提示（placeholder），不会被自动填入 */
  model: string
  /**
   * 部分服务商只接受 max_completion_tokens（如小米 MiMo），预设需一并切换，
   * 否则输出长度参数不生效。
   */
  maxTokensParam?: MaxTokensParam
}

/**
 * 预设应用后的表单补丁。
 *
 * **刻意不填 model**：模型名会随服务商迭代而过期，写死一个默认值会让用户在不知情的情况下
 * 用上已下线或非预期的模型。模型必须由用户从「获取列表」拉到的实时结果中显式选择，
 * 因此这里把 model 清空，由 UI 强制要求选择后才能保存。
 *
 * **maxTokensParam 恒有值**：预设未声明时回写 'max_tokens'。若只在声明时带入，
 * 从 MiMo（max_completion_tokens）切回 DeepSeek 等预设后表单会残留旧参数名，
 * 目标服务商只认 max_tokens 时会 400。
 */
export function presetToFormPatch(preset: ProviderPreset): {
  baseUrl: string
  model: string
  maxTokensParam: MaxTokensParam
} {
  return {
    baseUrl: preset.baseUrl,
    model: '',
    maxTokensParam: preset.maxTokensParam ?? 'max_tokens',
  }
}

/**
 * 服务商预设。每个条目都会被 tests/unit/aiProviderPresets.test.ts 用主进程同一套
 * 校验函数验证，确保填进去的值一定能通过保存校验。
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'moonshot', label: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  {
    id: 'dashscope',
    label: '通义（兼容模式）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  {
    id: 'xiaomi-mimo',
    label: '小米 MiMo（按量付费）',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-pro',
    maxTokensParam: 'max_completion_tokens',
  },
  {
    id: 'xiaomi-mimo-plan',
    label: '小米 MiMo（Token Plan）',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    model: 'mimo-v2.5-pro',
    maxTokensParam: 'max_completion_tokens',
  },
  { id: 'ollama', label: 'Ollama（本地）', baseUrl: 'http://localhost:11434', model: 'qwen2.5:7b' },
]

export const STYLE_LABELS: Record<WritingStyle, string> = {
  formal: '正式',
  casual: '轻松',
  technical: '技术',
  creative: '创意',
  academic: '学术',
}

export function getStyleOption(style: WritingStyle): StyleOption {
  return WRITING_STYLES.find((option) => option.value === style) ?? WRITING_STYLES[0]
}

export function getLengthOption(length: WritingLength): LengthOption {
  return WRITING_LENGTHS.find((option) => option.value === length) ?? WRITING_LENGTHS[1]
}

export function getActionOption(action: OptimizeAction): OptimizeActionOption {
  return OPTIMIZE_ACTIONS.find((option) => option.value === action) ?? OPTIMIZE_ACTIONS[0]
}