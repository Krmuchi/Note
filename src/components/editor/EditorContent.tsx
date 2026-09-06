import React, { useRef, useState, useCallback } from 'react';
import type { NoteDoc } from '@/types';

interface EditorContentProps {
  activeDoc: NoteDoc | null;
  fontSize: string;
  updateDocContent: (updates: Partial<NoteDoc>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  /** 编辑器内 Ctrl/Cmd+B、Ctrl/Cmd+I、Ctrl/Cmd+U、Ctrl/Cmd+Shift+X、Ctrl/Cmd+E 快捷键回调 */
  onFormatShortcut?: (type: 'bold' | 'italic' | 'underline' | 'strike' | 'code') => void;
  activeView?: string;
  /** 仅内部使用：内部 ref 供文本操作读取 */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** textarea 挂载/卸载回调（用于跟踪当前 DOM 节点，监听器随之重绑） */
  onTextareaMount?: (node: HTMLTextAreaElement | null) => void;
  /** 滚动事件回调（用于同步预览） */
  onScroll?: () => void;
  /** 图片插入回调 */
  onInsertImage?: (file: File) => void;
}

export const EditorContent: React.FC<EditorContentProps> = ({
  activeDoc,
  fontSize,
  updateDocContent,
  handlePaste,
  onFormatShortcut,
  activeView = 'notebooks',
  onTextareaMount,
  onScroll,
  onInsertImage,
}) => {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = internalRef;
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // useCallback 稳定引用：普通函数每次渲染都是新引用，React 会先 detach(null) 再 attach(node)，
  // 造成 onTextareaMount(null→node) 抖动与监听器反复重绑
  const setExternalTextareaRef = useCallback((node: HTMLTextAreaElement | null) => {
    internalRef.current = node;
    onTextareaMount?.(node);
  }, [onTextareaMount]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (activeDoc) {
      updateDocContent({ content: e.target.value });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!onFormatShortcut) return;
    const meta = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    
    // 基本格式化快捷键
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

    // 文本编辑快捷键
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
      return;
    }
  };

  // 设置光标位置（使用 requestAnimationFrame 确保在 React 重渲染后执行）
  const setCursorPosition = (position: number) => {
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.selectionStart = ta.selectionEnd = position;
      }
    });
  };

  // 获取当前行索引和行首字符偏移量
  const getCurrentLineInfo = (content: string, cursorPos: number) => {
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
  const duplicateLine = () => {
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
  const moveLine = (direction: -1 | 1) => {
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
  const deleteLine = () => {
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
  const indentLine = (increase: boolean) => {
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
  const insertLineBelow = () => {
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
  const insertLineAbove = () => {
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
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    // 仅在拖入图片时接管默认行为；拖拽选中文本（无文件）时保留 textarea 原生移动语义
    if (imageFiles.length === 0 || !onInsertImage) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    // 插入所有图片
    imageFiles.forEach(file => {
      onInsertImage(file);
    });
  }, [onInsertImage]);

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
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                placeholder="开始编写你的文章..."
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
