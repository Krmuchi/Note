/**
 * Markdown 文本操作工具：对 textarea 选区/光标位置的纯文本编辑操作。
 * 从 Editor.tsx 抽取，便于复用与独立测试。
 */

/** 在 textarea 中为选中文本添加包裹标记（再次应用则取消包裹） */
export function wrapSelection(ta: HTMLTextAreaElement, prefix: string, suffix: string = prefix): string | null {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  const selected = text.substring(start, end);

  // 如果已包裹则取消包裹
  if (
    selected.startsWith(prefix) && selected.endsWith(suffix) && selected.length > prefix.length + suffix.length
  ) {
    const innerText = selected.substring(prefix.length, selected.length - suffix.length);
    ta.value = text.substring(0, start) + innerText + text.substring(end);
    ta.selectionStart = start;
    ta.selectionEnd = start + innerText.length;
    ta.focus();
    return ta.value;
  }

  const newText = prefix + selected + suffix;
  ta.value = text.substring(0, start) + newText + text.substring(end);
  ta.selectionStart = start + prefix.length;
  ta.selectionEnd = start + prefix.length + selected.length;
  ta.focus();
  return ta.value;
}

/** 在光标所在行行首插入/取消块级标记（如标题、列表） */
export function insertBlockMark(ta: HTMLTextAreaElement, mark: string): string | null {
  const start = ta.selectionStart;
  const text = ta.value;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', start);
  const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);

  // 如果行首已有相同标记，则取消
  if (line.startsWith(mark)) {
    ta.value = text.substring(0, lineStart) + line.substring(mark.length) + text.substring(lineEnd === -1 ? text.length : lineEnd);
    ta.selectionStart = lineStart;
    ta.selectionEnd = lineStart + line.substring(mark.length).length;
    ta.focus();
    return ta.value;
  }

  ta.value = text.substring(0, lineStart) + mark + line + text.substring(lineEnd === -1 ? text.length : lineEnd);
  ta.selectionStart = lineStart + mark.length;
  ta.selectionEnd = lineStart + mark.length + line.length;
  ta.focus();
  return ta.value;
}

/** 在光标位置插入内容（如分割线、表格） */
export function insertAtLine(ta: HTMLTextAreaElement, content: string, newLine: boolean = true): string | null {
  const start = ta.selectionStart;
  const text = ta.value;
  const insertText = newLine ? `\n${content}\n` : content;
  const prefix = text.substring(0, start);
  const suffix = text.substring(start);
  const needLeadingNewline = prefix.length > 0 && !prefix.endsWith('\n');
  const finalText = (needLeadingNewline ? '\n' : '') + insertText;
  ta.value = prefix + finalText + suffix;
  ta.selectionStart = ta.selectionEnd = start + finalText.length;
  ta.focus();
  return ta.value;
}

/** 增加/减少选中行的缩进 */
export function changeIndent(ta: HTMLTextAreaElement, increase: boolean): string | null {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);
  const realEnd = lineEnd === -1 ? text.length : lineEnd;
  const block = text.substring(lineStart, realEnd);
  const lines = block.split('\n');
  const newLines = lines.map((line) => {
    if (increase) return '  ' + line;
    return line.startsWith('  ') ? line.substring(2) : line.startsWith(' ') ? line.substring(1) : line;
  });
  const newBlock = newLines.join('\n');
  ta.value = text.substring(0, lineStart) + newBlock + text.substring(realEnd);
  ta.selectionStart = lineStart;
  ta.selectionEnd = lineStart + newBlock.length;
  ta.focus();
  return ta.value;
}

/** 清除选中文本或当前行的 Markdown/HTML 格式标记 */
export function clearFormatting(ta: HTMLTextAreaElement): string | null {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  const realStart = start === end ? text.lastIndexOf('\n', start - 1) + 1 : start;
  const realEnd = start === end ? (text.indexOf('\n', start) === -1 ? text.length : text.indexOf('\n', start)) : end;
  let target = text.substring(realStart, realEnd);
  target = target
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/^\s*-\s\[[ x]\]\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/<u>(.+?)<\/u>/g, '$1')
    .replace(/<mark[^>]*>(.+?)<\/mark>/g, '$1')
    .replace(/<span[^>]*>(.+?)<\/span>/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  ta.value = text.substring(0, realStart) + target + text.substring(realEnd);
  ta.selectionStart = realStart;
  ta.selectionEnd = realStart + target.length;
  ta.focus();
  return ta.value;
}

/** 设置当前行的段落对齐方式 */
export function setAlignment(ta: HTMLTextAreaElement, align: 'left' | 'center' | 'right'): string | null {
  const start = ta.selectionStart;
  const text = ta.value;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', start);
  const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
  const stripped = line.replace(/<div style="text-align:[^"]+">|<\/div>/g, '');
  const wrapped = align === 'left' ? stripped : `<div style="text-align:${align}">${stripped}</div>`;
  ta.value = text.substring(0, lineStart) + wrapped + text.substring(lineEnd === -1 ? text.length : lineEnd);
  ta.selectionStart = lineStart;
  ta.selectionEnd = lineStart + wrapped.length;
  ta.focus();
  return ta.value;
}

