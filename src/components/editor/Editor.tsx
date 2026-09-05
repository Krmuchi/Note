import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNotesStore } from '@/store';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useEditorFormatting } from '@/hooks/useEditorFormatting';
import { EditorHeader } from './EditorHeader';
import { EditorContent } from './EditorContent';
import { MarkdownPreview } from './MarkdownPreview';
import { EditorStatusBar } from './EditorStatusBar';
import { PresentationMode } from '@/components/presentation/PresentationMode';
import { DocumentOutline } from '@/components/outline/DocumentOutline';
import { CommentsPanel } from '@/components/comments/CommentsPanel';
import { EmptyState } from '@/components/common/EmptyState';
import { copyToClipboard } from '@/utils/clipboard';
import type { NoteDoc } from '@/types';

export type PreviewMode = 'edit' | 'preview' | 'split';

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
  const { updateDoc, toggleFavorite, saveStatus, addComment, deleteComment, addReply } = useNotesStore(useShallow((s) => ({
    updateDoc: s.updateDoc,
    toggleFavorite: s.toggleFavorite,
    saveStatus: s.saveStatus,
    addComment: s.addComment,
    deleteComment: s.deleteComment,
    addReply: s.addReply,
  })));
  const { undo, redo, canUndo, canRedo, recordSnapshot, clearHistory } = useUndoRedo();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 跟踪当前挂载的 textarea DOM 节点：预览/空态切换会卸载并重建节点，
  // 依赖此 state 可让格式检测、状态栏等监听器在节点重建后重新绑定
  const [textareaNode, setTextareaNode] = useState<HTMLTextAreaElement | null>(null);
  const handleTextareaMount = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    setTextareaNode(node);
  }, []);
  const editorPanelRef = useRef<HTMLElement>(null);
  const [showPresentationMenu, setShowPresentationMenu] = React.useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('edit');

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

  const toggleFocusMode = useCallback(() => {
    setIsFocusMode(prev => !prev);
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

  // 持有最新 activeDoc 引用，使 updateDocContent 保持稳定引用：
  // 否则每次击键都会重建该回调，导致下游 memo 组件（EditorHeader 等）失效
  const activeDocRef = useRef<NoteDoc | null>(activeDoc);
  // 在提交后同步引用，避免渲染期写 ref
  useEffect(() => {
    activeDocRef.current = activeDoc;
  }, [activeDoc]);

  const updateDocContent = useCallback(
    (changes: Partial<NoteDoc>) => {
      const current = activeDocRef.current;
      if (!current) return;

      if (changes.content || changes.title || changes.tags) {
        recordSnapshot({
          title: current.title,
          content: current.content,
          tags: current.tags,
        });
      }

      updateDoc(activeNotebookId, activeDocId, changes);
    },
    [activeNotebookId, activeDocId, updateDoc, recordSnapshot]
  );

  // 使用格式化 hook
  const {
    activeFormats,
    applyFormat,
    handlePaste,
    handleInsertImage,
  } = useEditorFormatting({
    textareaRef,
    textareaNode,
    activeDoc,
    updateDocContent,
  });

  // 仅在切换文档时记录一次初始快照，并清理上一个文档的撤销历史，
  // 避免历史无限增长（每文档最多 200 份全量快照常驻内存）。
  // 注意：不能依赖 activeDoc（内容每次击键都变），否则会把"变更后"的内容
  // 持续压入撤销栈，导致停顿后第一次撤销回到当前内容、看起来没有反应。
  const prevDocIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeDoc && prevDocIdRef.current !== activeDocId) {
      if (prevDocIdRef.current) {
        clearHistory(prevDocIdRef.current);
      }
      prevDocIdRef.current = activeDocId;
      recordSnapshot({
        title: activeDoc.title,
        content: activeDoc.content,
        tags: activeDoc.tags,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocId]);

  // 切换预览模式
  const togglePreviewMode = useCallback(() => {
    setPreviewMode(prev => {
      if (prev === 'edit') return 'split';
      if (prev === 'split') return 'preview';
      return 'edit';
    });
  }, []);

  // 传给 EditorHeader 的回调保持稳定引用，配合其 React.memo 避免击键链路全量重渲染
  const handleCopyLink = useCallback(async () => {
    await copyToClipboard(`${window.location.origin}/doc/${activeDocId}`);
  }, [activeDocId]);

  const handleOpenSharePanel = useCallback(() => {
    onShowSharePanel?.();
  }, [onShowSharePanel]);

  const handleStartPresentation = useCallback(() => {
    setShowPresentationMenu(false);
    setShowPresentation(true);
  }, []);

  // 编辑器滚动同步：滚动百分比经 ref 直通预览组件，不再走 setState。
  // 旧实现把 scrollPercentage 放在组件树顶端，每次滚动帧都重渲染整个编辑面板
  // （含 ReactMarkdown 全树协调），split 模式大文档明显掉帧
  const previewSyncRef = useRef<((pct: number) => void) | null>(null);

  // 编辑器滚动：计算百分比后直接调用预览侧注册的同步函数（ref 直通，零重渲染）
  const handleEditorScroll = useCallback(() => {
    if (!textareaRef.current || previewMode !== 'split') return;
    const ta = textareaRef.current;
    const maxScroll = ta.scrollHeight - ta.clientHeight;
    const percentage = maxScroll > 0 ? ta.scrollTop / maxScroll : 0;
    previewSyncRef.current?.(percentage);
  }, [previewMode]);

  // 预览滚动：按百分比同步编辑区（直接写 DOM，不触发 React 渲染）
  const handlePreviewScroll = useCallback((percentage: number) => {
    if (!textareaRef.current || previewMode !== 'split') return;
    const ta = textareaRef.current;
    const maxScroll = ta.scrollHeight - ta.clientHeight;
    ta.scrollTop = percentage * maxScroll;
  }, [previewMode]);

  // 预览侧挂载/卸载时注册/注销编辑器→预览的同步函数
  const handleRegisterPreviewSync = useCallback((fn: ((pct: number) => void) | null) => {
    previewSyncRef.current = fn;
  }, []);

  // 快捷键处理。
  // 注意 e.key 在 Shift 按下时为大写（如 'P'），必须 toLowerCase 比较；
  // 专注模式改绑 Ctrl+Shift+E：Ctrl+Shift+F 已被全局"收藏/取消收藏"占用，双绑定会互相误触
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'p') {
        e.preventDefault();
        togglePreviewMode();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'e') {
        e.preventDefault();
        toggleFocusMode();
      }
      if (e.key === 'Escape' && isFocusMode) {
        e.preventDefault();
        toggleFocusMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePreviewMode, toggleFocusMode, isFocusMode]);

  // 大纲点击跳转：position 是字符偏移，scrollTop 是像素，必须按行号换算，
  // 否则长文档会跳到完全错误的位置
  const handleOutlineClick = useCallback((position: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const line = ta.value.slice(0, position).split('\n').length - 1;
    const style = getComputedStyle(ta);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6 || 24;
    ta.focus();
    ta.setSelectionRange(position, position);
    ta.scrollTop = Math.max(0, line * lineHeight - 12);
  }, []);

  if (!activeDoc) {
    return (
      <main className="editor-panel">
        <EmptyState
          icon="📄"
          title="选择一个文档开始编辑"
          description="从左侧选择一个文档，或创建一个新文档开始记录"
          actions={[
            {
              label: '新建文档',
              icon: '➕',
              onClick: () => {
                // 触发新建文档
                const store = useNotesStore.getState();
                if (store.activeNotebookId) {
                  store.createDoc(store.activeNotebookId, null);
                }
              },
              variant: 'primary',
            },
          ]}
        />
      </main>
    );
  }

  const showEditor = previewMode === 'edit' || previewMode === 'split';
  const showPreview = previewMode === 'preview' || previewMode === 'split';

  return (
    <>
      <main className={`editor-panel ${previewMode === 'split' ? 'editor-split-mode' : ''} ${isFocusMode ? 'editor-focus-mode' : ''}`} ref={editorPanelRef}>
        <EditorHeader
          docTitle={activeDoc.title}
          isFavorite={activeDoc.favorite}
          activeNotebookId={activeNotebookId}
          activeDocId={activeDocId}
          saveStatus={saveStatus}
          fontSize={fontSize}
          showPresentationMenu={showPresentationMenu}
          updateDocContent={updateDocContent}
          toggleFavorite={toggleFavorite}
          handleCopyLink={handleCopyLink}
          setShowSharePanel={handleOpenSharePanel}
          setShowPresentationMenu={setShowPresentationMenu}
          setFontSize={onFontSizeChange}
          undo={undo}
          redo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onStartPresentation={handleStartPresentation}
          onShowVersionHistory={onShowVersionHistory}
          applyFormat={applyFormat}
          activeFormats={activeFormats}
          showOutlinePanel={showOutlinePanel}
          onToggleOutlinePanel={onToggleOutlinePanel}
          showCommentsPanel={showCommentsPanel}
          onToggleCommentsPanel={onToggleCommentsPanel}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isFocusMode={isFocusMode}
          onToggleFocusMode={toggleFocusMode}
          previewMode={previewMode}
          onTogglePreviewMode={togglePreviewMode}
        />
        <div className={`editor-body-wrapper ${previewMode === 'split' ? 'editor-body-wrapper-split' : ''}`}>
          {showEditor && (
            <div className={`editor-content-wrapper ${previewMode === 'split' ? 'editor-content-split' : ''}`}>
              <EditorContent
                activeDoc={activeDoc}
                fontSize={fontSize}
                updateDocContent={updateDocContent}
                handlePaste={handlePaste}
                onFormatShortcut={(type) => applyFormat(type)}
                onTextareaMount={handleTextareaMount}
                onScroll={handleEditorScroll}
                onInsertImage={handleInsertImage}
              />
            </div>
          )}
          {showPreview && (
            <div className={`preview-content-wrapper ${previewMode === 'split' ? 'preview-content-split' : ''}`}>
              <MarkdownPreview
                content={activeDoc.content || ''}
                syncScroll={previewMode === 'split'}
                onScrollChange={handlePreviewScroll}
                onRegisterEditorScrollSync={handleRegisterPreviewSync}
              />
            </div>
          )}
          <DocumentOutline
            content={activeDoc.content || ''}
            onHeadingClick={handleOutlineClick}
            isOpen={!!showOutlinePanel}
            onClose={() => onToggleOutlinePanel?.()}
          />
          <CommentsPanel
            comments={activeDoc.comments || []}
            docId={activeDocId}
            onAddComment={(docId, content) => addComment(activeNotebookId, docId, content)}
            onDeleteComment={(docId, commentId) => deleteComment(activeNotebookId, docId, commentId)}
            onAddReply={(docId, commentId, content) => addReply(activeNotebookId, docId, commentId, content)}
            isOpen={!!showCommentsPanel}
            onClose={() => onToggleCommentsPanel?.()}
          />
        </div>
        <EditorStatusBar content={activeDoc.content || ''} textareaRef={textareaRef} textareaNode={textareaNode} />
      </main>
      {showPresentation && activeDoc && (
        <PresentationMode doc={activeDoc} onClose={() => setShowPresentation(false)} />
      )}
    </>
  );
};

export default Editor;
