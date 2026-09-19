// AI 错误归一化：上游 HTTP / 网络 / 解析异常 → 统一错误码 + 中文文案 + 可重试判定。
//
// 纯函数层：不得 require("electron")。
//
// 跨 IPC 契约：主进程把错误包成信封 { ok: false, error } 返回，而不是 throw —— 
// ipcMain.handle 抛出的错误经 Electron 序列化后只剩 message 字符串（带
// "Error invoking remote method '...'" 前缀），code / retryable / httpStatus 会全部丢失。

const AI_ERROR_CODES = {
  NOT_CONFIGURED: 'AI_ERR_NOT_CONFIGURED',
  NETWORK: 'AI_ERR_NETWORK',
  TIMEOUT: 'AI_ERR_TIMEOUT',
  ABORTED: 'AI_ERR_ABORTED',
  AUTH: 'AI_ERR_AUTH',
  FORBIDDEN: 'AI_ERR_FORBIDDEN',
  NOT_FOUND: 'AI_ERR_NOT_FOUND',
  RATE_LIMIT: 'AI_ERR_RATE_LIMIT',
  SERVER: 'AI_ERR_SERVER',
  BAD_REQUEST: 'AI_ERR_BAD_REQUEST',
  CONTENT_FILTER: 'AI_ERR_CONTENT_FILTER',
  BAD_FORMAT: 'AI_ERR_BAD_FORMAT',
  EMPTY_CONTENT: 'AI_ERR_EMPTY_CONTENT',
  INPUT_TOO_LONG: 'AI_ERR_INPUT_TOO_LONG',
  ENCRYPTION_UNAVAILABLE: 'AI_ERR_ENCRYPTION_UNAVAILABLE',
  UNKNOWN: 'AI_ERR_UNKNOWN',
};

/** 错误码元数据：用户文案模板 + 是否可重试 */
const ERROR_META = {
  [AI_ERROR_CODES.NOT_CONFIGURED]: {
    retryable: false,
    message: '尚未配置 AI 服务，请前往「设置 → AI」填写接口地址与 API Key，并确认内容外发授权',
  },
  [AI_ERROR_CODES.NETWORK]: {
    retryable: true,
    message: '网络连接失败，请检查网络或接口地址是否正确',
  },
  [AI_ERROR_CODES.TIMEOUT]: {
    retryable: true,
    message: '请求超时（已等待 {n} 秒），请稍后重试',
  },
  [AI_ERROR_CODES.ABORTED]: {
    retryable: false,
    message: '已取消生成',
  },
  [AI_ERROR_CODES.AUTH]: {
    retryable: false,
    message: 'API Key 无效或已过期，请重新配置',
  },
  [AI_ERROR_CODES.FORBIDDEN]: {
    retryable: false,
    message: '无访问权限：可能是 Key 权限不足、模型未开通或账户余额不足',
  },
  [AI_ERROR_CODES.NOT_FOUND]: {
    retryable: false,
    message: '接口地址或模型名称不存在，请检查 baseUrl 与 model',
  },
  [AI_ERROR_CODES.RATE_LIMIT]: {
    retryable: true,
    message: '请求过于频繁或已达配额上限，请稍后重试',
  },
  [AI_ERROR_CODES.SERVER]: {
    retryable: true,
    message: 'AI 服务暂时不可用（HTTP {status}），正在重试',
  },
  [AI_ERROR_CODES.BAD_REQUEST]: {
    retryable: false,
    message: '请求参数被服务端拒绝：{detail}',
  },
  [AI_ERROR_CODES.CONTENT_FILTER]: {
    retryable: false,
    message: '内容被模型安全策略拦截，请调整输入后再试',
  },
  [AI_ERROR_CODES.BAD_FORMAT]: {
    retryable: true,
    message: '服务返回格式异常，可能不是 OpenAI 兼容接口',
  },
  [AI_ERROR_CODES.EMPTY_CONTENT]: {
    retryable: true,
    message: '模型没有返回内容，请重试或更换模型',
  },
  [AI_ERROR_CODES.INPUT_TOO_LONG]: {
    retryable: false,
    message: '输入内容过长（上限 {n} 字），请缩短后重试',
  },
  [AI_ERROR_CODES.ENCRYPTION_UNAVAILABLE]: {
    retryable: false,
    message: '当前系统不支持安全存储，无法保存 API Key（仅本次运行有效）',
  },
  [AI_ERROR_CODES.UNKNOWN]: {
    retryable: false,
    message: '生成失败：{msg}',
  },
};

/** 占位符兜底值，保证 formatMessage 输出中不残留 {xxx} */
const DEFAULT_VARS = {
  n: '60',
  status: '未知',
  detail: '未提供详细信息',
  msg: '未知错误',
};

const RETRYABLE_CODES = [
  AI_ERROR_CODES.NETWORK,
  AI_ERROR_CODES.TIMEOUT,
  AI_ERROR_CODES.RATE_LIMIT,
  AI_ERROR_CODES.SERVER,
  AI_ERROR_CODES.BAD_FORMAT,
  AI_ERROR_CODES.EMPTY_CONTENT,
];

