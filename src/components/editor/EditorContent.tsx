/**
 * 编辑器正文（textarea）：输入回写、斜杠命令触发检测、智能输入与快捷键分发、粘贴 / 拖放。
 * 具体逻辑分别内聚在 useSmartInput / useEditorKeys / useEditorPasteDrop。
 */

import React, { useEffect, useRef, useCallback } from 'react';
import type { NoteDoc } from '@/types';
import type { FormatType } from '@/hooks/useEditorFormatting';
import { detectSlashToken, getCaretPixelPosition } from '@/utils/editorTextOps';
import { useSmartInput } from '@/hooks/useSmartInput';
import { useEditorKeys } from '@/hooks/useEditorKeys';
import { useEditorPasteDrop } from '@/hooks/useEditorPasteDrop';
import { markPerf } from '@/utils/perfMarks';

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
  onTextareaMount,
  onScroll,
  onInsertImage,
  onInsertFile,
  onSlashChange,
}) => {
  // 启动度量（F1）：正文首次挂载即"用户能看到并开始写"的时刻
  useEffect(() => {
    markPerf('firstDocRendered');
  }, []);

  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = internalRef;
  /** Ctrl+Shift+V：下一次粘贴走纯文本（keydown 阶段置位，paste 阶段消费） */
  const plainTextPasteRef = useRef(false);
  /** Ctrl+Alt+C：下一次复制写入 Markdown 源码 */
  const copyAsMarkdownRef = useRef(false);

  /*
   * 按文档记住滚动位置。
   * textarea 是受控组件，切换文档时内容被整体替换，scrollTop 会被浏览器归零 ——
   * 长文档每次切回来都从顶部开始，用户得重新翻到刚才的位置。
   * 用模块级 Map 保存（不随组件卸载丢失），切换文档时恢复。
   */
  const scrollByDocRef = useRef<Record<string, number>>({});
  const restoredDocIdRef = useRef<string | null>(null);

  const handleScrollInternal = useCallback((): void => {
    const ta = internalRef.current;
    if (!ta) return;
    const docId = activeDoc?.id;
    if (docId) scrollByDocRef.current[docId] = ta.scrollTop;
    onScroll?.();
  }, [activeDoc?.id, onScroll]);

  // 文档切换后恢复该文档上次的滚动位置（内容渲染完成后再设置，否则会被布局重排覆盖）
  useEffect(() => {
    const ta = internalRef.current;
    const docId = activeDoc?.id;
    if (!ta || !docId) return;
    if (restoredDocIdRef.current === docId) return;
    restoredDocIdRef.current = docId;

    const saved = scrollByDocRef.current[docId] ?? 0;
    // 先归零再恢复：同一节点上切换文档时，浏览器可能沿用旧 scrollTop
    ta.scrollTop = 0;
    if (saved > 0) {
      const id = requestAnimationFrame(() => {
        if (internalRef.current) internalRef.current.scrollTop = saved;
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [activeDoc?.id]);

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

  const { handleSmartInput } = useSmartInput({ textareaRef, activeDoc, updateDocContent });

  const { handleKeyDown } = useEditorKeys({
    textareaRef,
    activeDoc,
    updateDocContent,
    handleSmartInput,
    onFormatShortcut,
    resolveShortcut,
    plainTextPasteRef,
    copyAsMarkdownRef,
  });

  const {
    isDragging,
    handlePasteLocal,
    handleCopy,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useEditorPasteDrop({
    textareaRef,
    activeDoc,
    updateDocContent,
    handlePaste,
    onInsertImage,
    onInsertFile,
    plainTextPasteRef,
    copyAsMarkdownRef,
  });

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
          <textarea
            ref={setExternalTextareaRef}
            className="editor-textarea"
            value={activeDoc?.content || ''}
            onScroll={handleScrollInternal}
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