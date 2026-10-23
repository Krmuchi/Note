// 并发闸门：限制同时进行中的 AI 请求数，超出的排队等待。
// 纯函数层：不得 require("electron")。
//
// 流式请求同样必须走闸门 —— 长连接占用上游配额，不限流会在用户连点或批量操作时
// 打满配额并触发 429 风暴。

const DEFAULT_LIMIT = 3;

/**
 * 把外部传入的 limit 收敛为合法正整数。
 * 必须显式判 Number.isFinite：`Math.max(1, 'abc')` 得到 NaN，
 * 而 `active < NaN` 恒为 false，会让闸门永久死锁（所有 AI 请求无声挂起，无报错无超时）。
 *
 * 只接受真数字或可解析为数字的字符串：null / [] / {} / '' 这类会被 Number()
 * 悄悄转成 0 的值一律视为非法并回退，避免把"配置写坏了"误当成"并发设为 1"。
 */
function normalizeLimit(value, fallback = DEFAULT_LIMIT) {
  let n;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  else return fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

/**
 * @param {{limit?: number}} [options]
 */
function createGate(options = {}) {
  let limit = normalizeLimit(options.limit);
  let active = 0;
  const queue = [];

  function acquire() {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      queue.push(resolve);
    });
  }

  function release() {
    // 有等待者时直接把名额转移过去，active 保持不变
    const next = queue.shift();
    if (next) {
      next();
      return;
    }
    active = Math.max(0, active - 1);
  }

  async function run(fn) {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  function setLimit(nextLimit) {
    const normalized = normalizeLimit(nextLimit, limit);
    if (normalized === limit) return;
    limit = normalized;
    // 放宽限制后立刻唤醒排队者
    while (active < limit && queue.length > 0) {
      const next = queue.shift();
      active += 1;
      next();
    }
  }

  return {
    acquire,
    release,
    run,
    setLimit,
    get limit() {
      return limit;
    },
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
  };
}

module.exports = { DEFAULT_LIMIT, createGate, normalizeLimit };