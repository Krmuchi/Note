/**
 * 编辑器行级文本操作（复制行 / 移动行 / 删除行 / 缩进 / 上方或下方插入空行）。
 * 供快捷键分发（useEditorKeys）调用；所有修改都经 updateDocContent 回写，以保留撤销与版本快照。
 */

import type { RefObject } from 'react';
import type { NoteDoc } from '@/types';

interface UseEditorLineOpsOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  activeDoc: NoteDoc | null;
  updateDocContent: (changes: Partial<NoteDoc>) => void;
}

export function useEditorLineOps({ textareaRef, activeDoc, updateDocContent }: UseEditorLineOpsOptions): {
  duplicateLine: () => void;
  moveLine: (direction: -1 | 1) => void;
  deleteLine: () => void;
  indentLine: (increase: boolean) => void;
  insertLineBelow: () => void;
  insertLineAbove: () => void;
} {
  // 设置光标位置（使用 requestAnimationFrame 确保在 React 重渲染后执行）
  const setCursorPosition = (position: number): void => {
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.selectionStart = ta.selectionEnd = position;
      }
    });
  };

  // 获取当前行索引和行首字符偏移量
  const getCurrentLineInfo = (content: string, cursorPos: number): { lines: string[]; lineIndex: number; lineStartOffset: number } => {
    const lines = content.split('\n');
    let lineIndex = 0;
    let lineStartOffset = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lineStartOffset + lines[i].length >= cursorPos) {
        lineIndex = i;
        break;
      }
      lineStartOffset += lines[i].length + 1;
    }
    return { lines, lineIndex, lineStartOffset };
  };

  // 复制当前行
  const duplicateLine = (): void => {
    const ta = textareaRef.current;
    if (!ta || !activeDoc) return;

    const start = ta.selectionStart;
    const content = ta.value;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = content.indexOf('\n', start);
    const line = content.substring(lineStart, lineEnd === -1 ? content.length : lineEnd);

    const newContent = content.substring(0, lineEnd === -1 ? content.length : lineEnd) + '\n' + line + content.substring(lineEnd === -1 ? content.length : lineEnd);
    updateDocContent({ content: newContent });

    setCursorPosition(start + line.length + 1);
  };

  // 移动行
  const moveLine = (direction: -1 | 1): void => {
    const ta = textareaRef.current;
    if (!ta || !activeDoc) return;

    const start = ta.selectionStart;
    const content = ta.value;
    const { lines, lineIndex: currentLineIndex, lineStartOffset } = getCurrentLineInfo(content, start);

    const targetIndex = currentLineIndex + direction;
    if (targetIndex < 0 || targetIndex >= lines.length) return;

    // 交换行
    [lines[currentLineIndex], lines[targetIndex]] = [lines[targetIndex], lines[currentLineIndex]];

    const newContent = lines.join('\n');
    updateDocContent({ content: newContent });

    let newPosition = 0;
    for (let i = 0; i < targetIndex; i++) {
      newPosition += lines[i].length + 1;
    }
    setCursorPosition(newPosition + Math.min(start - lineStartOffset, lines[targetIndex].length));
  };

  // 删除当前行
  const deleteLine = (): void => {
    const ta = textareaRef.current;
    if (!ta || !activeDoc) return;

    const start = ta.selectionStart;
    const content = ta.value;
    const { lines, lineIndex: currentLineIndex } = getCurrentLineInfo(content, start);

    // 删除行
    lines.splice(currentLineIndex, 1);
    const newContent = lines.join('\n');
    updateDocContent({ content: newContent });

    let newPosition = 0;
    for (let i = 0; i < Math.min(currentLineIndex, lines.length - 1); i++) {
      newPosition += lines[i].length + 1;
    }
    setCursorPosition(newPosition);
  };

  // 缩进行
  const indentLine = (increase: boolean): void => {
    const ta = textareaRef.current;
    if (!ta || !activeDoc) return;

    const start = ta.selectionStart;
    const content = ta.value;
    const { lines, lineIndex: currentLineIndex } = getCurrentLineInfo(content, start);

    if (increase) {
      lines[currentLineIndex] = '  ' + lines[currentLineIndex];
    } else {
      if (lines[currentLineIndex].startsWith('  ')) {
        lines[currentLineIndex] = lines[currentLineIndex].substring(2);
      } else if (lines[currentLineIndex].startsWith(' ')) {
        lines[currentLineIndex] = lines[currentLineIndex].substring(1);
      }
    }

    const newContent = lines.join('\n');
    updateDocContent({ content: newContent });

    const offset = increase ? 2 : -Math.min(2, lines[currentLineIndex].length);
    setCursorPosition(start + offset);
  };

  // 在下方插入空行
  const insertLineBelow = (): void => {
    const ta = textareaRef.current;
    if (!ta || !activeDoc) return;

    const start = ta.selectionStart;
    const content = ta.value;
    const lineEnd = content.indexOf('\n', start);

    const insertPosition = lineEnd === -1 ? content.length : lineEnd;
    const newContent = content.substring(0, insertPosition) + '\n' + content.substring(insertPosition);
    updateDocContent({ content: newContent });

    setCursorPosition(insertPosition + 1);
  };

  // 在上方插入空行
  const insertLineAbove = (): void => {
    const ta = textareaRef.current;
    if (!ta || !activeDoc) return;

    const start = ta.selectionStart;
    const content = ta.value;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;

    const newContent = content.substring(0, lineStart) + '\n' + content.substring(lineStart);
    updateDocContent({ content: newContent });

    setCursorPosition(lineStart);
  };

  return {
    duplicateLine,
    moveLine,
    deleteLine,
    indentLine,
    insertLineBelow,
    insertLineAbove,
  };
}

export default useEditorLineOps;