// AI IPC payload 白名单校验与归一化。
// 纯函数层：不得 require("electron")。
//
// 原则：只从白名单里挑字段进归一化结果，未知字段直接忽略（不报错）——
// 这样前端演进新增字段时不会被主进程卡住，同时渲染进程也无法向 messages 注入任意内容。

const { AI_ERROR_CODES, aiErrorException } = require('./error-map.cjs');

const CAPABILITIES = ['generate', 'optimize', 'transform'];
const STYLES = ['formal', 'casual', 'technical', 'creative', 'academic'];
const LENGTHS = ['short', 'medium', 'long'];
const ACTIONS = ['polish', 'rewrite', 'expand', 'summarize'];
const MAX_TOKENS_PARAMS = ['max_tokens', 'max_completion_tokens'];

const LIMITS = {
  REQUEST_ID_RE: /^[A-Za-z0-9_-]{8,64}$/,
  TOPIC_MAX: 2000,
  TEXT_MAX: 8000,
  INSTRUCTIONS_MAX: 500,
  PAYLOAD_BYTES: 64 * 1024,
  BATCH_MAX: 16,
  BASE_URL_MIN: 8,
  BASE_URL_MAX: 2048,
  API_KEY_MAX: 512,
  MODEL_MIN: 1,
  MODEL_MAX: 128,
  MODEL_RE: /^[A-Za-z0-9._:\/-]+$/,
  TEMPERATURE_MIN: 0,
  TEMPERATURE_MAX: 2,
  MAX_TOKENS_MIN: 1,
  MAX_TOKENS_MAX: 32000,
  TIMEOUT_MIN: 1000,
  TIMEOUT_MAX: 300000,
  CONCURRENCY_MIN: 1,
  CONCURRENCY_MAX: 8,
  MAX_INPUT_TOKENS_MIN: 500,
  MAX_INPUT_TOKENS_MAX: 128000,
  DEFAULT_MAX_INPUT_TOKENS: 8000,
};

function invalid(detail) {
  return aiErrorException(AI_ERROR_CODES.BAD_REQUEST, { detail });
}

function inputTooLong(max) {
  return aiErrorException(AI_ERROR_CODES.INPUT_TOO_LONG, { n: max });
}

function byteLengthOf(value) {
  const text = JSON.stringify(value) ?? '';
  if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
    return Buffer.byteLength(text, 'utf-8');
  }
  return text.length;
}

/** 粗估输入 token 数（1 字符 ≈ 1.6 token） */
function estimateInputTokens(text) {
  const chars = typeof text === 'string' ? text.length : 0;
  return Math.ceil(chars / 1.6);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid(`${label}必须是对象`);
  }
  return value;
}

function assertRequestId(value) {
  if (typeof value !== 'string' || !LIMITS.REQUEST_ID_RE.test(value)) {
    throw invalid('requestId 必须是 8-64 位的字母/数字/下划线/连字符');
  }
  return value;
}

function assertEnum(value, allowed, field) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw invalid(`${field} 必须是 ${allowed.join(' / ')} 之一`);
  }
  return value;
}

function assertNumberInRange(value, min, max, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw invalid(`${field} 必须是 ${min} 到 ${max} 之间的数字`);
  }
  return value;
}

function assertBoolean(value, field) {
  if (typeof value !== 'boolean') throw invalid(`${field} 必须是布尔值`);
  return value;
}

function assertBaseUrl(value) {
  if (typeof value !== 'string') throw invalid('baseUrl 必须是字符串');
  const trimmed = value.trim();
  if (trimmed.length < LIMITS.BASE_URL_MIN || trimmed.length > LIMITS.BASE_URL_MAX) {
    throw invalid(`baseUrl 长度必须在 ${LIMITS.BASE_URL_MIN}-${LIMITS.BASE_URL_MAX} 之间`);
  }
  if (!/^https?:\/\//i.test(trimmed)) throw invalid('baseUrl 必须以 http:// 或 https:// 开头');
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw invalid('baseUrl 不是合法 URL');
  }
  if (!url.hostname) throw invalid('baseUrl 缺少主机名');
  return trimmed;
}

function assertModel(value) {
  if (typeof value !== 'string') throw invalid('model 必须是字符串');
  const trimmed = value.trim();
  if (trimmed.length < LIMITS.MODEL_MIN || trimmed.length > LIMITS.MODEL_MAX) {
    throw invalid(`model 长度必须在 ${LIMITS.MODEL_MIN}-${LIMITS.MODEL_MAX} 之间`);
  }
  if (!LIMITS.MODEL_RE.test(trimmed)) throw invalid('model 只能包含字母、数字、点、下划线、冒号、斜杠与连字符');
  return trimmed;
}

/**
 * 校验并归一化 AI 请求载荷。
 * @param {any} payload
 * @param {{maxInputTokens?: number}} [options]
 */
