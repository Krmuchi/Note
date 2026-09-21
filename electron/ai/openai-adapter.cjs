// OpenAI 兼容适配层：baseUrl 归一化、请求体构造、响应解析、Markdown 归一化。
// 单一适配器覆盖 OpenAI / DeepSeek / Moonshot / 通义(兼容模式) / Ollama 等
// 遵循 /v1/chat/completions 协议的服务。
//
// 纯函数层：不得 require("electron")。

const { AI_ERROR_CODES, aiErrorException } = require('./error-map.cjs');

const CHAT_COMPLETIONS_PATH = '/chat/completions';
const MODELS_PATH = '/models';
const DEFAULT_MAX_TOKENS_PARAM = 'max_tokens';

/**
 * 归一化 baseUrl：
 * - 去尾部斜杠
 * - 末尾不是版本段（/v\d+）时补 /v1
 * - 仅允许 http/https（用户可控的 baseUrl 是主进程出网目标，属 SSRF 面）
 *
 * @param {string} input
 * @returns {string} 形如 https://api.deepseek.com/v1
 */
function normalizeBaseUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw aiErrorException(AI_ERROR_CODES.BAD_REQUEST, { detail: 'baseUrl 不能为空' });
  }
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw aiErrorException(AI_ERROR_CODES.BAD_REQUEST, { detail: 'baseUrl 不是合法 URL' });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw aiErrorException(AI_ERROR_CODES.BAD_REQUEST, { detail: 'baseUrl 仅支持 http/https' });
  }
  let pathname = url.pathname.replace(/\/+$/, '');
  if (!/\/v\d+$/.test(pathname)) pathname += '/v1';
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

/** baseUrl + /chat/completions */
function buildChatUrl(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}${CHAT_COMPLETIONS_PATH}`;
}

/** baseUrl + /models（OpenAI 兼容协议的模型列表端点） */
function buildModelsUrl(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}${MODELS_PATH}`;
}

function buildHeaders(apiKey, stream) {
  return {
    'Content-Type': 'application/json',
    Accept: stream ? 'text/event-stream' : 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * 模型列表请求头：本地服务（如 Ollama）不需要鉴权，
 * 此时不发送 Authorization，避免被上游当作非法凭证拒绝。
 */
function buildModelsHeaders(apiKey) {
  const headers = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

/**
 * 构造 OpenAI 兼容请求体。
 * @param {object} params
 * @param {string} params.model
 * @param {Array<{role: string, content: string}>} params.messages
 * @param {number} params.temperature
 * @param {number} params.maxTokens
 * @param {boolean} params.stream
 * @param {'max_tokens'|'max_completion_tokens'} [params.maxTokensParam] OpenAI o 系列只认后者
 * @param {boolean} [params.disableStreamOptions] 部分国产网关不接受 stream_options
 */
function buildChatRequest(params) {
  const {
    model,
    messages,
    temperature,
    maxTokens,
    stream,
    maxTokensParam = DEFAULT_MAX_TOKENS_PARAM,
    disableStreamOptions = false,
  } = params;

  const body = {
    model,
    messages,
    temperature,
    stream: !!stream,
  };
  body[maxTokensParam === 'max_completion_tokens' ? 'max_completion_tokens' : 'max_tokens'] = maxTokens;

  if (stream && !disableStreamOptions) {
    body.stream_options = { include_usage: true };
  }
  return body;
}

/** 判断 400 是否因网关不认识 stream_options 导致（用于自动降级重试一次） */
function isStreamOptionsRejection(status, bodyText) {
  if (status !== 400) return false;
  return /stream_options|unknown parameter|unrecognized/i.test(String(bodyText || ''));
}

/**
 * 从错误响应体里提取可读的 detail（优先取 error.message）。
 * @returns {string} 空串表示取不到
 */
function extractErrorDetail(bodyText) {
  const text = String(bodyText || '').trim();
  if (!text) return '';
  try {
    const json = JSON.parse(text);
    const message = json && json.error && (json.error.message || json.error.msg);
    if (typeof message === 'string' && message) return message;
    if (typeof json.message === 'string' && json.message) return json.message;
  } catch {
    /* 非 JSON，走下面的原文截断 */
  }
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

/** message.content 可能是字符串，也可能是 [{type:'text',text}] 数组 */
function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean);
    return parts.join('');
  }
  return null;
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined;
  const promptTokens = Number(usage.prompt_tokens) || 0;
  const completionTokens = Number(usage.completion_tokens) || 0;
  const totalTokens = Number(usage.total_tokens) || promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

/**
 * 解析 /models 响应，提取模型 id 列表。
 *
 * 兼容三种常见形状：
 * - OpenAI 标准：{ object: 'list', data: [{ id: 'gpt-4o', ... }] }
 * - 部分网关：{ models: [{ id | name }] }（Ollama 原生风格用 name）
 * - 少数网关：['a', 'b'] 或 [{ id }] 裸数组
 *
 * 不做「过滤非对话模型」的启发式裁剪：用户要的是该服务当前提供的全部模型，
 * 猜测哪些不能用于对话反而会隐藏合法模型。
 *
 * @returns {string[]} 去重并排序后的模型 id
 */
function parseModelsResponse(json) {
  let raw;
  if (Array.isArray(json)) raw = json;
  else if (json && typeof json === 'object') raw = json.data ?? json.models;
  if (!Array.isArray(raw)) throw aiErrorException(AI_ERROR_CODES.BAD_FORMAT);

  const ids = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      if (item) ids.push(item);
      continue;
    }
    if (item && typeof item === 'object') {
      const id = typeof item.id === 'string' ? item.id : typeof item.name === 'string' ? item.name : '';
      if (id) ids.push(id);
    }
  }

  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (unique.length === 0) throw aiErrorException(AI_ERROR_CODES.BAD_FORMAT);
  return unique.sort((a, b) => a.localeCompare(b));
}

