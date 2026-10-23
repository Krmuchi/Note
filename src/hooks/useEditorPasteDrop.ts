/**
 * 编辑器粘贴 / 拖放处理：Ctrl+Shift+V 纯文本粘贴、Ctrl+Alt+C 复制为 Markdown，
 * 以及文件拖入的 dragCounterRef 计数防抖（enter/leave 配对，归零才收起拖拽遮罩）。
 */

import { useCallback, useRef, useState } from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  RefObject,
} from 'react';
import type { NoteDoc } from '@/types';

interface UseEditorPasteDropOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  activeDoc: NoteDoc | null;
  updateDocContent: (changes: Partial<NoteDoc>) => void;
  /** 默认粘贴处理（富文本 / 图片转换），由 Editor 注入 */
  handlePaste: (e: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  /** 图片插入回调 */
  onInsertImage?: (file: File) => void;
  /** 非图片附件插入回调（落盘后插入链接语法） */
  onInsertFile?: (file: File) => void;
  /** Ctrl+Shift+V：下一次粘贴走纯文本（keydown 阶段置位，paste 阶段消费） */
  plainTextPasteRef: RefObject<boolean>;
  /** Ctrl+Alt+C：下一次复制写入 Markdown 源码 */
  copyAsMarkdownRef: RefObject<boolean>;
}

export function useEditorPasteDrop({
  textareaRef,
  activeDoc,
  updateDocContent,
  handlePaste,
  onInsertImage,
  onInsertFile,
  plainTextPasteRef,
  copyAsMarkdownRef,
}: UseEditorPasteDropOptions): {
  isDragging: boolean;
  handlePasteLocal: (e: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  handleCopy: (e: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  handleDragEnter: (e: ReactDragEvent) => void;
  handleDragLeave: (e: ReactDragEvent) => void;
  handleDragOver: (e: ReactDragEvent) => void;
  handleDrop: (e: ReactDragEvent) => void;
} {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  /** 纯文本粘贴：丢弃 HTML 富文本，仅插入 text/plain */
  const handlePasteLocal = (e: ReactClipboardEvent<HTMLTextAreaElement>): void => {
    if (!plainTextPasteRef.current) {
      handlePaste(e);
      return;
    }
    plainTextPasteRef.current = false;
    const plain = e.clipboardData?.getData('text/plain') ?? '';
    if (!plain) return;
    e.preventDefault();
    const ta = textareaRef.current;
    if (!ta || !activeDoc) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;
    const next = value.substring(0, start) + plain + value.substring(end);
    ta.value = next;
    ta.selectionStart = ta.selectionEnd = start + plain.length;
    updateDocContent({ content: next });
  };

  /** 复制为 Markdown：把选区（无选区时为整行）的源码原样写入剪贴板 */
  const handleCopy = (e: ReactClipboardEvent<HTMLTextAreaElement>): void => {
    if (!copyAsMarkdownRef.current) return;
    copyAsMarkdownRef.current = false;
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;
    let text = value.substring(start, end);
    if (start === end) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const nextBreak = value.indexOf('\n', start);
      text = value.substring(lineStart, nextBreak === -1 ? value.length : nextBreak);
    }
    if (!text) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
  };

  // 拖拽事件处理
  const handleDragEnter = useCallback((e: ReactDragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: ReactDragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: ReactDragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback((e: ReactDragEvent) => {
    const files = Array.from(e.dataTransfer.files);
    // 拖拽选中文本（无文件）时保留 textarea 原生移动语义
    if (files.length === 0) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    // 图片走图片流程，其余文件走附件流程
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        onInsertImage?.(file);
      } else {
        onInsertFile?.(file);
      }
    });
  }, [onInsertImage, onInsertFile]);

  return {
    isDragging,
    handlePasteLocal,
    handleCopy,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  };
}

export default useEditorPasteDrop;