/** 生成指定行列的 Markdown 表格（首行为表头） */
export function buildTableMarkdown(rows: number, cols: number): string {
  const safeRows = Math.max(1, Math.min(rows, 20));
  const safeCols = Math.max(1, Math.min(cols, 12));
  const header = `| ${Array.from({ length: safeCols }, (_, i) => `列${i + 1}`).join(' | ')} |`;
  const divider = `| ${Array(safeCols).fill('---').join(' | ')} |`;
  const body = Array.from(
    { length: Math.max(0, safeRows - 1) },
    () => `| ${Array(safeCols).fill('内容').join(' | ')} |`,
  );
  return [header, divider, ...body].join('\n');
}

/** 生成代码块围栏；language 为空时使用无语言围栏 */
export function buildCodeFence(language?: string): string {
  return '```' + (language || '');
}

/**
 * 在光标/选区处插入公式：
 * - 有选区 → 包裹为行内公式 `$$…$$`（已包裹则解除）
 * - 无选区 → 插入独立公式块模板 `$$\n\n$$\n`，光标落在中间空行
 */
export function insertFormula(ta: HTMLTextAreaElement): string | null {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = ta.value.substring(start, end);

  if (selected) {
    if (selected.startsWith('$$') && selected.endsWith('$$') && selected.length > 4) {
      const inner = selected.substring(2, selected.length - 2);
      ta.value = ta.value.substring(0, start) + inner + ta.value.substring(end);
      ta.selectionStart = start;
      ta.selectionEnd = start + inner.length;
      ta.focus();
      return ta.value;
    }
    ta.value = ta.value.substring(0, start) + '$$' + selected + '$$' + ta.value.substring(end);
    ta.selectionStart = start + 2;
    ta.selectionEnd = start + 2 + selected.length;
    ta.focus();
    return ta.value;
  }

  // 块级模板：`$$\n\n$$\n`，光标放在中间空行（索引 3）
  const template = '$$\n\n$$\n';
  ta.value = ta.value.substring(0, start) + template + ta.value.substring(end);
  ta.selectionStart = ta.selectionEnd = start + 3;
  ta.focus();
  return ta.value;
}

/**
 * Markdown 行内标记自动补全（无选区时生效）：
 * - 输入 `` ` `` → 补全为 `` `` ``，光标居中；已存在闭合反引号时直接跳过
 * - 输入第二个 `*` / `~` → 补全为 `**|**` / `~~|~~`
 * - 光标紧邻已有闭合标记时，输入同字符直接跳过而不是重复插入
 * 返回 true 表示已接管本次按键（调用方需 preventDefault）。
 */
export function autoPairMarker(ta: HTMLTextAreaElement, key: string): boolean {
  // 有选区时保持默认替换行为，避免误吞选区
  if (ta.selectionStart !== ta.selectionEnd) return false;

  const pos = ta.selectionStart;
  const value = ta.value;
  const before = value.substring(0, pos);
  const after = value.substring(pos);

  const skip = (len: number): boolean => {
    ta.selectionStart = ta.selectionEnd = pos + len;
    return true;
  };

  const insertPair = (text: string, cursorOffset: number): boolean => {
    const next = value.substring(0, pos) + text + after;
    ta.value = next;
    ta.selectionStart = ta.selectionEnd = pos + cursorOffset;
    return true;
  };

  if (key === '`') {
    // 光标正好夹在一对反引号之间：跳过已有闭合标记，完成配对
    if (before.endsWith('`') && after.startsWith('`')) return skip(1);
    // 连续反引号（代码围栏 ```）保持默认输入
    if (before.endsWith('`')) return false;
    return insertPair('``', 1);
  }

  if (key === '*') {
    if (before.endsWith('*') && after.startsWith('*')) return skip(1);
    // 输入第二个 * 时补全为 **|**
    if (before.endsWith('*') && !before.endsWith('**')) return insertPair('***', 1);
    return false;
  }

  if (key === '~') {
    if (before.endsWith('~') && after.startsWith('~')) return skip(1);
    if (before.endsWith('~') && !before.endsWith('~~')) return insertPair('~~~', 1);
    return false;
  }

  return false;
}

/** 斜杠命令触发片段：`/` 位于行首或空白之后，且其后无空格 */
export interface SlashToken {
  /** `/` 字符的索引 */
  start: number;
  /** 光标位置（不含已选区） */
  end: number;
  /** `/` 之后的查询词 */
  query: string;
}

