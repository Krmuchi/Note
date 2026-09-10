import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNotesStore } from '@/store';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useEditorFormatting } from '@/hooks/useEditorFormatting';
import { EditorHeader } from './EditorHeader';
import { EditorContent, type SlashTriggerState } from './EditorContent';
import { SlashCommandMenu, type SlashCommandItem } from './SlashCommandMenu';
import { MarkdownPreview } from './MarkdownPreview';
import { EditorStatusBar } from './EditorStatusBar';
import { PresentationMode } from '@/components/presentation/PresentationMode';
import { DocumentOutline } from '@/components/outline/DocumentOutline';
import { CommentsPanel } from '@/components/comments/CommentsPanel';
import { EmptyState } from '@/components/common/EmptyState';
import { LinkDialog } from '@/components/dialogs/LinkDialog';
import { toast } from '@/components/common/Toast';
import { copyToClipboard } from '@/utils/clipboard';
import { findShortcutId } from '@/utils/shortcuts';
import { getCaretPixelPosition } from '@/utils/editorTextOps';
import type { FormatType } from '@/hooks/useEditorFormatting';
import type { NoteDoc } from '@/types';

export type PreviewMode = 'edit' | 'preview' | 'split';

/** 格式刷只复制行内格式：块级标记（标题/列表等）套用会破坏目标行结构 */
const PAINTER_INLINE_FORMATS = new Set(['bold', 'italic', 'underline', 'strike', 'code']);