/** 整体被三反引号包裹时剥掉外层围栏（模型偶尔无视指令） */
const OVERALL_FENCE_RE = /^```[A-Za-z0-9_+.-]*[ \t]*\n([\s\S]*?)\n?```$/;

/**
 * 归一化模型输出的 Markdown。
 * 有意不做"删除开场白"的启发式裁剪 —— 误删正文的风险高于收益，改由 system prompt 约束。
 */
function normalizeMarkdown(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.replace(/\r\n?/g, '\n');

  const fenced = text.trim().match(OVERALL_FENCE_RE);
  if (fenced) text = fenced[1];

  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/** 抽取首个一级标题作为文档标题；取不到则回退 */
function extractTitle(markdown, fallback = '') {
  const match = /^#\s+(.+)$/m.exec(markdown || '');
  if (match) return match[1].trim();
  return fallback;
}

/**
 * 解析非流式 chat completion 响应。
 * @param {any} json
 * @param {{capability?: string, topic?: string, fallbackModel?: string, allowEmpty?: boolean}} [options]
 *   allowEmpty：连通性测试用 —— 只要 HTTP 200 且响应结构合法，就说明地址/密钥/模型都对，
 *   此时可见正文为空不应判定为连接失败。
 * @returns {{text: string, title?: string, usage?: object, finishReason: string|null, model: string,
 *            reasoningOnly?: boolean}}
 */
function parseChatCompletion(json, options = {}) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw aiErrorException(AI_ERROR_CODES.BAD_FORMAT);
  }

  const choices = Array.isArray(json.choices) ? json.choices : [];
  let rawContent = null;
  let reasoningOnly = false;
  let finishReason = null;

  if (choices.length > 0) {
    const choice = choices[0] && typeof choices[0] === 'object' ? choices[0] : {};
    if (typeof choice.finish_reason === 'string') finishReason = choice.finish_reason;
    if (choice.message && typeof choice.message === 'object') {
      rawContent = extractText(choice.message.content);
      // 思维链字段有内容、可见正文为空 → 典型的「推理吃光 token 预算」
      const reasoning = choice.message.reasoning_content;
      if (!rawContent && typeof reasoning === 'string' && reasoning.trim()) reasoningOnly = true;
    }
  } else if (typeof json.output_text === 'string') {
    // 兼容 Responses API 风格的返回
    rawContent = json.output_text;
  }

  if (finishReason === 'content_filter') {
    throw aiErrorException(AI_ERROR_CODES.CONTENT_FILTER);
  }
  if (rawContent === null) {
    throw aiErrorException(AI_ERROR_CODES.BAD_FORMAT);
  }

  const text = normalizeMarkdown(rawContent);
  if (!text) {
    if (options.allowEmpty) {
      const model = typeof json.model === 'string' && json.model ? json.model : options.fallbackModel || '';
      const empty = { text: '', finishReason, model };
      if (reasoningOnly) empty.reasoningOnly = true;
      const usage = normalizeUsage(json.usage);
      if (usage) empty.usage = usage;
      return empty;
    }
    throw aiErrorException(
      reasoningOnly ? AI_ERROR_CODES.REASONING_ONLY : AI_ERROR_CODES.EMPTY_CONTENT,
      { n: options.maxTokens },
    );
  }

  const model = typeof json.model === 'string' && json.model ? json.model : options.fallbackModel || '';

  const result = { text, finishReason, model };
  const usage = normalizeUsage(json.usage);
  if (usage) result.usage = usage;
  if (options.capability === 'generate') {
    result.title = extractTitle(text, options.topic || '');
  }
  return result;
}

module.exports = {
  DEFAULT_MAX_TOKENS_PARAM,
  normalizeBaseUrl,
  buildChatUrl,
  buildModelsUrl,
  buildHeaders,
  buildModelsHeaders,
  buildChatRequest,
  isStreamOptionsRejection,
  extractErrorDetail,
  extractText,
  normalizeUsage,
  parseModelsResponse,
  normalizeMarkdown,
  extractTitle,
  parseChatCompletion,
};