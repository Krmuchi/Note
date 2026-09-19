// 并发闸门：限制同时进行中的 AI 请求数，超出的排队等待。
// 纯函数层：不得 require("electron")。
//
// 流式请求同样必须走闸门 —— 长连接占用上游配额，不限流会在用户连点或批量操作时
// 打满配额并触发 429 风暴。

const DEFAULT_LIMIT = 3;

/**
 * @param {{limit?: number}} [options]
 */
function createGate(options = {}) {
  let limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
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
    limit = Math.max(1, nextLimit);
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

module.exports = { DEFAULT_LIMIT, createGate };