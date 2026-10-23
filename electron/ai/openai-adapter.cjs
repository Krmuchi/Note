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

/** 行首（允许最多 3 空格缩进）的三反引号围栏 */
const FENCE_LINE_RE = /^ {0,3}```/;
/** 围栏开行：可带 info string（```js） */
const FENCE_OPEN_RE = /^ {0,3}(`{3,})(.*)$/;
/**
 * 闭合围栏行：必须与开行同字符且不短于开行，且后面不能再有 info string。
 * 因此 ```py 不是 ```markdown 的闭合行（它属于内层代码块）。
 */
const FENCE_CLOSE_RE = /^ {0,3}(`{3,})\s*$/;

/**
 * 整体被单个三反引号块包裹时剥掉外层围栏（模型偶尔无视指令）。
 *
 * 判定必须"先找开行的闭合行落在哪一行"，不能用 /^```([\s\S]*?)```$/：
 * 那个非贪婪 + $ 锚点组合会一路吃到最末行，于是
 * 「代码块 + 说明文字 + 代码块」会被剥掉首尾围栏、把说明文字并进代码块。
 * 这里按 Markdown 语义扫描：若开行在最后一行才闭合 → 确属整体包裹；
 * 若中途就闭合（后面还有内容）→ 不是整体包裹，原样保留。
 * @returns {string|null} 无法整体剥离时返回 null
 */
function stripOverallFence(text) {
  const trimmed = text.trim();
  const lines = trimmed.split('\n');
  if (lines.length < 2) return null;

  const open = FENCE_OPEN_RE.exec(lines[0]);
  if (!open) return null;
  const openFence = open[1];

  for (let i = 1; i < lines.length; i += 1) {
    const close = FENCE_CLOSE_RE.exec(lines[i]);
    if (!close || close[1].length < openFence.length) continue;
    // 只有"最后一行才闭合"才算整体包裹
    return i === lines.length - 1 ? lines.slice(1, -1).join('\n') : null;
  }
  return null;
}

/**
 * 折叠连续空行（3 个以上换行 → 2 个），但跳过代码围栏内部。
 *
 * 之前的 `text.replace(/\n{3,}/g, '\n\n')` 是全局无差别的：代码块里的连续空行
 * 会被压掉，Python/YAML 这类靠空行表达结构的代码会因此失真。
 */
function collapseBlankLinesOutsideFences(text) {
  const lines = text.split('\n');
  const out = [];
  let inFence = false;
  let blankRun = 0;

  for (const line of lines) {
    const isFence = FENCE_LINE_RE.test(line);
    if (isFence) {
      inFence = !inFence;
      blankRun = 0;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (line.trim() === '') {
      blankRun += 1;
      // 最多保留 1 个空行，等价于把 3+ 个连续换行压成 2 个
      if (blankRun <= 1) out.push(line);
      continue;
    }
    blankRun = 0;
    out.push(line);
  }
  return out.join('\n');
}

/**
 * 归一化模型输出的 Markdown。
 * 有意不做"删除开场白"的启发式裁剪 —— 误删正文的风险高于收益，改由 system prompt 约束。
 */
function normalizeMarkdown(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.replace(/\r\n?/g, '\n');

  const stripped = stripOverallFence(text);
  if (stripped !== null) text = stripped;

  text = collapseBlankLinesOutsideFences(text);
  return text.trim();
}

/**
 * 抽取首个一级标题作为文档标题；取不到则回退。
 *
 * 必须跳过代码围栏内部：`/^#\s+(.+)$/m` 会把代码里的注释（如 `# 这是注释`）
 * 当成标题，导致生成的笔记用一句代码注释命名。同时需要剥掉 ATX 收尾的井号。
 */
function extractTitle(markdown, fallback = '') {
  if (typeof markdown !== 'string' || !markdown) return fallback;
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let inFence = false;

  for (const line of lines) {
    if (FENCE_LINE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // 最多 3 个前导空格（4 个及以上是缩进代码块）。
    // 收尾井号必须前置空格才剥（CommonMark ATX 规则）：`# 标题 ###` → "标题"，
    // 而 `# 标题#` 的井号属于标题本身。
    const match = /^ {0,3}#\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
    if (match) {
      const title = match[1].trim();
      if (title) return title;
    }
  }
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