import React, { useRef, useState, useCallback } from 'react';
import type { NoteDoc } from '@/types';
import type { FormatType } from '@/hooks/useEditorFormatting';
import { autoPairMarker, changeIndent, continueBlockOnEnter, detectSlashToken, getCaretPixelPosition } from '@/utils/editorTextOps';
import { eventToKeys } from '@/utils/shortcuts';

/** 可由快捷键直接触发的格式化动作（id 与 FormatType / keyboardSlice 对齐） */
const FORMAT_ACTIONS = new Set<string>([
  'bold', 'italic', 'underline', 'strike', 'code',
  'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
  'ulist', 'olist', 'tasklist', 'quote', 'link',
]);

/** 斜杠命令触发状态（由编辑区检测后上抛给 Editor 统一持有） */
export interface SlashTriggerState {
  start: number;
  end: number;
  query: string;
  caret: { top: number; left: number };
}

interface EditorContentProps {
  activeDoc: NoteDoc | null;
  fontSize: string;
  updateDocContent: (updates: Partial<NoteDoc>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  /** 编辑器内格式化快捷键回调（含标题、列表、引用、链接等块级格式） */
  onFormatShortcut?: (type: FormatType) => void;
  /**
   * 把按键组合解析为 keyboardSlice 中的动作 id；返回 null 表示未命中。
   * 由 Editor 注入（从 store 读取，含用户自定义键位），保证键位只有一份定义
   */
  resolveShortcut?: (combo: string[]) => string | null;
  activeView?: string;
  /** 仅内部使用：内部 ref 供文本操作读取 */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** textarea 挂载/卸载回调（用于跟踪当前 DOM 节点，监听器随之重绑） */
  onTextareaMount?: (node: HTMLTextAreaElement | null) => void;
  /** 滚动事件回调（用于同步预览） */
  onScroll?: () => void;
  /** 图片插入回调 */
  onInsertImage?: (file: File) => void;
  /** 非图片附件插入回调（落盘后插入链接语法） */
  onInsertFile?: (file: File) => void;
  /**
   * 斜杠命令触发状态变化。
   * source='input' 表示由输入触发（可唤出面板）；'cursor' 表示仅光标移动（只用于关闭/同步）
   */
  onSlashChange?: (state: SlashTriggerState | null, source: 'input' | 'cursor') => void;
}

export const EditorContent: React.FC<EditorContentProps> = ({
  activeDoc,
  fontSize,
  updateDocContent,
  handlePaste,
  onFormatShortcut,
  resolveShortcut,
  activeView = 'notebooks',
  onTextareaMount,
  onScroll,
  onInsertImage,
  onInsertFile,
  onSlashChange,
}) => {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = internalRef;
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  /** Ctrl+Shift+V：下一次粘贴走纯文本（keydown 阶段置位，paste 阶段消费） */
  const plainTextPasteRef = useRef(false);
  /** Ctrl+Alt+C：下一次复制写入 Markdown 源码 */
  const copyAsMarkdownRef = useRef(false);

  // useCallback 稳定引用：普通函数每次渲染都是新引用，React 会先 detach(null) 再 attach(node)，
  // 造成 onTextareaMount(null→node) 抖动与监听器反复重绑
  const setExternalTextareaRef = useCallback((node: HTMLTextAreaElement | null) => {
    internalRef.current = node;
    onTextareaMount?.(node);
  }, [onTextareaMount]);

  /** 同步斜杠命令触发状态（仅 O(当前行) 计算） */
  const syncSlash = useCallback((el: HTMLTextAreaElement, source: 'input' | 'cursor') => {
    if (!onSlashChange) return;
    const token = detectSlashToken(el);
    onSlashChange(
      token ? { ...token, caret: getCaretPixelPosition(el, token.start) } : null,
      source,
    );
  }, [onSlashChange]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    if (activeDoc) {
      updateDocContent({ content: e.target.value });
    }
    syncSlash(e.target, 'input');
  };

  /** 光标移动/点击时仅同步关闭，避免把光标落在已有 "/xxx" 文本上也唤出面板 */
  const handleCursorMove = (e: React.SyntheticEvent<HTMLTextAreaElement>): void => {
    syncSlash(e.currentTarget, 'cursor');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // 块续写与缩进：不依赖 onFormatShortcut，优先于格式化快捷键处理
    const ta = textareaRef.current;
    if (ta && activeDoc && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // 行内标记自动补全：` ` ` * ~
      if (e.key === '`' || e.key === '*' || e.key === '~') {
        if (autoPairMarker(ta, e.key)) {
          e.preventDefault();
          updateDocContent({ content: ta.value });
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        const next = continueBlockOnEnter(ta);
        if (next !== null) {
          e.preventDefault();
          updateDocContent({ content: next });
          return;
        }
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const next = changeIndent(ta, !e.shiftKey);
        if (next !== null) updateDocContent({ content: next });
        return;
      }
    }

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

    // 兜底：store 未覆盖时的历史硬编码（保留既有行为，避免自定义键位丢失后失效）
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

  /** 纯文本粘贴：丢弃 HTML 富文本，仅插入 text/plain */
  const handlePasteLocal = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
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
  const handleCopy = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
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

  // 拖拽事件处理
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
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

  return (
    <div
      className={`editor-content ${isDragging ? 'editor-content-dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {activeDoc ? (
        <div className="editor-body">
          {activeView === 'trash' ? (
            <div className="trash-document-view">
              <div className="trash-doc-title">{activeDoc.title}</div>
              <div className="trash-doc-content">{activeDoc.content || '该文档没有内容'}</div>
            </div>
          ) : (
            <>
              <textarea
                ref={setExternalTextareaRef}
                className="editor-textarea"
                value={activeDoc?.content || ''}
                onScroll={onScroll}
                onChange={handleChange}
                onKeyUp={handleCursorMove}
                onClick={handleCursorMove}
                onPaste={handlePasteLocal}
                onCopy={handleCopy}
                onKeyDown={handleKeyDown}
                placeholder="开始编写你的文章..."
                aria-label="文档内容编辑器"
                spellCheck={false}
                style={{ fontSize: fontSize }}
              />
              {isDragging && (
                <div className="editor-drop-overlay">
                  <div className="drop-overlay-content">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <p>拖拽图片到此处插入</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="empty-editor">
          <div className="empty-icon">📄</div>
          <div className="empty-text">选择文档开始编辑</div>
          <div className="empty-hint" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-placeholder)' }}>从左侧选择或新建一个文档</div>
        </div>
      )}
    </div>
  );
};