/** 斜杠命令清单：id 与 FormatType 对齐，执行时先删除 `/query` 再复用 applyFormat */
const SLASH_ITEMS: SlashCommandItem[] = [
  { id: 'heading1', title: '标题 1', keywords: ['h1', 'heading', 'biaoti'], group: 'block', icon: 'H1', hint: 'Ctrl+1' },
  { id: 'heading2', title: '标题 2', keywords: ['h2', 'heading', 'biaoti'], group: 'block', icon: 'H2', hint: 'Ctrl+2' },
  { id: 'heading3', title: '标题 3', keywords: ['h3', 'heading', 'biaoti'], group: 'block', icon: 'H3', hint: 'Ctrl+3' },
  { id: 'ulist', title: '无序列表', keywords: ['ul', 'list', 'liebiao'], group: 'block', icon: '•' },
  { id: 'olist', title: '有序列表', keywords: ['ol', 'list', 'liebiao'], group: 'block', icon: '1.' },
  { id: 'tasklist', title: '任务列表', keywords: ['task', 'todo', 'renwu'], group: 'block', icon: '☑' },
  { id: 'quote', title: '引用块', keywords: ['quote', 'yinyong'], group: 'block', icon: '❝' },
  { id: 'codeblock', title: '代码块', keywords: ['code', 'pre', 'daima'], group: 'block', icon: '</>' },
  { id: 'formula', title: '公式', keywords: ['formula', 'math', 'katex', 'gongshi'], group: 'block', icon: '∑' },
  { id: 'table', title: '表格', keywords: ['table', 'biaoge'], group: 'block', icon: '⊞' },
  { id: 'divider', title: '分割线', keywords: ['hr', 'divider', 'fengexian'], group: 'block', icon: '—' },
  { id: 'image', title: '图片', keywords: ['image', 'img', 'tupian'], group: 'media', icon: '🖼' },
  { id: 'link', title: '链接', keywords: ['link', 'url', 'lianjie'], group: 'media', icon: '🔗' },
  { id: 'code', title: '行内代码', keywords: ['code', 'inline', 'daima'], group: 'advanced', icon: '`' },
  { id: 'clearFormat', title: '清除格式', keywords: ['clear', 'qingchu'], group: 'advanced', icon: '🧹' },
];

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
  const { updateDoc, toggleFavorite, saveStatus, addComment, deleteComment, addReply, saveManualVersion } = useNotesStore(useShallow((s) => ({
    updateDoc: s.updateDoc,
    toggleFavorite: s.toggleFavorite,
    saveStatus: s.saveStatus,
    addComment: s.addComment,
    deleteComment: s.deleteComment,
    addReply: s.addReply,
    saveManualVersion: s.saveManualVersion,
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
  /** 插入链接弹窗：打开时捕获的选区（start/end/text），确认时据此拼接 [text](url) */
  const [linkDialog, setLinkDialog] = useState<{ start: number; end: number; text: string } | null>(null);
  /** 斜杠命令面板状态（提到 Editor 层，避免击键引发编辑区全量重渲染） */
  const [slashState, setSlashState] = useState<SlashTriggerState | null>(null);
  /** 当前 `/query` 片段范围，执行命令前需先删除 */
  const slashRangeRef = useRef<{ start: number; end: number } | null>(null);
  /** 格式刷：null 未激活；非 null 表示已复制的行内格式类型 */
  const [painterFormats, setPainterFormats] = useState<string[] | null>(null);
  /** 划词评论：编辑器当前选区（文本 + 偏移），用于浮动按钮定位与锚定 */
  const [textSelection, setTextSelection] = useState<{ text: string; start: number; end: number } | null>(null);
  /** 待写入评论的锚定信息：浮动按钮点击后固化，评论发出/面板关闭时清除。
   *  携带 docId：文档切换后旧锚定自然失效（提交时校验），无需 effect 清理 */
  const [pendingCommentAnchor, setPendingCommentAnchor] = useState<{ docId: string; quote: string; anchorStart: number; anchorEnd: number } | null>(null);

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
    const onFsChange = (): void => {
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

  // 插入链接：点击工具栏时捕获选区并弹出 LinkDialog，确认后用 [文本](url) 替换选区
  const handleOpenLinkDialog = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setLinkDialog({ start, end, text: ta.value.substring(start, end) });
  }, [textareaRef]);

  const handleLinkConfirm = useCallback((text: string, url: string) => {
    const sel = linkDialog;
    setLinkDialog(null);
    const ta = textareaRef.current;
    if (!sel || !ta) return;

    const content = ta.value;
    let { start, end } = sel;
    // 弹窗打开期间内容可能被草稿恢复等流程改写，选区失配时退化为当前光标处插入
    if (content.substring(start, end) !== sel.text) {
      start = ta.selectionStart;
      end = ta.selectionEnd;
    }
    const md = `[${text}](${url})`;
    updateDocContent({ content: content.substring(0, start) + md + content.substring(end) });
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = start + md.length;
      }
    });
  }, [linkDialog, textareaRef, updateDocContent]);

  // 使用格式化 hook
  const {
    activeFormats,
    applyFormat,
    handlePaste,
    handleInsertImage,
    handleInsertFile,
  } = useEditorFormatting({
    textareaRef,
    textareaNode,
    activeDoc,
    updateDocContent,
    onLinkInsert: handleOpenLinkDialog,
  });

  // 划词追踪：texture 上 mouseup/keyup 后收集选区，供浮动"评论"按钮定位。
  // 依赖 textareaNode（textarea 是挂载即销毁节点），blur 时立即隐藏按钮；
  // 浮动按钮自身 onMouseDown preventDefault，避免点击时触发 blur 导致按钮先消失
  useEffect(() => {
    const ta = textareaNode;
    if (!ta) return;

    const updateSelection = (): void => {
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        if (start !== end) {
          const text = el.value.substring(start, end).trim().slice(0, 80);
          if (text) {
            setTextSelection({ text, start, end });
            return;
          }
        }
        setTextSelection(null);
      }, 0);
    };
    const clearSelection = (): void => setTextSelection(null);

    ta.addEventListener('mouseup', updateSelection);
    ta.addEventListener('keyup', updateSelection);
    ta.addEventListener('blur', clearSelection);
    return () => {
      ta.removeEventListener('mouseup', updateSelection);
      ta.removeEventListener('keyup', updateSelection);
      ta.removeEventListener('blur', clearSelection);
    };
  }, [textareaNode, textareaRef]);

  // 斜杠命令：仅输入可唤出面板；光标移动只用于同步关闭，避免光标落在已有 "/xxx" 上也弹面板
  const handleSlashChange = useCallback((next: SlashTriggerState | null, source: 'input' | 'cursor') => {
    slashRangeRef.current = next ? { start: next.start, end: next.end } : null;
    setSlashState((prev) => {
      if (!next) return null;
      if (source === 'cursor' && !prev) return null;
      return next;
    });
  }, []);

  const closeSlashMenu = useCallback(() => {
    slashRangeRef.current = null;
    setSlashState(null);
  }, []);

  // 编辑器内快捷键解析：始终读取 store 最新键位（含用户自定义覆盖）
  const resolveShortcut = useCallback(
    (combo: string[]) => findShortcutId(useNotesStore.getState().shortcuts, combo),
    [],
  );

  // 执行斜杠命令：先删除 "/query" 片段并把光标回退到 "/" 处，再复用 applyFormat
  const handleSlashRun = useCallback((item: SlashCommandItem) => {
    const range = slashRangeRef.current;
    slashRangeRef.current = null;
    setSlashState(null);
    const ta = textareaRef.current;
    if (!ta) return;
    if (range && ta.value.substring(range.start, range.end).startsWith('/')) {
      ta.value = ta.value.substring(0, range.start) + ta.value.substring(range.end);
      ta.selectionStart = ta.selectionEnd = range.start;
      ta.focus();
    }
    applyFormat(item.id as FormatType);
  }, [applyFormat]);

  /**
   * 格式刷：未激活时复制当前光标/选区的行内格式；激活后再次点击应用到目标选区。
   * 仅处理行内格式，避免把标题/列表等块级标记错误地叠加到目标行。
   */
  const handleFormatPainter = useCallback(() => {
    if (painterFormats) {
      const formats = painterFormats;
      setPainterFormats(null);
      formats.forEach((format) => applyFormat(format as FormatType));
      return;
    }
    const captured = Array.from(activeFormats).filter((f) => PAINTER_INLINE_FORMATS.has(f));
    setPainterFormats(captured);
  }, [painterFormats, activeFormats, applyFormat]);

  // 字号选择：有选中文本时作用于选区（span style，与颜色/高亮一致），
  // 无选区时回退为调整整个编辑器的基础字号
  const handleFontSizeSelect = useCallback((size: string) => {
    const ta = textareaRef.current;
    if (ta && ta.selectionStart !== ta.selectionEnd) {
      applyFormat('fontSize', { size });
    } else {
      onFontSizeChange(size);
    }
  }, [applyFormat, onFontSizeChange]);

  // 预览任务列表勾选回写。基于最新 activeDocRef 内容校验目标行，
  // 防止预览 200ms 防抖期间内容错位或行内 HTML checkbox 误触
  const handleToggleTask = useCallback((lineIndex: number, checked: boolean) => {
    const current = activeDocRef.current;
    if (!current) return;
    const lines = (current.content || '').split('\n');
    const line = lines[lineIndex];
    if (line === undefined || !/^\s*[-*+]\s+\[[ xX]\]/.test(line)) return;
    lines[lineIndex] = line.replace(
      /^(\s*[-*+]\s+\[)([ xX])(\])/,
      (_, head: string, _state: string, tail: string) => `${head}${checked ? 'x' : ' '}${tail}`,
    );
    updateDocContent({ content: lines.join('\n') });
  }, [updateDocContent]);

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

  // 手动保存当前版本：把当前内容按 type:'manual' 存为版本快照
  const handleSaveVersion = useCallback(() => {
    if (!activeDoc) return;
    saveManualVersion(activeNotebookId, activeDocId);
    toast.success('已保存当前版本');
  }, [activeDoc, activeNotebookId, activeDocId, saveManualVersion]);

  // 浮动"评论"按钮：固化选区为锚定信息并打开评论区。
  // 校验偏移仍匹配当前文档内容（文档切换/内容漂移导致选区残留时直接放弃）
  const handleFloatComment = useCallback(() => {
    const sel = textSelection;
    if (!sel) return;
    const ta = textareaNode;
    if (!ta || ta.value.substring(sel.start, sel.end) !== sel.text) {
      setTextSelection(null);
      return;
    }
    setPendingCommentAnchor({ docId: activeDocId, quote: sel.text, anchorStart: sel.start, anchorEnd: sel.end });
    setTextSelection(null);
    if (!showCommentsPanel) onToggleCommentsPanel?.();
  }, [textSelection, textareaNode, activeDocId, showCommentsPanel, onToggleCommentsPanel]);

  // 提交评论时携带锚定信息（若有），发出后清除，避免下一条评论误带引用；
  // 锚定归属的 docId 必须与提交目标一致（防文档切换后残留）
  const handleAddComment = useCallback((docId: string, content: string) => {
    const anchor = pendingCommentAnchor;
    if (anchor && anchor.docId !== docId) {
      setPendingCommentAnchor(null);
    }
    addComment(activeNotebookId, docId, content, anchor && anchor.docId === docId ? anchor : undefined);
    setPendingCommentAnchor(null);
  }, [pendingCommentAnchor, activeNotebookId, addComment]);

  // 关闭评论面板时同时清理待锚定引用与选区
  const handleToggleCommentsPanel = useCallback(() => {
    if (showCommentsPanel) {
      setPendingCommentAnchor(null);
      setTextSelection(null);
    }
    onToggleCommentsPanel?.();
  }, [showCommentsPanel, onToggleCommentsPanel]);

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
    // 滚动后浮层坐标失效，关闭斜杠面板（已关闭时 setState(null) 不触发渲染）
    setSlashState((prev) => (prev ? null : prev));
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
    const handleKeyDown = (e: KeyboardEvent): void => {
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
      // Esc 优先取消待应用的格式刷
      if (e.key === 'Escape' && painterFormats) {
        e.preventDefault();
        setPainterFormats(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePreviewMode, toggleFocusMode, isFocusMode, painterFormats]);

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
  // 浮动评论按钮定位：仅编辑态 + 有选区 + 评论区未打开时计算。
  // 读取 textareaNode（state）而非 ref，避免渲染期访问 ref 触发 react-hooks/refs
  const commentFloatPos =
    showEditor && textSelection && !showCommentsPanel && textareaNode
      ? getCaretPixelPosition(textareaNode, textSelection.start)
      : null;

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
          onFontSizeSelect={handleFontSizeSelect}
          undo={undo}
          redo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onStartPresentation={handleStartPresentation}
          onShowVersionHistory={onShowVersionHistory}
          onSaveVersion={handleSaveVersion}
          applyFormat={applyFormat}
          onFormatPainter={handleFormatPainter}
          formatPainterActive={!!painterFormats}
          activeFormats={activeFormats}
          showOutlinePanel={showOutlinePanel}
          onToggleOutlinePanel={onToggleOutlinePanel}
          showCommentsPanel={showCommentsPanel}
          onToggleCommentsPanel={handleToggleCommentsPanel}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isFocusMode={isFocusMode}
          onToggleFocusMode={toggleFocusMode}
          previewMode={previewMode}
          onTogglePreviewMode={togglePreviewMode}
        />
        <div className={`editor-body-wrapper ${previewMode === 'split' ? 'editor-body-wrapper-split' : ''}`}>
          {commentFloatPos && (
            <button
              className="editor-comment-float"
              style={{ top: Math.max(8, commentFloatPos.top - 42), left: commentFloatPos.left }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleFloatComment}
              title="评论选中文本"
            >
              💬 评论
            </button>
          )}
          {showEditor && (
            <div className={`editor-content-wrapper ${previewMode === 'split' ? 'editor-content-split' : ''}`}>
              <EditorContent
                activeDoc={activeDoc}
                fontSize={fontSize}
                updateDocContent={updateDocContent}
                handlePaste={handlePaste}
                onFormatShortcut={(type) => applyFormat(type)}
                resolveShortcut={resolveShortcut}
                onTextareaMount={handleTextareaMount}
                onScroll={handleEditorScroll}
                onInsertImage={handleInsertImage}
                onInsertFile={handleInsertFile}
                onSlashChange={handleSlashChange}
              />
              {slashState && (
                <SlashCommandMenu
                  query={slashState.query}
                  items={SLASH_ITEMS}
                  position={slashState.caret}
                  onRun={handleSlashRun}
                  onClose={closeSlashMenu}
                />
              )}
            </div>
          )}
          {showPreview && (
            <div
              className={`preview-content-wrapper ${previewMode === 'split' ? 'preview-content-split' : ''}`}
              // 预览正文跟随工具栏字号设置（markdown-preview.css 消费此变量）
              style={{ '--preview-font-size': fontSize } as React.CSSProperties}
            >
              <MarkdownPreview
                content={activeDoc.content || ''}
                syncScroll={previewMode === 'split'}
                onScrollChange={handlePreviewScroll}
                onRegisterEditorScrollSync={handleRegisterPreviewSync}
                onToggleTask={handleToggleTask}
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
            onAddComment={handleAddComment}
            onDeleteComment={(docId, commentId) => deleteComment(activeNotebookId, docId, commentId)}
            onAddReply={(docId, commentId, content) => addReply(activeNotebookId, docId, commentId, content)}
            isOpen={!!showCommentsPanel}
            onClose={handleToggleCommentsPanel}
            pendingQuote={pendingCommentAnchor?.quote ?? null}
          />
        </div>
        <EditorStatusBar content={activeDoc.content || ''} textareaRef={textareaRef} textareaNode={textareaNode} />
      </main>
      {showPresentation && activeDoc && (
        <PresentationMode doc={activeDoc} onClose={() => setShowPresentation(false)} />
      )}
      {linkDialog && (
        <LinkDialog
          initialText={linkDialog.text}
          onConfirm={handleLinkConfirm}
          onCancel={() => setLinkDialog(null)}
        />
      )}
    </>
  );
};

export default Editor;
