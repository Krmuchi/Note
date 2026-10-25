/**
 * 编辑器快捷键分发：先执行智能输入（useSmartInput），再按 keyboardSlice 注册表解析动作，
 * 未命中时回落到历史硬编码分支（见下方注释）。
 */

import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import type { NoteDoc } from '@/types';
import type { FormatType } from '@/hooks/useEditorFormatting';
import { useEditorLineOps } from '@/hooks/useEditorLineOps';
import { eventToKeys } from '@/utils/shortcuts';
import { FORMAT_ACTIONS } from '@/hooks/formatActions';

export { FORMAT_ACTIONS };

interface UseEditorKeysOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  activeDoc: NoteDoc | null;
  updateDocContent: (changes: Partial<NoteDoc>) => void;
  /** 智能输入处理器（见 useSmartInput）；返回 true 表示本次按键已被消费 */
  handleSmartInput: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** 编辑器内格式化快捷键回调（含标题、列表、引用、链接等块级格式） */
  onFormatShortcut?: (type: FormatType) => void;
  /** 把按键组合解析为 keyboardSlice 中的动作 id；返回 null 表示未命中 */
  resolveShortcut?: (combo: string[]) => string | null;
  /** Ctrl+Shift+V：下一次粘贴走纯文本（keydown 阶段置位，paste 阶段消费） */
  plainTextPasteRef: RefObject<boolean>;
  /** Ctrl+Alt+C：下一次复制写入 Markdown 源码 */
  copyAsMarkdownRef: RefObject<boolean>;
}

export function useEditorKeys({
  textareaRef,
  activeDoc,
  updateDocContent,
  handleSmartInput,
  onFormatShortcut,
  resolveShortcut,
  plainTextPasteRef,
  copyAsMarkdownRef,
}: UseEditorKeysOptions): { handleKeyDown: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void } {
  const { duplicateLine, moveLine, deleteLine, indentLine, insertLineBelow, insertLineAbove } =
    useEditorLineOps({ textareaRef, activeDoc, updateDocContent });

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    // 智能输入（块续写与缩进、行内标记补全）：优先于格式化快捷键处理
    if (handleSmartInput(e)) return;

    // 快捷键：优先由 keyboardSlice（单一数据源）解析，未命中再走历史硬编码兜底
    const combo = eventToKeys(e);
    const actionId = combo.length > 0 ? resolveShortcut?.(combo) ?? null : null;

    if (actionId) {
      if (FORMAT_ACTIONS.has(actionId)) {
        e.preventDefault();
        onFormatShortcut?.(actionId as FormatType);
        return;
      }
      switch (actionId) {
        case 'duplicateLine':
          e.preventDefault();
          duplicateLine();
          return;
        case 'moveLineUp':
          e.preventDefault();
          moveLine(-1);
          return;
        case 'moveLineDown':
          e.preventDefault();
          moveLine(1);
          return;
        case 'deleteLine':
          e.preventDefault();
          deleteLine();
          return;
        case 'indent':
          e.preventDefault();
          indentLine(true);
          return;
        case 'outdent':
          e.preventDefault();
          indentLine(false);
          return;
        case 'insertLineBelow':
          e.preventDefault();
          insertLineBelow();
          return;
        case 'insertLineAbove':
          e.preventDefault();
          insertLineAbove();
          return;
        case 'plainTextPaste':
          // 置位后交由 onPaste 消费（keydown 阶段拿不到剪贴板数据）
          plainTextPasteRef.current = true;
          return;
        case 'copyAsMarkdown':
          // 置位后交由 onCopy 消费
          copyAsMarkdownRef.current = true;
          return;
        default:
          // 命中全局动作（撤销/搜索/保存等）：不拦截，交给 window 监听器处理
          return;
      }
    }

    if (!onFormatShortcut) return;
    const meta = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    // 兜底：store 未覆盖时的历史硬编码（保留既有行为，避免自定义键位丢失后失效）。
    // 注意：本项目快捷键存在「keyboardSlice 注册表 + 硬编码兜底」双源，删除兜底需先补齐
    // 跨断言测试（验证注册表已覆盖全部动作），在补齐前必须原样保留。
    if (meta && key === 'b') {
      e.preventDefault();
      onFormatShortcut('bold');
      return;
    }
    if (meta && key === 'i') {
      e.preventDefault();
      onFormatShortcut('italic');
      return;
    }
    if (meta && key === 'u') {
      e.preventDefault();
      onFormatShortcut('underline');
      return;
    }
    if (meta && e.shiftKey && key === 'x') {
      e.preventDefault();
      onFormatShortcut('strike');
      return;
    }
    if (meta && key === 'e') {
      e.preventDefault();
      onFormatShortcut('code');
      return;
    }
    if (meta && key === 'd') {
      e.preventDefault();
      duplicateLine();
      return;
    }
    if (e.altKey && (key === 'arrowup' || key === 'arrowdown')) {
      e.preventDefault();
      moveLine(key === 'arrowup' ? -1 : 1);
      return;
    }
    if (meta && e.shiftKey && key === 'k') {
      e.preventDefault();
      deleteLine();
      return;
    }
    if (meta && key === ']') {
      e.preventDefault();
      indentLine(true);
      return;
    }
    if (meta && key === '[') {
      e.preventDefault();
      indentLine(false);
      return;
    }
    if (meta && key === 'enter') {
      e.preventDefault();
      if (e.shiftKey) {
        insertLineAbove();
      } else {
        insertLineBelow();
      }
    }
  };

  return { handleKeyDown };
}

export default useEditorKeys;