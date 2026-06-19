import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNotesStore } from '@/store';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { EditorHeader } from './EditorHeader';
import { EditorContent } from './EditorContent';
import { PresentationMode } from '@/components/presentation/PresentationMode';
import { DocumentOutline } from '@/components/outline/DocumentOutline';
import { CommentsPanel } from '@/components/comments/CommentsPanel';
import { compressImage } from '@/shared/utils';
import { copyToClipboard } from '@/utils/clipboard';
import type { NoteDoc } from '@/types';

export type FormatType =
  | 'bold' | 'italic' | 'strike' | 'underline' | 'code'
  | 'link' | 'image'
  | 'heading1' | 'heading2' | 'heading3' | 'paragraph'
  | 'ulist' | 'olist' | 'tasklist'
  | 'quote' | 'codeblock'
  | 'alignLeft' | 'alignCenter' | 'alignRight'
  | 'indent' | 'outdent'
  | 'textColor' | 'highlight'
  | 'table' | 'divider' | 'clearFormat'
  | 'formatPainter';

interface EditorProps {
  activeDoc: NoteDoc | null;
  activeNotebookId: string;
  activeDocId: string;
  fontSize: string;
  onFontSizeChange: (size: string) => void;
  onShowVersionHistory?: () => void;
  onShowSharePanel?: () => void;
  showOutlinePanel?: boolean;
  onToggleOutlinePanel?: () => void;
  showCommentsPanel?: boolean;
  onToggleCommentsPanel?: () => void;
}

/**
 * 在 textarea 中为选中文本添加包裹标记
 */
