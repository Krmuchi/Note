// 批量导入的纯逻辑（O4）：目录扫描、zip 条目筛选、图片链接重写。
//
// 与 export-options.cjs 同一约定：不 require electron，便于 vitest 直接测试。

const path = require("node:path");

const IMPORTABLE_EXTENSIONS = [".md", ".markdown", ".txt"];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif"];

/** 一次导入的上限：防止误选一个巨大目录把内存与 IPC 撑爆 */
const MAX_IMPORT_FILES = 2000;
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_SCAN_DEPTH = 8;

/** 导出包里常见的噪声目录/文件，不参与导入 */
const IGNORED_SEGMENTS = ["__MACOSX", ".git", "node_modules", ".obsidian", ".trash"];

function extensionOf(filePath) {
  return path.extname(String(filePath || "")).toLowerCase();
}

function hasIgnoredSegment(relativePath) {
  const segments = String(relativePath || "").split(/[\\/]+/);
  return segments.some((segment) => {
    if (!segment || segment === ".") return false;
    if (IGNORED_SEGMENTS.includes(segment)) return true;
    // 隐藏文件/目录（.DS_Store、.gitignore 等）一律跳过
    return segment.startsWith(".") && segment !== "..";
  });
}

/** 是否是可导入的文本文件（扩展名对 + 不在忽略目录里） */
function isImportablePath(relativePath) {
  if (!relativePath || hasIgnoredSegment(relativePath)) return false;
  return IMPORTABLE_EXTENSIONS.includes(extensionOf(relativePath));
}

function isImagePath(relativePath) {
  if (!relativePath || hasIgnoredSegment(relativePath)) return false;
  return IMAGE_EXTENSIONS.includes(extensionOf(relativePath));
}

/**
 * 推导标题：优先正文第一个 Markdown 标题，否则用文件名（去扩展名）。
 * 与"拖文件导入"（src/utils/droppedFiles.ts）保持同一规则。
 */
function titleFromImportPath(relativePath, content) {
  const firstLine = String(content || "").split("\n").find((line) => line.trim().length > 0) || "";
  const heading = firstLine.match(/^#{1,6}\s+(.+)$/);
  if (heading) return heading[1].trim();

  const base = path.basename(String(relativePath || ""), extensionOf(relativePath)).trim();
  return base || "导入的文档";
}

/**
 * 把一批 { path, content } 变成待创建的文档列表。
 * 过滤：忽略目录、非文本文件、超大文件；截断到上限。
 */
function buildImportPlan(files) {
  const list = Array.isArray(files) ? files : [];
  const docs = [];
  let skipped = 0;

  for (const file of list) {
    if (!file || typeof file.path !== "string") continue;
    if (!isImportablePath(file.path)) {
      skipped += 1;
      continue;
    }
    const content = typeof file.content === "string" ? file.content : "";
    if (Buffer.byteLength(content, "utf-8") > MAX_IMPORT_FILE_BYTES) {
      skipped += 1;
      continue;
    }
    if (docs.length >= MAX_IMPORT_FILES) {
      skipped += 1;
      continue;
    }
    docs.push({
      title: titleFromImportPath(file.path, content),
      content,
      sourcePath: file.path.split(/[\\/]+/).join("/"),
    });
  }

  return { docs, skipped, truncated: list.length > MAX_IMPORT_FILES };
}

/**
 * 重写正文里的图片/链接引用，让导入后仍能显示。
 *
 * `resolve` 收到原始引用（如 `attachments/a.png`），返回可用的新地址；
 * 返回 null 表示这张图没被解出来（保持原样，不要改坏）。
 */
function rewriteImageLinks(content, resolve) {
  if (typeof content !== "string" || typeof resolve !== "function") return content;

  // 同时覆盖 Markdown 图片/链接与内联 HTML 的 src/href
  return content
    .replace(/(!?\[[^\]]*\]\()([^)\s]+)(\))/g, (whole, head, ref, tail) => {
      if (/^(https?:|data:|file:)/i.test(ref)) return whole;
      const next = resolve(ref);
      return next ? head + next + tail : whole;
    })
    .replace(/(<(?:img|source)[^>]*\ssrc=["'])([^"']+)(["'])/gi, (whole, head, ref, tail) => {
      if (/^(https?:|data:|file:)/i.test(ref)) return whole;
      const next = resolve(ref);
      return next ? head + next + tail : whole;
    });
}

/** 保证落盘用的图片文件名唯一且安全（去掉目录、加序号前缀） */
function uniqueImageName(relativePath, index) {
  const base = path.basename(String(relativePath || "image")).replace(/[^\w.-]/g, "_").slice(-60);
  return String(index).padStart(4, "0") + "-" + (base || "image");
}

module.exports = {
  IMPORTABLE_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MAX_IMPORT_FILES,
  MAX_IMPORT_FILE_BYTES,
  MAX_SCAN_DEPTH,
  extensionOf,
  isImportablePath,
  isImagePath,
  titleFromImportPath,
  buildImportPlan,
  rewriteImageLinks,
  uniqueImageName,
};