/** 检测光标前的斜杠命令片段；未命中返回 null */
export function detectSlashToken(ta: HTMLTextAreaElement): SlashToken | null {
  const pos = ta.selectionStart;
  if (pos !== ta.selectionEnd) return null;
  const value = ta.value;
  const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
  const before = value.substring(lineStart, pos);
  const matched = /(?:^|\s)\/([^\s/]*)$/.exec(before);
  if (!matched) return null;
  const query = matched[1];
  return { start: pos - query.length - 1, end: pos, query };
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

/**
 * 计算指定字符索引处的像素坐标（用于斜杠菜单定位）。
 * 采用「canvas 量文本 + 行号 × 行高」换算，不引入定位库；
 * 结果已按视口尺寸收敛，避免浮层溢出屏幕。
 */
export function getCaretPixelPosition(ta: HTMLTextAreaElement, index: number): { top: number; left: number } {
  const rect = ta.getBoundingClientRect();
  const style = getComputedStyle(ta);
  const fontSize = parseFloat(style.fontSize) || 14;
  const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.6;
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padTop = parseFloat(style.paddingTop) || 0;
  const value = ta.value;
  const lineStart = value.lastIndexOf('\n', index - 1) + 1;
  const lineIndex = value.slice(0, index).split('\n').length - 1;
  const colText = value.substring(lineStart, index);

  if (measureCtx === undefined) {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  let width = 0;
  if (measureCtx) {
    measureCtx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    width = measureCtx.measureText(colText).width;
  }

  const left = rect.left + padLeft + width - ta.scrollLeft;
  const top = rect.top + padTop + (lineIndex + 1) * lineHeight - ta.scrollTop;
  return {
    top: Math.min(top, Math.max(8, window.innerHeight - 48)),
    left: Math.min(left, Math.max(8, window.innerWidth - 300)),
  };
}

/** 行首块标记：任务列表 / 无序列表 / 有序列表 / 引用 */
const RE_TASK = /^(\s*)[-*+]\s+\[([ xX])\]\s+([\s\S]*)$/;
const RE_ULIST = /^(\s*)([-*+])(\s+)([\s\S]*)$/;
const RE_OLIST = /^(\s*)(\d+)([.)])(\s+)([\s\S]*)$/;
const RE_QUOTE = /^(\s*)(>\s?)([\s\S]*)$/;

/** 在光标/选区处插入纯文本（用于纯文本粘贴、HTML→Markdown 粘贴等） */
export function insertTextAtCursor(ta: HTMLTextAreaElement, text: string): string | null {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const value = ta.value;
  const next = value.substring(0, start) + text + value.substring(end);
  ta.value = next;
  ta.selectionStart = ta.selectionEnd = start + text.length;
  ta.focus();
  return next;
}

/** 在光标/选区处插入标记文本，并把光标移到标记之后 */
function insertAtCursor(ta: HTMLTextAreaElement, start: number, end: number, marker: string): string {
  const value = ta.value.substring(0, start) + marker + ta.value.substring(end);
  ta.value = value;
  ta.selectionStart = ta.selectionEnd = start + marker.length;
  ta.focus();
  return value;
}

/** 清空整行（用于空列表项回车退出列表） */
function clearLine(ta: HTMLTextAreaElement, lineStart: number, lineEnd: number): string {
  const value = ta.value.substring(0, lineStart) + ta.value.substring(lineEnd);
  ta.value = value;
  ta.selectionStart = ta.selectionEnd = lineStart;
  ta.focus();
  return value;
}

/**
 * 回车时续写当前块标记：
 * - 任务列表 `- [x] ` 续写为 `- [ ] `（下一项默认未完成）
 * - 有序列表序号自动 +1
 * - 引用 `> `、无序列表 `- ` 原样续写
 * - 空列表/引用项（标记后无内容且光标在行尾）回车则清除标记退出块
 * 未被任何块标记匹配时返回 null，由调用方走原生回车行为。
 * 全程只读取当前行，复杂度 O(当前行长度)。
 */
export function continueBlockOnEnter(ta: HTMLTextAreaElement): string | null {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = text.indexOf('\n', start);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const line = text.substring(lineStart, lineEnd);
  // 仅光标位于行尾时才允许"退出块"，否则视为在行中间拆分
  const atLineEnd = start === lineEnd && end === lineEnd;

  const task = RE_TASK.exec(line);
  if (task) {
    if (task[3].trim() === '' && atLineEnd) return clearLine(ta, lineStart, lineEnd);
    return insertAtCursor(ta, start, end, `\n${task[1]}- [ ] `);
  }

  const ul = RE_ULIST.exec(line);
  if (ul) {
    if (ul[4].trim() === '' && atLineEnd) return clearLine(ta, lineStart, lineEnd);
    return insertAtCursor(ta, start, end, `\n${ul[1]}${ul[2]} `);
  }

  const ol = RE_OLIST.exec(line);
  if (ol) {
    if (ol[5].trim() === '' && atLineEnd) return clearLine(ta, lineStart, lineEnd);
    const next = Number(ol[2]) + 1;
    return insertAtCursor(ta, start, end, `\n${ol[1]}${next}${ol[3]} `);
  }

  const quote = RE_QUOTE.exec(line);
  if (quote) {
    if (quote[3].trim() === '' && atLineEnd) return clearLine(ta, lineStart, lineEnd);
    return insertAtCursor(ta, start, end, `\n${quote[1]}> `);
  }

  return null;
}