function wrapSelection(ta: HTMLTextAreaElement, prefix: string, suffix: string = prefix): string | null {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  const selected = text.substring(start, end);

  // 如果已包裹则取消包裹
  const wrappedStart = text.lastIndexOf(prefix, start);
  const wrappedEnd = text.indexOf(suffix, end);
  if (
    wrappedStart !== -1 && wrappedEnd !== -1 &&
    wrappedStart < start && wrappedEnd > end &&
    text.substring(wrappedStart, wrappedStart + prefix.length) === prefix &&
    text.substring(wrappedEnd, wrappedEnd + suffix.length) === suffix
  ) {
    const innerText = text.substring(wrappedStart + prefix.length, wrappedEnd);
    ta.value = text.substring(0, wrappedStart) + innerText + text.substring(wrappedEnd + suffix.length);
    ta.selectionStart = wrappedStart;
    ta.selectionEnd = wrappedStart + innerText.length;
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

/**
 * 在 textarea 中插入块级标记（如标题、列表）
 */
function insertBlockMark(ta: HTMLTextAreaElement, mark: string): string | null {
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

/**
 * 在光标所在行插入内容（如分割线、表格）
 */
function insertAtLine(ta: HTMLTextAreaElement, content: string, newLine: boolean = true): string | null {
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

/**
 * 增加/减少缩进
 */
function changeIndent(ta: HTMLTextAreaElement, increase: boolean): string | null {
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

/**
 * 清除选中文本或当前行的格式标记
 */
function clearFormatting(ta: HTMLTextAreaElement): string | null {
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

/**
 * 设置段落对齐方式
 */
function setAlignment(ta: HTMLTextAreaElement, align: 'left' | 'center' | 'right'): string | null {
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

export const Editor: React.FC<EditorProps> = ({
  activeDoc,
  activeNotebookId,
  activeDocId,
  fontSize,
  onFontSizeChange,
  onShowVersionHistory,
  onShowSharePanel,
  showOutlinePanel,
  onToggleOutlinePanel,
  showCommentsPanel,
  onToggleCommentsPanel,
}) => {
  const { updateDoc, toggleFavorite, saveStatus, addComment, deleteComment } = useNotesStore(useShallow((s) => ({
    updateDoc: s.updateDoc,
    toggleFavorite: s.toggleFavorite,
    saveStatus: s.saveStatus,
    addComment: s.addComment,
    deleteComment: s.deleteComment,
  })));
  const { undo, redo, canUndo, canRedo, recordSnapshot } = useUndoRedo();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorPanelRef = useRef<HTMLElement>(null);
  const [showPresentationMenu, setShowPresentationMenu] = React.useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    const el = editorPanelRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {
        el.classList.add('editor-fullscreen-fallback');
        setIsFullscreen(true);
      });
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {
        el.classList.remove('editor-fullscreen-fallback');
        setIsFullscreen(false);
      });
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
        editorPanelRef.current?.classList.remove('editor-fullscreen-fallback');
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const updateDocContent = useCallback(
    (changes: Partial<NoteDoc>) => {
      if (!activeDoc) return;

      if (changes.content || changes.title || changes.tags) {
        recordSnapshot({
          title: activeDoc.title,
          content: activeDoc.content,
          tags: activeDoc.tags,
        });
      }

      updateDoc(activeNotebookId, activeDocId, changes);
    },
    [activeDoc, activeNotebookId, activeDocId, updateDoc, recordSnapshot]
  );

  const handlePaste = (ev: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = ev.clipboardData && ev.clipboardData.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type && item.type.indexOf('image') === 0) {
        const file = item.getAsFile();
        if (file) {
          ev.preventDefault();
          handleInsertImage(file);
          return;
        }
      }
    }
  };

  const insertImage = (ta: HTMLTextAreaElement | null, src: string) => {
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selectedText = ta.value.substring(start, end);
    const imageMarkdown = `![${selectedText || 'image'}](${src})`;
    ta.value = ta.value.substring(0, start) + imageMarkdown + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + imageMarkdown.length;
  };

  const handleInsertImage = useCallback(async (file: File) => {
    if (!file || !activeDoc) return;

    try {
      const compressedBlob = await compressImage(file, 1200);
      const compressedFile = new File([compressedBlob], file.name, { type: 'image/jpeg' });

      const reader = new FileReader();
      reader.onload = async () => {
        const data = (reader.result as string) || '';
        try {
          const saved = await window.notesApi.saveImage({ name: compressedFile.name, data });
          const src = saved || data;
          insertImage(textareaRef.current, src);
          updateDocContent({ content: textareaRef.current?.value || '' });
        } catch {
          insertImage(textareaRef.current, data);
          updateDocContent({ content: textareaRef.current?.value || '' });
        }
      };
      reader.readAsDataURL(compressedFile);
    } catch {
      const reader = new FileReader();
      reader.onload = async () => {
        const data = (reader.result as string) || '';
        try {
          const saved = await window.notesApi.saveImage({ name: file.name, data });
          const src = saved || data;
          insertImage(textareaRef.current, src);
          updateDocContent({ content: textareaRef.current?.value || '' });
        } catch {
          insertImage(textareaRef.current, data);
          updateDocContent({ content: textareaRef.current?.value || '' });
        }
      };
      reader.readAsDataURL(file);
    }
  }, [activeDoc, updateDocContent]);

  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());

  const detectFormats = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const formats = new Set<string>();

    if (start !== end) {
      const selected = text.substring(start, end);

      if (selected.startsWith('**') && selected.endsWith('**')) formats.add('bold');
      else if (text.substring(Math.max(0, start - 2), start) === '**' && text.substring(end, end + 2) === '**') formats.add('bold');

      if (selected.startsWith('*') && selected.endsWith('*') && !selected.startsWith('**')) formats.add('italic');

      if (selected.startsWith('~~') && selected.endsWith('~~')) formats.add('strike');
      if (selected.startsWith('`') && selected.endsWith('`') && !selected.startsWith('``')) formats.add('code');
    }

    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineText = text.substring(lineStart, text.indexOf('\n', start));

    if (lineText.startsWith('# ')) formats.add('heading1');
    else if (lineText.startsWith('## ')) formats.add('heading2');
    else if (lineText.startsWith('### ')) formats.add('heading3');
    if (lineText.startsWith('- ')) formats.add('ulist');
    if (lineText.match(/^1\.\s/)) formats.add('olist');
    if (lineText.startsWith('> ')) formats.add('quote');
    if (lineText.startsWith('```')) formats.add('codeblock');

    setActiveFormats(formats);
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const handlers = () => { setTimeout(detectFormats, 0); };
    ta.addEventListener('keyup', handlers);
    ta.addEventListener('mouseup', handlers);
    ta.addEventListener('click', handlers);

    return () => {
      ta.removeEventListener('keyup', handlers);
      ta.removeEventListener('mouseup', handlers);
      ta.removeEventListener('click', handlers);
    };
  }, [detectFormats]);

  /** 对 textarea 选中文本应用格式化 */
  const applyFormat = useCallback(
    (type: FormatType, options?: { color?: string }) => {
      const ta = textareaRef.current;
      if (!ta || !activeDoc) return;

      let newContent: string | null = null;

      switch (type) {
        case 'bold':
          newContent = wrapSelection(ta, '**', '**');
          break;
        case 'italic':
          newContent = wrapSelection(ta, '*', '*');
          break;
        case 'strike':
          newContent = wrapSelection(ta, '~~', '~~');
          break;
        case 'underline':
          newContent = wrapSelection(ta, '<u>', '</u>');
          break;
        case 'code':
          newContent = wrapSelection(ta, '`', '`');
          break;
        case 'link':
          newContent = wrapSelection(ta, '[', '](url)');
          break;
        case 'textColor':
          newContent = wrapSelection(ta, `<span style="color:${options?.color || '#1677ff'}">`, '</span>');
          break;
        case 'highlight':
          newContent = wrapSelection(ta, `<mark style="background-color:${options?.color || '#fff3a0'}">`, '</mark>');
          break;
        case 'heading1':
          newContent = insertBlockMark(ta, '# ');
          break;
        case 'heading2':
          newContent = insertBlockMark(ta, '## ');
          break;
        case 'heading3':
          newContent = insertBlockMark(ta, '### ');
          break;
        case 'paragraph':
          newContent = insertBlockMark(ta, '');
          break;
        case 'ulist':
          newContent = insertBlockMark(ta, '- ');
          break;
        case 'olist':
          newContent = insertBlockMark(ta, '1. ');
          break;
        case 'tasklist':
          newContent = insertBlockMark(ta, '- [ ] ');
          break;
        case 'quote':
          newContent = insertBlockMark(ta, '> ');
          break;
        case 'alignLeft':
          newContent = setAlignment(ta, 'left');
          break;
        case 'alignCenter':
          newContent = setAlignment(ta, 'center');
          break;
        case 'alignRight':
          newContent = setAlignment(ta, 'right');
          break;
        case 'indent':
          newContent = changeIndent(ta, true);
          break;
        case 'outdent':
          newContent = changeIndent(ta, false);
          break;
        case 'divider':
          newContent = insertAtLine(ta, '---');
          break;
        case 'table':
          newContent = insertAtLine(ta, '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |');
          break;
        case 'clearFormat':
          newContent = clearFormatting(ta);
          break;
        case 'codeblock':
          {
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const selected = ta.value.substring(start, end);
            ta.value = ta.value.substring(0, start) + '```\n' + selected + '\n```' + ta.value.substring(end);
            ta.selectionStart = start + 4;
            ta.selectionEnd = start + 4 + selected.length;
            ta.focus();
            newContent = ta.value;
          }
          break;
        case 'image':
          {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleInsertImage(file);
            };
            fileInput.click();
          }
          return;
        case 'formatPainter':
          return;
      }

      if (newContent !== null) {
        updateDocContent({ content: newContent });
      }
    },
    [activeDoc, updateDocContent, handleInsertImage]
  );

  useEffect(() => {
    if (activeDoc) {
      recordSnapshot({
        title: activeDoc.title,
        content: activeDoc.content,
        tags: activeDoc.tags,
      });
    }
  }, [activeDocId, activeDoc, recordSnapshot]);

  if (!activeDoc) {
    return (
      <main className="editor-panel">
        <div className="empty-editor">
          <div className="empty-icon">📄</div>
          <div className="empty-text">选择一个文档开始编辑</div>
          <div className="empty-hint" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-placeholder)' }}>从左侧选择或新建一个文档</div>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="editor-panel" ref={editorPanelRef}>
        <EditorHeader
          activeDoc={activeDoc}
          activeNotebookId={activeNotebookId}
          activeDocId={activeDocId}
          saveStatus={saveStatus}
          fontSize={fontSize}
          showPresentationMenu={showPresentationMenu}
          updateDocContent={updateDocContent}
          toggleFavorite={toggleFavorite}
          handleCopyLink={async () => {
            await copyToClipboard(`${window.location.origin}/doc/${activeDocId}`);
          }}
          handleOpenInNewWindow={() => window.open(`/doc/${activeDocId}`, '_blank')}
          setShowSharePanel={() => onShowSharePanel?.()}
          setShowPresentationMenu={setShowPresentationMenu}
          setFontSize={onFontSizeChange}
          undo={undo}
          redo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onStartPresentation={() => {
            setShowPresentationMenu(false);
            setShowPresentation(true);
          }}
          onShowVersionHistory={onShowVersionHistory}
          applyFormat={applyFormat}
          activeFormats={activeFormats}
          showOutlinePanel={showOutlinePanel}
          onToggleOutlinePanel={onToggleOutlinePanel}
          showCommentsPanel={showCommentsPanel}
          onToggleCommentsPanel={onToggleCommentsPanel}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
        <div className="editor-body-wrapper">
          <EditorContent
            activeDoc={activeDoc}
            fontSize={fontSize}
            updateDocContent={updateDocContent}
            handlePaste={handlePaste}
            textareaRef={textareaRef}
          />
          <DocumentOutline
            content={activeDoc.content || ''}
            onHeadingClick={(position) => {
              const ta = textareaRef.current;
              if (ta) {
                ta.focus();
                ta.setSelectionRange(position, position);
                ta.scrollTop = position;
              }
            }}
            isOpen={!!showOutlinePanel}
            onClose={() => onToggleOutlinePanel?.()}
          />
          <CommentsPanel
            comments={activeDoc.comments || []}
            docId={activeDocId}
            onAddComment={(docId, content) => addComment(activeNotebookId, docId, content)}
            onDeleteComment={(docId, commentId) => deleteComment(activeNotebookId, docId, commentId)}
            isOpen={!!showCommentsPanel}
            onClose={() => onToggleCommentsPanel?.()}
          />
        </div>
      </main>
      {showPresentation && activeDoc && (
        <PresentationMode doc={activeDoc} onClose={() => setShowPresentation(false)} />
      )}
    </>
  );
};