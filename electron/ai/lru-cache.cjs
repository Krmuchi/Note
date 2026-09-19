// LRU + TTL 结果缓存 + 同 key in-flight Promise 去重。
// 纯函数层：不得 require("electron")；时间源通过 now() 注入，便于测试。
//
// 刻意不引入 setInterval 做后台清理：主进程里的定时器难以彻底清理，是常见泄漏来源。
// TTL 采用惰性判定，并在写入时顺带清理已过期条目。

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRY_BYTES = 256 * 1024;

function byteLength(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
    return Buffer.byteLength(text, 'utf-8');
  }
  return text.length;
}

/**
 * @param {object} [options]
 * @param {number} [options.maxEntries] 最大条目数
 * @param {number} [options.ttlMs] 条目存活时间
 * @param {number} [options.maxEntryBytes] 单条 value 字节上限，超限拒绝写入
 * @param {() => number} [options.now]
 */
function createLruCache(options = {}) {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntryBytes = options.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const now = options.now ?? Date.now;

  /** @type {Map<string, {value: any, expiresAt: number, bytes: number}>} */
  const entries = new Map();
  /** @type {Map<string, Promise<any>>} */
  const inFlight = new Map();
  const stats = { hits: 0, misses: 0, evictions: 0, rejections: 0 };

  function isExpired(entry) {
    return entry.expiresAt <= now();
  }

  /** 清理已过期条目（写入时顺带调用，不启动定时器） */
  function purgeExpired() {
    for (const [key, entry] of entries) {
      if (isExpired(entry)) entries.delete(key);
    }
  }

  function get(key) {
    const entry = entries.get(key);
    if (!entry) {
      stats.misses += 1;
      return undefined;
    }
    if (isExpired(entry)) {
      entries.delete(key);
      stats.misses += 1;
      return undefined;
    }
    // 命中后移到末尾，维持 LRU 顺序（Map 的插入顺序即使用顺序）
    entries.delete(key);
    entries.set(key, entry);
    stats.hits += 1;
    return entry.value;
  }

  /** @returns {boolean} 是否成功写入 */
  function set(key, value) {
    const bytes = byteLength(value);
    if (bytes > maxEntryBytes) {
      stats.rejections += 1;
      return false;
    }
    purgeExpired();
    if (entries.has(key)) entries.delete(key);
    entries.set(key, { value, expiresAt: now() + ttlMs, bytes });
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      entries.delete(oldest);
      stats.evictions += 1;
    }
    return true;
  }

  /**
   * 读缓存，未命中则调用 loader 并写入；同 key 并发调用共享同一个 Promise。
   *
   * loader 同步调用（而非包在 Promise.resolve().then 里）—— 保证 inFlight 登记与
   * loader 启动在同一时刻完成，否则同步连续发起的第二个调用可能看不到在途记录。
   *
   * @returns {Promise<{value: any, cached: boolean}>}
   */
  function getOrLoad(key, loader) {
    const cached = get(key);
    if (cached !== undefined) return Promise.resolve({ value: cached, cached: true });

    const pending = inFlight.get(key);
    if (pending) return pending;

    let promise;
    try {
      promise = Promise.resolve(loader()).then((value) => {
        set(key, value);
        return { value, cached: false };
      });
    } catch (err) {
      promise = Promise.reject(err);
    }
    promise = promise.finally(() => {
      inFlight.delete(key);
    });

    inFlight.set(key, promise);
    return promise;
  }

  function clear() {
    entries.clear();
    inFlight.clear();
  }

  return {
    get,
    set,
    getOrLoad,
    clear,
    get size() {
      return entries.size;
    },
    get pendingCount() {
      return inFlight.size;
    },
    get stats() {
      return { ...stats };
    },
    has(key) {
      const entry = entries.get(key);
      if (!entry) return false;
      if (isExpired(entry)) {
        entries.delete(key);
        return false;
      }
      return true;
    },
  };
}

module.exports = {
  DEFAULT_MAX_ENTRIES,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ENTRY_BYTES,
  createLruCache,
};