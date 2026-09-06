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

/* ==================== markdown → 简单 HTML（导出 HTML/PDF 共用） ==================== */

// 编辑器自身产出的行内 HTML 白名单：<u>、<br>、带 style 的 <mark>/<span>。
// 其余 HTML 一律转义，导出安全优先。
const ALLOWED_TAG_RE =
  /^<(\/?)(u|mark|span|br)((?:\s+style="[^"<>]*")?)\s*\/?>/i;

// 行内代码占位符：先提取保护，避免代码内容被行内格式二次替换
const CODE_TOKEN_RE = /\x00c(\d+)\x00/g;

/** 行内转换：行内代码保护 → 转义 → 白名单标签放行 → 粗/斜/删/链接/图片 */
function renderInline(text) {
  // 1. 提取行内代码（先转义其内容再存为占位符）
  const codeSlots = [];
  const protectedText = String(text).replace(/`([^`]+)`/g, (_, code) => {
    codeSlots.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00c${codeSlots.length - 1}\x00`;
  });

  // 2. 白名单标签提取（占位符保护），其余文本转义
  const tagSlots = [];
  const masked = protectedText.replace(/<[^>]+>/g, (tag) => {
    if (ALLOWED_TAG_RE.test(tag)) {
      tagSlots.push(tag);
      return `\x00t${tagSlots.length - 1}\x00`;
    }
    // 不在白名单：按普通文本处理（保留原样，交给下一步统一转义）
    return tag;
  });

  let result = escapeHtml(masked);

  // 3. 图片 → 链接 → 粗体 → 删除线 → 斜体（顺序：长标记先于短标记）
  result = result
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

  // 4. 还原白名单标签与行内代码
  return result
    .replace(/\x00t(\d+)\x00/g, (_, n) => tagSlots[Number(n)] ?? "")
    .replace(CODE_TOKEN_RE, (_, n) => codeSlots[Number(n)] ?? "");
}

/** 任务项前缀：返回 { html, rest } 或 null */
function parseTaskItem(text) {
  const m = text.match(/^\[([ xX])\]\s+(.*)$/);
  if (!m) return null;
  return {
    html: `<input type="checkbox" disabled${m[1] !== " " ? " checked" : ""}> `,
    rest: m[2],
  };
}

/** 解析以 | 分隔的表格行（去首尾空管道与空白） */
function parseTableRow(line) {
  let cells = line.trim();
  if (cells.startsWith("|")) cells = cells.slice(1);
  if (cells.endsWith("|")) cells = cells.slice(0, -1);
  return cells.split("|").map((c) => c.trim());
}

/** 表格分隔行（:--- / :---: / ---:）判定，并提取每列对齐方式 */
function parseTableSeparator(line) {
  const cells = parseTableRow(line);
  if (cells.length === 0) return null;
  const aligns = [];
  for (const c of cells) {
    const m = c.match(/^(:?)-+(:?)$/);
    if (!m) return null;
    aligns.push(m[1] && m[2] ? "center" : m[2] ? "right" : "left");
  }
  return aligns;
}

const ALIGN_STYLE = { center: ' style="text-align:center"', right: ' style="text-align:right"' };

/**
 * 块级转换主循环。支持的块：标题 h1-h6、围栏代码块（```/~~~）、blockquote
 * 连续行聚合、无序/有序列表（一层嵌套）、任务列表、GFM 表格、分割线、
 * 整行对齐 div、空行分段 <p>。段落内单换行以 <br> 保留（笔记场景以视觉一致优先）。
 */
