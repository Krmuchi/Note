// 崩溃日志（D5）：主进程异常、渲染进程崩溃都记在这里。
//
// 设计底线：**只落本机、不联网**。用户点"复制诊断信息"时才把内容交出去，
// 由用户自己决定发给谁 —— 笔记应用的数据太私密，不该有任何静默上报。
//
// 纯逻辑（fs 注入），便于 vitest 直接测试。

const CRASH_LOG_FILE = "crash-log.json";
const MAX_ENTRIES = 20;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 4000;

const KNOWN_TYPES = ["main-uncaught", "main-rejection", "renderer-gone", "child-process-gone"];

function truncate(value, limit) {
  const text = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
  return text.length > limit ? text.slice(0, limit) + "…" : text;
}

/** 归一化一条崩溃记录：丢弃未知 type、截断超长文本，避免日志被撑爆 */
function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!KNOWN_TYPES.includes(raw.type)) return null;
  return {
    type: raw.type,
    at: typeof raw.at === "string" && raw.at ? raw.at : new Date().toISOString(),
    message: truncate(raw.message, MAX_MESSAGE_LENGTH),
    stack: truncate(raw.stack, MAX_STACK_LENGTH),
    appVersion: typeof raw.appVersion === "string" ? truncate(raw.appVersion, 40) : "",
    platform: typeof raw.platform === "string" ? truncate(raw.platform, 40) : "",
  };
}

/**
 * @param {object} deps
 * @param {string} deps.dir 日志文件所在目录
 * @param {object} [deps.fsSync] 注入 node:fs（测试可替换）
 */
function createCrashLogStore({ dir, fsSync = require("node:fs") }) {
  const path = require("node:path");
  const file = path.join(dir, CRASH_LOG_FILE);

  function readAll() {
    try {
      const parsed = JSON.parse(fsSync.readFileSync(file, "utf-8"));
      if (!Array.isArray(parsed)) return [];
      return parsed.map((entry) => normalizeEntry(entry)).filter(Boolean);
    } catch {
      return [];
    }
  }

  function writeAll(entries) {
    try {
      fsSync.writeFileSync(file, JSON.stringify(entries.slice(-MAX_ENTRIES), null, 2), "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  function append(raw) {
    const entry = normalizeEntry(raw);
    if (!entry) return { ok: false, error: "崩溃记录格式无效" };

    const entries = readAll();
    entries.push(entry);
    const ok = writeAll(entries);
    return ok ? { ok: true, entry, count: Math.min(entries.length, MAX_ENTRIES) } : { ok: false, error: "崩溃日志写入失败" };
  }

  function readLatest() {
    const entries = readAll();
    return entries.length > 0 ? entries[entries.length - 1] : null;
  }

  function clear() {
    const ok = writeAll([]);
    return ok ? { ok: true } : { ok: false, error: "清理崩溃日志失败" };
  }

  return { file, append, readAll, readLatest, clear, count: () => readAll().length };
}

/** 单行摘要，进"复制诊断信息" */
function formatCrashEntry(entry) {
  if (!entry) return "（无崩溃记录）";
  const when = (() => {
    try {
      return new Date(entry.at).toLocaleString("zh-CN");
    } catch {
      return entry.at;
    }
  })();
  return when + " [" + entry.type + "] " + (entry.message || "（无消息）");
}

module.exports = {
  CRASH_LOG_FILE,
  MAX_ENTRIES,
  KNOWN_TYPES,
  createCrashLogStore,
  normalizeEntry,
  formatCrashEntry,
};