function assertAiRequestPayload(payload, options = {}) {
  assertPlainObject(payload, '请求载荷');
  const maxInputTokens = Number.isFinite(options.maxInputTokens)
    ? options.maxInputTokens
    : LIMITS.DEFAULT_MAX_INPUT_TOKENS;

  const requestId = assertRequestId(payload.requestId);
  const capability = assertEnum(payload.capability, CAPABILITIES, 'capability');
  const normalized = { requestId, capability };

  if (capability === 'generate') {
    const topic = typeof payload.topic === 'string' ? payload.topic.trim() : '';
    if (!topic) throw invalid('topic 不能为空');
    if (topic.length > LIMITS.TOPIC_MAX) throw inputTooLong(LIMITS.TOPIC_MAX);
    normalized.topic = topic;
    normalized.style = assertEnum(payload.style === undefined ? 'formal' : payload.style, STYLES, 'style');
    normalized.length = assertEnum(payload.length === undefined ? 'medium' : payload.length, LENGTHS, 'length');
    normalized.includeOutline = payload.includeOutline === true;
    normalized.includeExamples = payload.includeExamples === true;
    if (estimateInputTokens(topic) > maxInputTokens) throw inputTooLong(maxInputTokens);
  } else {
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!text) throw invalid('text 不能为空');
    if (text.length > LIMITS.TEXT_MAX) throw inputTooLong(LIMITS.TEXT_MAX);
    normalized.text = text;
    if (capability === 'optimize') {
      normalized.action = assertEnum(payload.action, ACTIONS, 'action');
    } else {
      normalized.targetStyle = assertEnum(payload.targetStyle, STYLES, 'targetStyle');
    }
    if (estimateInputTokens(text) > maxInputTokens) throw inputTooLong(maxInputTokens);
  }

  if (payload.instructions !== undefined && payload.instructions !== null) {
    if (typeof payload.instructions !== 'string') throw invalid('instructions 必须是字符串');
    const instructions = payload.instructions.trim();
    if (instructions.length > LIMITS.INSTRUCTIONS_MAX) throw inputTooLong(LIMITS.INSTRUCTIONS_MAX);
    if (instructions) normalized.instructions = instructions;
  }

  if (byteLengthOf(payload) > LIMITS.PAYLOAD_BYTES) {
    throw inputTooLong(`${Math.round(LIMITS.PAYLOAD_BYTES / 1024)}KB`);
  }

  return normalized;
}

/**
 * 校验并归一化 AI 配置补丁（partial update）。
 * - 只返回出现过的字段
 * - apiKey 传空串表示清除；不传表示保留原值
 * @param {any} payload
 */
function assertAiConfigPayload(payload) {
  assertPlainObject(payload, '配置');
  const patch = {};

  if (payload.baseUrl !== undefined && payload.baseUrl !== null) {
    patch.baseUrl = assertBaseUrl(payload.baseUrl);
  }
  if (payload.model !== undefined && payload.model !== null) {
    patch.model = assertModel(payload.model);
  }
  if (payload.apiKey !== undefined) {
    if (typeof payload.apiKey !== 'string') throw invalid('apiKey 必须是字符串');
    if (/[\r\n]/.test(payload.apiKey)) throw invalid('apiKey 不能包含换行符');
    if (payload.apiKey.length > LIMITS.API_KEY_MAX) throw invalid('apiKey 过长');
    patch.apiKey = payload.apiKey;
  }
  if (payload.temperature !== undefined) {
    patch.temperature = assertNumberInRange(
      payload.temperature,
      LIMITS.TEMPERATURE_MIN,
      LIMITS.TEMPERATURE_MAX,
      'temperature',
    );
  }
  if (payload.maxTokens !== undefined) {
    patch.maxTokens = assertNumberInRange(payload.maxTokens, LIMITS.MAX_TOKENS_MIN, LIMITS.MAX_TOKENS_MAX, 'maxTokens');
  }
  if (payload.timeoutMs !== undefined) {
    patch.timeoutMs = assertNumberInRange(payload.timeoutMs, LIMITS.TIMEOUT_MIN, LIMITS.TIMEOUT_MAX, 'timeoutMs');
  }
  if (payload.concurrency !== undefined) {
    patch.concurrency = assertNumberInRange(
      payload.concurrency,
      LIMITS.CONCURRENCY_MIN,
      LIMITS.CONCURRENCY_MAX,
      'concurrency',
    );
  }
  if (payload.maxInputTokens !== undefined) {
    patch.maxInputTokens = assertNumberInRange(
      payload.maxInputTokens,
      LIMITS.MAX_INPUT_TOKENS_MIN,
      LIMITS.MAX_INPUT_TOKENS_MAX,
      'maxInputTokens',
    );
  }
  if (payload.stream !== undefined) patch.stream = assertBoolean(payload.stream, 'stream');
  if (payload.cacheEnabled !== undefined) patch.cacheEnabled = assertBoolean(payload.cacheEnabled, 'cacheEnabled');
  if (payload.consent !== undefined) patch.consent = assertBoolean(payload.consent, 'consent');
  if (payload.disableStreamOptions !== undefined) {
    patch.disableStreamOptions = assertBoolean(payload.disableStreamOptions, 'disableStreamOptions');
  }
  if (payload.maxTokensParam !== undefined) {
    patch.maxTokensParam = assertEnum(payload.maxTokensParam, MAX_TOKENS_PARAMS, 'maxTokensParam');
  }

  return patch;
}

/** 校验批量载荷：1..16 条，逐条走单请求校验 */
function assertAiBatchPayload(payloads, options = {}) {
  if (!Array.isArray(payloads)) throw invalid('批量载荷必须是数组');
  if (payloads.length < 1 || payloads.length > LIMITS.BATCH_MAX) {
    throw invalid(`批量条数必须在 1-${LIMITS.BATCH_MAX} 之间`);
  }
  return payloads.map((item) => assertAiRequestPayload(item, options));
}

module.exports = {
  CAPABILITIES,
  STYLES,
  LENGTHS,
  ACTIONS,
  MAX_TOKENS_PARAMS,
  LIMITS,
  estimateInputTokens,
  assertRequestId,
  assertAiRequestPayload,
  assertAiConfigPayload,
  assertBatchPayload: assertAiBatchPayload,
};