function renderBlocks(lines) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // 空行
    if (trimmed === "") {
      i++;
      continue;
    }

    // 围栏代码块
    const fence = trimmed.match(/^(`{3,}|~{3,})\s*(\S*)$/);
    if (fence) {
      const closeMark = fence[1][0].repeat(3);
      const lang = /^[a-zA-Z0-9+#-]*$/.test(fence[2]) ? fence[2] : "";
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(closeMark)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 跳过闭合围栏（或越界结束）
      const cls = lang ? ` class="language-${lang}"` : "";
      out.push(`<pre><code${cls}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    // 标题
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    // 分割线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // 整行对齐 div（单行包裹或多行块）
    const alignDiv = trimmed.match(
      /^<div\s+style="text-align:\s*(left|center|right);?"\s*>$/i,
    );
    if (alignDiv) {
      const inner = [];
      i++;
      while (i < lines.length && !/^\s*<\/div>\s*$/i.test(lines[i])) {
        inner.push(lines[i]);
        i++;
      }
      i++; // 跳过 </div>
      out.push(
        `<div style="text-align:${alignDiv[1].toLowerCase()}">${renderBlocks(inner).join("\n")}</div>`,
      );
      continue;
    }
    // 单行对齐 div：编辑器 setAlignment 产出 <div style="text-align:x">文字</div>
    const alignOne = trimmed.match(
      /^<div\s+style="text-align:\s*(left|center|right);?"\s*>([\s\S]*)<\/div>$/i,
    );
    if (alignOne && !/[<>]/.test(alignOne[2].replace(/<[^>]*>/g, ""))) {
      out.push(
        `<div style="text-align:${alignOne[1].toLowerCase()}"><p>${renderInline(alignOne[2])}</p></div>`,
      );
      i++;
      continue;
    }

    // blockquote 连续行聚合
    if (trimmed.startsWith(">")) {
      const quoted = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoted.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderBlocks(quoted).join("\n")}</blockquote>`);
      continue;
    }

    // 列表（无序/有序/任务，一层嵌套）
    const isListItem = (line) => /^\s*([-*+]|\d+[.)])\s+/.test(line);
    if (isListItem(raw)) {
      const items = [];
      while (i < lines.length && isListItem(lines[i])) {
        const m = lines[i].match(/^(\s*)([-*+]|(\d+)[.)])\s+(.*)$/);
        if (m) {
          const task = parseTaskItem(m[4]);
          items.push({
            depth: m[1].replace(/\t/g, "  ").length >= 2 ? 1 : 0,
            ordered: !!m[3],
            task,
            text: task ? task.rest : m[4],
          });
        }
        i++;
      }
      // 同层 ul/ol 混排时 renderList 会在异型处断开，需循环渲染剩余项
      let li = 0;
      while (li < items.length) {
        const [html, next] = renderList(items, li, items[li].depth);
        out.push(html);
        li = next > li ? next : li + 1;
      }
      continue;
    }

    // GFM 表格：表头行 + 分隔行
    const sep = lines[i + 1] !== undefined ? parseTableSeparator(lines[i + 1]) : null;
    if (trimmed.includes("|") && sep && parseTableRow(trimmed).length === sep.length) {
      const headCells = parseTableRow(trimmed);
      let html = "<table><thead><tr>";
      headCells.forEach((c, idx) => {
        html += `<th${ALIGN_STYLE[sep[idx]] || ""}>${renderInline(c)}</th>`;
      });
      html += "</tr></thead><tbody>";
      i += 2;
      while (i < lines.length && lines[i].trim() !== "" && lines[i].trim().includes("|") && !/^(#{1,6})\s|^>\s|^(-{3,}|\*{3,})$|^```|^~~~/.test(lines[i].trim())) {
        const rowCells = parseTableRow(lines[i]);
        html += "<tr>";
        for (let idx = 0; idx < headCells.length; idx++) {
          html += `<td${ALIGN_STYLE[sep[idx]] || ""}>${renderInline(rowCells[idx] ?? "")}</td>`;
        }
        html += "</tr>";
        i++;
      }
      html += "</tbody></table>";
      out.push(html);
      continue;
    }

    // 段落：连续非空、非块级行合并为一个 <p>（单换行以 <br> 保留）
    const para = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (t === "") break;
      if (/^(#{1,6})\s|^>|^(-{3,}|\*{3,}|_{3,})$|^```|^~~~|^<div\s+style="text-align:/i.test(t)) break;
      if (isListItem(lines[i])) break;
      // 下一行是表格分隔行 → 当前是表格表头，交给表格分支
      if (t.includes("|") && parseTableSeparator(lines[i + 1] ?? "")) break;
      para.push(t);
      i++;
    }
    if (para.length > 0) {
      out.push(`<p>${para.map(renderInline).join("<br>")}</p>`);
    } else {
      i++; // 兜底：无法归类的行跳过，避免死循环
    }
  }

  return out;
}

/** 列表渲染：items 已按行序展开，同一 depth 允许 ul/ol 混排（各自成表），嵌套一层 */
function renderList(items, start, depth) {
  const ordered = items[start].ordered;
  let html = `<${ordered ? "ol" : "ul"}>`;
  let idx = start;
  let open = false;

  while (idx < items.length) {
    const item = items[idx];
    if (item.depth < depth) break;
    if (item.depth === depth) {
      if (item.ordered !== ordered) break; // 同层异型：闭合后由上层另起新表
      if (open) html += "</li>";
      html += `<li>${item.task ? item.task.html : ""}${renderInline(item.text)}`;
      open = true;
      idx++;
      // 嵌套子列表挂进当前 <li>
      if (idx < items.length && items[idx].depth > depth) {
        const [sub, next] = renderList(items, idx, depth + 1);
        html += sub;
        idx = next;
      }
    } else {
      // 深度跳跃超过一层：按嵌套处理
      const [sub, next] = renderList(items, idx, depth + 1);
      html += sub;
      idx = next;
    }
  }
  if (open) html += "</li>";
  html += `</${ordered ? "ol" : "ul"}>`;
  return [html, idx];
}

/** 将 markdown 文本转换为简单 HTML（导出 HTML/PDF 共用） */
function markdownToSimpleHtml(content) {
  return renderBlocks((content || "").split("\n")).join("\n");
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
