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
