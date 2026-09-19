// 重试策略：指数退避 + 抖动、Retry-After 解析、重试预算控制。
// 纯函数层：不得 require("electron")。

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;
const MAX_RETRY_AFTER_MS = 30000;
const MAX_ATTEMPTS = 3;
const JITTER_RATIO = 0.3;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 指数退避延迟（含抖动）。
 * @param {number} attempt 第几次重试（从 1 开始）
 * @param {() => number} random 便于测试注入
 */
function computeDelay(attempt, random = Math.random) {
  const step = Math.max(1, Math.floor(attempt));
  const base = Math.min(BASE_DELAY_MS * Math.pow(2, step - 1), MAX_DELAY_MS);
  return Math.round(base + random() * JITTER_RATIO * base);
}

function clampRetryAfter(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.min(ms, MAX_RETRY_AFTER_MS);
}

/**
 * 解析 Retry-After 响应头：支持数字秒与 HTTP-date，非法值返回 null（调用方回退指数退避）。
 * @param {string|number|undefined|null} value
 * @param {() => number} now
 */
function parseRetryAfter(value, now = Date.now) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return clampRetryAfter(Math.round(parseFloat(raw) * 1000));
  }
  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) return null;
  return clampRetryAfter(Math.max(0, timestamp - now()));
}

/**
 * 带重试地执行 run。
 *
 * 关键约束：流式请求一旦已向前端推送过 chunk，必须禁止重试（否则用户会看到两遍内容），
 * 通过 canRetry() 谓词表达，而不是在这里判断。
 *
 * @param {(attempt: number) => Promise<any>} run
 * @param {object} options
 * @param {number} [options.maxAttempts] 总尝试次数（含首次）
 * @param {() => boolean} [options.canRetry] 返回 false 立即放弃重试
 * @param {(err: any) => {retryable: boolean}} [options.classify] 判定错误是否可重试
 * @param {(err: any) => number|null} [options.retryAfterMs] 从错误中提取 Retry-After
 * @param {(nextAttempt: number, delayMs: number) => void} [options.onRetry] 重试通知
 * @param {(ms: number) => Promise<void>} [options.sleep]
 */
async function withRetry(run, options = {}) {
  const maxAttempts = Number.isFinite(options.maxAttempts) ? options.maxAttempts : MAX_ATTEMPTS;
  const canRetry = options.canRetry || (() => true);
  const classify = options.classify || (() => ({ retryable: false }));
  const retryAfterMs = options.retryAfterMs || (() => null);
  const onRetry = options.onRetry || (() => {});
  const sleep = options.sleep || defaultSleep;

  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await run(attempt);
    } catch (err) {
      const { retryable } = classify(err) || {};
      const hasBudget = attempt < maxAttempts;
      if (!retryable || !hasBudget || !canRetry()) throw err;
      const delay = retryAfterMs(err) ?? computeDelay(attempt);
      onRetry(attempt + 1, delay);
      await sleep(delay);
    }
  }
}

module.exports = {
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  MAX_RETRY_AFTER_MS,
  MAX_ATTEMPTS,
  computeDelay,
  clampRetryAfter,
  parseRetryAfter,
  withRetry,
};