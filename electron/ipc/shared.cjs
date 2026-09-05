// IPC handlers 共用工具：payload 校验、文件名清洗、HTML 转义。
// 从 main.cjs 纯拆分而来，逻辑不变。

const MAX_STORE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_EXPORT_CONTENT_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_EXPORT_DOCS = 10000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // base64 后 20MB

const isNonEmptyString = (v) => typeof v === "string" && v.length > 0;
const isOptionalString = (v) => v === undefined || v === null || typeof v === "string";

/** 校验 notes:save 全量存储 payload 结构 */
function assertStorePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid save payload: expected an object");
  }
  if (!Array.isArray(payload.notebooks)) {
    throw new Error("Invalid save payload: notebooks must be an array");
  }
  if (!Array.isArray(payload.trash)) {
    throw new Error("Invalid save payload: trash must be an array");
  }
  if (payload.tags !== undefined && !Array.isArray(payload.tags)) {
    throw new Error("Invalid save payload: tags must be an array");
  }
  if (payload.searchHistory !== undefined && !Array.isArray(payload.searchHistory)) {
    throw new Error("Invalid save payload: searchHistory must be an array");
  }
  if (!isOptionalString(payload.activeNotebookId) || !isOptionalString(payload.activeDocId)) {
    throw new Error("Invalid save payload: active ids must be strings");
  }
  // 序列化一次并返回结果，供写盘复用（避免大 payload 校验+写盘各 stringify 一遍）
  const json = JSON.stringify(payload, null, 2);
  const size = Buffer.byteLength(json, "utf-8");
  if (size > MAX_STORE_BYTES) {
    throw new Error(`Save payload too large: ${(size / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_STORE_BYTES / 1024 / 1024}MB limit`);
  }
  return json;
}

/** 校验导出类 payload（title/content/docs） */
function assertExportPayload(payload, { allowDocs = false } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid export payload: expected an object");
  }
  if (payload.title !== undefined && !isNonEmptyString(payload.title)) {
    throw new Error("Invalid export payload: title must be a non-empty string");
  }
  if (payload.title !== undefined && payload.title.length > 500) {
    throw new Error("Invalid export payload: title too long");
  }
  if (!allowDocs) {
    if (payload.content !== undefined && typeof payload.content !== "string") {
      throw new Error("Invalid export payload: content must be a string");
    }
    if (typeof payload.content === "string" && Buffer.byteLength(payload.content, "utf-8") > MAX_EXPORT_CONTENT_BYTES) {
      throw new Error("Invalid export payload: content too large");
    }
    return;
  }
  if (!Array.isArray(payload.docs) || payload.docs.length > MAX_EXPORT_DOCS) {
    throw new Error(`Invalid export payload: docs must be an array of at most ${MAX_EXPORT_DOCS} items`);
  }
  for (const doc of payload.docs) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      throw new Error("Invalid export payload: each doc must be an object");
    }
    if (typeof doc.title !== "string" || typeof doc.content !== "string") {
      throw new Error("Invalid export payload: doc.title and doc.content must be strings");
    }
    if (Buffer.byteLength(doc.content, "utf-8") > MAX_EXPORT_CONTENT_BYTES) {
      throw new Error("Invalid export payload: doc content too large");
    }
  }
}

const safeName = (name) => (name || "note").replace(/[\\/:*?"<>|]/g, "_");

/** HTML 转义，防止笔记内容/标题中注入脚本（导出 HTML/PDF 时必须） */
const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** 将 markdown 文本按行转换为带转义的简单 HTML（导出 HTML/PDF 共用） */
function markdownToSimpleHtml(content) {
  return (content || "")
    .split("\n")
    .map((raw) => {
      if (raw.startsWith("# ")) return `<h1>${escapeHtml(raw.slice(2))}</h1>`;
      if (raw.startsWith("## ")) return `<h2>${escapeHtml(raw.slice(3))}</h2>`;
      if (raw.startsWith("### ")) return `<h3>${escapeHtml(raw.slice(4))}</h3>`;
      if (raw.startsWith("#### ")) return `<h4>${escapeHtml(raw.slice(5))}</h4>`;
      if (raw.startsWith("> ")) return `<blockquote><p>${escapeHtml(raw.slice(2))}</p></blockquote>`;
      if (raw.startsWith("- ")) return `<li>${escapeHtml(raw.slice(2))}</li>`;
      if (raw.startsWith("* ")) return `<li>${escapeHtml(raw.slice(2))}</li>`;
      if (raw.startsWith("```")) return "";
      if (/^\d+\.\s/.test(raw)) return `<li>${escapeHtml(raw.replace(/^\d+\.\s/, ""))}</li>`;
      if (raw.trim() === "") return "<br>";
      return `<p>${escapeHtml(raw)}</p>`;
    })
    .join("\n");
}

module.exports = {
  MAX_STORE_BYTES,
  MAX_EXPORT_CONTENT_BYTES,
  MAX_EXPORT_DOCS,
  MAX_IMAGE_BYTES,
  assertStorePayload,
  assertExportPayload,
  safeName,
  escapeHtml,
  markdownToSimpleHtml,
};