const CONTENT_FILTER_PATTERN = /safety|content[_ ]?policy|risk[_ ]?control|风险|敏感|违规/i;

/** 用变量渲染中文文案；缺失变量用 DEFAULT_VARS 兜底，绝不残留占位符 */
function formatMessage(code, vars = {}) {
  const meta = ERROR_META[code] || ERROR_META[AI_ERROR_CODES.UNKNOWN];
  return meta.message.replace(/\{(\w+)\}/g, (_match, key) => {
    const value = vars[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
    return DEFAULT_VARS[key] !== undefined ? DEFAULT_VARS[key] : '';
  });
}

/** 全部合法错误码（值是 code 字符串，键只是简写别名） */
const VALID_CODES = new Set(Object.values(AI_ERROR_CODES));

function isRetryable(code) {
  return RETRYABLE_CODES.includes(code);
}

/**
 * 构造结构化 AI 错误对象（用于信封返回）。
 * @param {string} code
 * @param {{httpStatus?: number, attempts?: number} & Record<string, unknown>} [vars]
 */
function aiError(code, vars = {}) {
  const resolved = typeof code === 'string' && VALID_CODES.has(code) ? code : AI_ERROR_CODES.UNKNOWN;
  const error = {
    code: resolved,
    message: formatMessage(resolved, vars),
    retryable: isRetryable(resolved),
  };
  if (typeof vars.httpStatus === 'number') error.httpStatus = vars.httpStatus;
  if (typeof vars.attempts === 'number') error.attempts = vars.attempts;
  return error;
}

/**
 * 构造携带结构化错误的异常，供纯函数层内部 throw；
 * ai-service 在最外层 catch 后取 err.aiError 转成信封。
 */
function aiErrorException(code, vars = {}) {
  const err = new Error(aiError(code, vars).message);
  err.aiError = aiError(code, vars);
  return err;
}

/** 从任意异常中取出结构化 AI 错误，取不到则落 UNKNOWN */
function toAiError(err, vars = {}) {
  if (err && err.aiError) {
    const base = err.aiError;
    return {
      ...base,
      ...(typeof vars.attempts === 'number' ? { attempts: vars.attempts } : null),
    };
  }
  const msg = err && err.message ? err.message : '';
  return aiError(AI_ERROR_CODES.UNKNOWN, { ...vars, msg });
}

const HTTP_STATUS_CODE_MAP = {
  400: AI_ERROR_CODES.BAD_REQUEST,
  401: AI_ERROR_CODES.AUTH,
  403: AI_ERROR_CODES.FORBIDDEN,
  404: AI_ERROR_CODES.NOT_FOUND,
  408: AI_ERROR_CODES.TIMEOUT,
  422: AI_ERROR_CODES.BAD_REQUEST,
  429: AI_ERROR_CODES.RATE_LIMIT,
};

/**
 * HTTP 状态码 → 错误码。
 * 400/422 需结合响应体文本判断是否为内容安全拦截。
 */
function classifyHttpStatus(status, detailText = '') {
  if (status >= 500) return AI_ERROR_CODES.SERVER;
  const mapped = HTTP_STATUS_CODE_MAP[status];
  if (mapped === AI_ERROR_CODES.BAD_REQUEST && CONTENT_FILTER_PATTERN.test(detailText)) {
    return AI_ERROR_CODES.CONTENT_FILTER;
  }
  if (mapped) return mapped;
  if (status >= 400) return AI_ERROR_CODES.BAD_REQUEST;
  return AI_ERROR_CODES.UNKNOWN;
}

/**
 * 异常 → 错误码。
 * @param {Error} err
 * @param {{userCancelled?: boolean, timedOut?: boolean}} flags
 */
function classifyException(err, flags = {}) {
  // 用户取消优先于超时：两者可能同时为真（点取消的瞬间恰好到点）
  if (flags.userCancelled) return AI_ERROR_CODES.ABORTED;
  if (flags.timedOut) return AI_ERROR_CODES.TIMEOUT;
  if (err && err.aiError) return err.aiError.code;
  const name = err && err.name;
  if (name === 'AbortError' || name === 'TimeoutError') return AI_ERROR_CODES.TIMEOUT;
  if (err instanceof TypeError) return AI_ERROR_CODES.NETWORK;
  return AI_ERROR_CODES.UNKNOWN;
}

/** 日志脱敏：密钥/token 不回显、不落日志 */
function redactSecrets(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '***')
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/"api_?key"\s*:\s*"[^"]*"/gi, '"apiKey":"***"');
}

module.exports = {
  AI_ERROR_CODES,
  ERROR_META,
  RETRYABLE_CODES,
  formatMessage,
  isRetryable,
  aiError,
  aiErrorException,
  toAiError,
  classifyHttpStatus,
  classifyException,
  redactSecrets,
};