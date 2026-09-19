/**
 * AI 能力的 UI 选项常量与展示文案。
 *
 * 这些 key 集合必须与主进程 electron/ai/prompt-templates.cjs 的 STYLE_KEYS / LENGTH_KEYS /
 * ACTION_KEYS 完全一致，由 tests/unit/aiPromptTemplates.test.ts 交叉断言，防止双源漂移。
 */

import type { AiCapability, MaxTokensParam, OptimizeAction, WritingLength, WritingStyle } from '@/types/ai'

export interface StyleOption {
  value: WritingStyle
  label: string
  icon: string
  description: string
}

export const WRITING_STYLES: StyleOption[] = [
  { value: 'formal', label: '正式', icon: '📄', description: '适合商务、工作场景' },
  { value: 'casual', label: '轻松', icon: '😊', description: '适合日常、随笔记录' },
  { value: 'technical', label: '技术', icon: '💻', description: '适合技术文档、教程' },
  { value: 'creative', label: '创意', icon: '🎨', description: '适合创意写作、故事' },
  { value: 'academic', label: '学术', icon: '🎓', description: '适合论文、研究报告' },
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
  icon: string
  description: string
}

export const OPTIMIZE_ACTIONS: OptimizeActionOption[] = [
  { value: 'polish', label: '润色', icon: '✨', description: '修正语病、统一术语、提升可读性' },
  { value: 'rewrite', label: '改写', icon: '🔄', description: '调整句式与段落组织，保留原意' },
  { value: 'expand', label: '扩写', icon: '📈', description: '补充细节与例证，篇幅约 1.5-2 倍' },
  { value: 'summarize', label: '总结', icon: '📌', description: '提炼核心结论与要点' },
]

export const AI_CAPABILITIES: AiCapability[] = ['generate', 'optimize', 'transform']

export const MAX_TOKENS_PARAMS: MaxTokensParam[] = ['max_tokens', 'max_completion_tokens']

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