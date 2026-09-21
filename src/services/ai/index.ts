/** AI 服务层统一出口 */

export { aiClient } from './aiClient'
export type { AiClient, AiTaskSpec } from './aiClient'
export {
  createAbortedError,
  fallbackMessage,
  isAiErrorCode,
  isAiFailure,
  normalizeAiError,
  shouldOfferRetry,
} from './errors'
export { cancelAllStreams, createRequestId, getActiveStreamCount } from './stream'
export {
  AI_CAPABILITIES,
  MAX_TOKENS_PARAMS,
  OPTIMIZE_ACTIONS,
  PROVIDER_PRESETS,
  STYLE_LABELS,
  WRITING_LENGTHS,
  WRITING_STYLES,
  getActionOption,
  getLengthOption,
  getStyleOption,
} from './prompts'
export type { LengthOption, OptimizeActionOption, ProviderPreset, StyleOption } from './prompts'