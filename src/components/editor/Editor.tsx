import React, { useRef, useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { EditorFindBar } from './EditorFindBar';
import { FindMatchGutter } from './FindMatchGutter';
import type { FindMatch } from '@/utils/findInText';
import BacklinksBar from './BacklinksBar';
import { resolveWikiLink } from '@/utils/wikiLinks';
import { requestDocOpen } from '@/utils/docNavigation';
import { toast } from '@/components/common/Toast';
import { consumeSearchJump, subscribeSearchJump } from '@/utils/searchJump';
import {
  collectOutlineHeadings,
  findActiveHeadingId,
  lineIndexToOffset,
  scrollTopToLineIndex,
} from '@/utils/outlineActive';
import { measureLineHeight } from '@/utils/findInText';
import { anchorFromSelection } from '@/utils/commentAnchor';
import type { CommentAnchor } from '@/types';
import { useShallow } from 'zustand/react/shallow';
import { useNotesStore } from '@/store';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useEditorFormatting } from '@/hooks/useEditorFormatting';
import { useAiSelectionAction } from '@/hooks/useAiSelectionAction';
import { useFormatPainter } from '@/hooks/useFormatPainter';
import { usePreviewScrollSync } from '@/hooks/usePreviewScrollSync';
import { EditorHeader } from './EditorHeader';
import { TabBar } from '@/components/layout/TabBar';
/* SlashTriggerState 是纯类型（import type 编译期擦除），不会把旧内核拉回主分块 */
import type { SlashTriggerState } from './EditorContent';
import { SlashCommandMenu } from './SlashCommandMenu';
import { SLASH_ITEMS, type SlashCommandItem } from './slashItems';
import { EditorStatusBar } from './EditorStatusBar';
import { DocumentOutline } from '@/components/outline/DocumentOutline';
import { CommentsPanel } from '@/components/comments/CommentsPanel';
import { EmptyState } from '@/components/common/EmptyState';
import { LinkDialog } from '@/components/dialogs/LinkDialog';
import { Loading } from '@/components/common/Loading';
import AiSelectionMenu from '@/components/ai/AiSelectionMenu';
import { DocInfoPanel } from './DocInfoPanel';
import { IconDocument, IconPlus } from '@/components/common/Icon';
import { EditorDocTitle } from './EditorDocTitle';
import { SelectionToolbar } from './SelectionToolbar';
import { applyCommentHighlights, clearCommentHighlights } from '@/utils/commentHighlight';
import { stripDuplicateTitleHeading } from '@/utils/dedupeTitle';
import { RichEditor } from './RichEditor';
import type { RichEditorHandle } from './RichEditor';
import { applyMarkdownFormat } from '@/utils/markdownFormat';
import { useRichEditorEnabled } from '@/utils/richEditorFlag';
import { copyToClipboard } from '@/utils/clipboard';
import { findShortcutId } from '@/utils/shortcuts';
import type { FormatType } from '@/hooks/useEditorFormatting';
import type { NoteDoc } from '@/types';

/*
 * Markdown 渲染链路（react-markdown + unified 生态 + KaTeX ≈ 630KB）改成懒加载。
 *
 * 旧实现是静态 import，于是它的预加载被写进了 index.html：应用一启动就要下载
 * 整个 markdown + katex 分块，而默认视图是「编辑」模式，压根不渲染预览。
 * 现在只有真正切到预览 / 分屏（或打开演示模式、模板预览）时才拉取。
 */
const MarkdownPreview = lazy(() =>
  import('./MarkdownPreview').then((m) => ({ default: m.MarkdownPreview })),
);
const PresentationMode = lazy(() =>
  import('@/components/presentation/PresentationMode').then((m) => ({ default: m.PresentationMode })),
);

/*
 * 旧 textarea 内核改成懒加载。
 *
 * 富文本内核是默认内核，textarea 分支只有在设置里显式关闭富文本（或用户此前关过）
 * 时才会渲染。旧实现是静态 import，于是 EditorContent + useSmartInput +
 * useEditorKeys + useEditorLineOps + useEditorPasteDrop + editorTextOps（约 1100 行）
 * 全部打进 App 主分块 —— 首屏为一个绝大多数用户永远不会进入的分支付了钱。
 *
 * 注意：不能用 `import('./EditorContent').then(m => ({ default: m.EditorContent }))`
 * 之外的写法（命名导出必须转 default），且 SlashTriggerState 是纯类型，
 * 从同一模块 import type 不会引入运行时依赖。
 */
const EditorContent = lazy(() =>
  import('./EditorContent').then((m) => ({ default: m.EditorContent })),
);

/** 旧内核加载占位：保持编辑器区域高度，避免切换瞬间布局跳动 */
function LegacyEditorFallback(): React.JSX.Element {
  return (
    <div className="editor-content-loading">
      <Loading type="spinner" size="small" text="正在加载编辑器…" />
    </div>
  );
}

/** 预览分块的统一加载占位：保留容器尺寸，避免切到分屏时布局跳动 */
function PreviewFallback(): React.JSX.Element {
  return (
    <div className="markdown-preview markdown-preview-loading">
      <Loading type="spinner" size="small" text="正在加载预览…" />
    </div>
  );
}

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
  /** 标签栏切换文档：渲染在编辑器卡片内顶部，与语雀一致 */
  onViewDoc?: (notebookId: string, docId: string) => void;
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
  onViewDoc,
}) => {
  const { updateDoc, toggleFavorite, saveStatus, addComment, deleteComment, addReply } = useNotesStore(useShallow((s) => ({
    updateDoc: s.updateDoc,
    toggleFavorite: s.toggleFavorite,
    saveStatus: s.saveStatus,
    addComment: s.addComment,
    deleteComment: s.deleteComment,
    addReply: s.addReply,
  })));
  const { undo: undoRaw, redo: redoRaw, canUndo, canRedo, recordSnapshot, clearHistory } = useUndoRedo();

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
  /** 工具栏整体收起（语雀式：Esc 临时收起，再次 Esc 展开） */
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('edit');
  /*
   * 富文本内核开关：订阅式读取（useRichEditorEnabled）。
   *
   * 旧实现是 `useState(() => isRichEditorEnabled())` —— 只在挂载时读一次，
   * 于是"改开关必须刷新页面"，而开关本身又只存在于 devtools（设置页没入口）。
   * 现在设置页可直接切换，切换后立即重渲染，无需刷新。
   * 声明位置靠前：handleSlashRun / handleCommentSelection 等回调都要读它。
   */
  const richEditorEnabled = useRichEditorEnabled();
  /** 富文本编辑器的命令式接口（contenteditable 没有 selectionStart/End） */
  const richEditorRef = useRef<RichEditorHandle | null>(null);
  /**
   * 富文本内核的工具栏激活态。
   *
   * 旧实现由 useEditorFormatting 监听 textarea 推算；富文本内核下 textarea 为
   * null，那个监听永远不会绑定 —— 工具栏看不出当前是不是加粗/标题/列表。
   * 这里在每次选区变化时直接问编辑器要（读 DOM 祖先链，比推断 Markdown 更准）。
   */
  const [richActiveFormats, setRichActiveFormats] = useState<Set<string>>(new Set());

  /**
   * 撤销/重做（两种内核统一）。
   *
   * 富文本内核必须额外强制重渲染：撤销与"用户打字"都走 updateDocContent，
   * 编辑器无法从 docContent 区分二者，会误判"内容没变"而跳过重建 ——
   * 实测表现为**重做点了没反应**（撤销回退到空内容后，DOM 是无 data-md 的空段落）。
   * textarea 内核由 React 的 value 绑定自然同步，不需要这一步。
   */
  const undo = useCallback(() => {
    undoRaw();
    if (richEditorEnabled) richEditorRef.current?.forceRender();
  }, [undoRaw, richEditorEnabled]);

  const redo = useCallback(() => {
    redoRaw();
    if (richEditorEnabled) richEditorRef.current?.forceRender();
  }, [redoRaw, richEditorEnabled]);
  /**
   * 富文本根节点（DOM 引用，供划词浮层做"选区是否在编辑器内"的判断）。
   *
   * 用 state 而不是渲染时读 ref：渲染期读取 ref 违反 react-hooks/refs，
   * 而且首次渲染时 ref 还没挂上，浮层会拿到 null。
   */
  const [richEditorNode, setRichEditorNode] = useState<HTMLDivElement | null>(null);

  // 选区变化时刷新工具栏激活态（富文本内核）：加粗/标题/列表等按钮要跟着光标走
  useEffect(() => {
    if (!richEditorEnabled) return;
    const update = (): void => {
      const next = richEditorRef.current?.getActiveFormats() ?? new Set<string>();
      setRichActiveFormats((prev) => {
        if (prev.size === next.size && [...next].every((f) => prev.has(f))) return prev;
        return next;
      });
    };
    document.addEventListener('selectionchange', update);
    const node = richEditorNode;
    node?.addEventListener('input', update);
    node?.addEventListener('keyup', update);
    node?.addEventListener('mouseup', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      node?.removeEventListener('input', update);
      node?.removeEventListener('keyup', update);
      node?.removeEventListener('mouseup', update);
    };
  }, [richEditorEnabled, richEditorNode]);
  /** 插入链接弹窗：打开时捕获的选区（start/end/text），确认时据此拼接 [text](url) */
  const [linkDialog, setLinkDialog] = useState<{ start: number; end: number; text: string } | null>(null);
  /** 斜杠命令面板状态（提到 Editor 层，避免击键引发编辑区全量重渲染） */
  const [slashState, setSlashState] = useState<SlashTriggerState | null>(null);
  /** 当前 `/query` 片段范围，执行命令前需先删除 */
  const slashRangeRef = useRef<{ start: number; end: number } | null>(null);
  /** 文档内查找栏（Ctrl+F 查找 / Ctrl+H 替换）：此前编辑器没有任何查找能力 */
  const [findBar, setFindBar] = useState<{ open: boolean; replace: boolean; query?: string }>({
    open: false,
    replace: false,
  });
  /**
   * 查找命中信息（供右侧刻度带绘制）+ 跳转函数。
   * 都走 ref 直通而不是 state：命中数可能上百，进 state 会让每次输入都重渲染编辑器。
   */
  const [findMatches, setFindMatches] = useState<{ matches: FindMatch[]; current: number; contentLength: number } | null>(null);
  const findJumpRef = useRef<((index: number) => void) | null>(null);
  const registerFindJump = useCallback((fn: ((index: number) => void) | null) => {
    findJumpRef.current = fn;
  }, []);
  const handleFindJump = useCallback((index: number) => {
    findJumpRef.current?.(index);
  }, []);

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

  /**
   * 工具栏收起 / 展开。
   *
   * 收起的是**整条工具栏**（不是打开低频格式面板），并立即把焦点还给正文 ——
   * 与语雀一致：收起后直接继续写，Esc 再次恢复。若焦点停在即将卸载的按钮上，
   * 浏览器会把焦点丢到 body，下一次 Esc 就检测不到"正在编辑"从而失效。
   */
  const toggleToolbar = useCallback(() => {
    setToolbarCollapsed(prev => !prev);
    requestAnimationFrame(() => {
      if (richEditorEnabled) richEditorRef.current?.focus();
      else textareaRef.current?.focus();
    });
  }, [richEditorEnabled]);

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
    /*
     * 富文本内核：用 Markdown 偏移捕获选区。
     * 旧实现直接读 textarea.selectionStart —— contenteditable 没有该属性，
     * `if (!ta) return` 会让**链接弹窗根本不出现**（实测的功能缺口）。
     */
    if (richEditorEnabled) {
      const range = richEditorRef.current?.getSelectionRange();
      if (range) {
        const content = activeDoc?.content ?? '';
        setLinkDialog({ start: range.start, end: range.end, text: content.substring(range.start, range.end) });
      } else {
        setLinkDialog(null);
      }
      return;
    }
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setLinkDialog({ start, end, text: ta.value.substring(start, end) });
  }, [textareaRef, richEditorEnabled, activeDoc?.content]);

  const handleLinkConfirm = useCallback((text: string, url: string) => {
    const sel = linkDialog;
    setLinkDialog(null);

    const md = `[${text}](${url})`;

    if (richEditorEnabled) {
      const content = activeDoc?.content ?? '';
      let start = sel?.start ?? 0;
      let end = sel?.end ?? 0;
      // 弹窗打开期间内容可能被草稿恢复等流程改写，选区失配时退化为当前光标处插入
      if (sel && content.substring(start, end) !== sel.text) {
        const cur = richEditorRef.current?.getSelectionRange();
        start = cur?.start ?? 0;
        end = cur?.end ?? 0;
      }
      updateDocContent({ content: content.substring(0, start) + md + content.substring(end) });
      requestAnimationFrame(() => {
        richEditorRef.current?.focus();
        // 光标放到插入的链接之后，用户可以接着输入
        richEditorRef.current?.selectRange(start + md.length, start + md.length);
      });
      return;
    }

    const ta = textareaRef.current;
    if (!sel || !ta) return;

    const content = ta.value;
    let { start, end } = sel;
    // 弹窗打开期间内容可能被草稿恢复等流程改写，选区失配时退化为当前光标处插入
    if (content.substring(start, end) !== sel.text) {
      start = ta.selectionStart;
      end = ta.selectionEnd;
    }
    updateDocContent({ content: content.substring(0, start) + md + content.substring(end) });
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = start + md.length;
      }
    });
  }, [linkDialog, textareaRef, updateDocContent, richEditorEnabled, activeDoc?.content]);

  // 选区 AI 操作：浮层内完成流式预览，用户确认后一次性回写（保留撤销与版本快照）
  const {
    position: aiMenuPosition,
    selection: aiSelection,
    open: openAiSelection,
    close: closeAiSelection,
    apply: applyAiResult,
  } = useAiSelectionAction({
    textareaRef,
    updateDocContent,
    activeDocId,
    enabled: previewMode !== 'preview',
  });

  const handleAiAction = useCallback(() => {
    openAiSelection();
  }, [openAiSelection]);

  /**
   * 在富文本内核的**光标处**插入 Markdown。
   *
   * 旧实现把图片/附件/粘贴内容追加到文档末尾（`content + md`）—— 用户把光标
   * 放在段落中间插图，图片却跑到全文最后，这是实打实的功能错误。
   * 这里按当前选区偏移拼接，并把光标恢复到插入内容之后。
   */
  const insertMarkdownAtCursor = useCallback((md: string) => {
    const current = activeDocRef.current;
    if (!current || !md) return;
    const content = current.content ?? '';
    const range = richEditorRef.current?.getSelectionRange();
    const at = Math.max(0, Math.min(range?.end ?? content.length, content.length));
    const before = content.slice(0, at);
    const after = content.slice(at);

    // 图片/表格/多行内容按块插入（前后留空行），行内文本直接接上
    const isBlock = md.includes('\n') || /^!\[[^\]]*\]\(/.test(md);
    const lead = isBlock
      ? before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
      : '';
    const tail = isBlock
      ? after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
      : '';

    updateDocContent({ content: before + lead + md + tail + after });
    const caret = at + lead.length + md.length;
    requestAnimationFrame(() => {
      richEditorRef.current?.focus();
      richEditorRef.current?.selectRange(caret, caret);
    });
  }, [updateDocContent]);

  // 使用格式化 hook
  const {
    activeFormats,
    applyFormat: applyFormatLegacy,
    handlePaste,
    handleInsertImage,
    handleInsertFile,
  } = useEditorFormatting({
    textareaRef,
    textareaNode,
    activeDoc,
    updateDocContent,
    onLinkInsert: handleOpenLinkDialog,
    /*
     * 富文本内核的图片/附件插入：旧路径最终写 textarea.value，
     * contenteditable 下该节点为 null —— 不接管就会静默失败
     * （实测：粘贴图片后编辑器内容被清空、图片没插入）。
     * 这里改为按当前光标位置插入，而不是一律追加到文末。
     */
    onRichInsert: richEditorEnabled ? insertMarkdownAtCursor : undefined,
  });

  /** 打开系统文件选择器插入图片（工具栏 / 斜杠命令共用） */
  const pickImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void handleInsertImage(file);
    };
    input.click();
  }, [handleInsertImage]);

  /**
   * 格式应用入口（两种内核统一）。
   *
   * 旧内核的 applyFormat 直接改 `textarea.value` 与 selectionStart/End，
   * contenteditable 里这些属性不存在 —— 不分流的话，新内核下顶部工具栏
   * **所有按钮都没反应**（`if (!ta) return` 静默失败）。
   *
   * 新内核改为在 Markdown 源码上应用，再回写并恢复选区：
   * 这样格式命令与"markdown 是唯一真实源"保持一致，撤销/版本快照也照常工作。
   */
  const applyFormat = useCallback(
    (type: FormatType, options?: { color?: string; size?: string; rows?: number; cols?: number; language?: string; callout?: string }) => {
      if (!richEditorEnabled) {
        applyFormatLegacy(type, options);
        return;
      }
      // 图片是"选文件"而不是"改 Markdown"，两条内核都必须走这里，否则按钮无效
      if (type === 'image') {
        pickImage();
        return;
      }
      /*
       * 链接必须走弹窗：旧路径把它当作行内包裹，直接写入 `[文字](url)` ——
       * 用户拿到的是一条指向字面量 "url" 的假链接，而不是"输入地址"的对话框。
       */
      if (type === 'link') {
        handleOpenLinkDialog();
        return;
      }
      const range = richEditorRef.current?.getSelectionRange();
      if (!range) return;
      const content = activeDoc?.content ?? '';
      const result = applyMarkdownFormat(content, range.start, range.end, type, options);
      if (!result) {
        // 未知类型：回退到旧实现，保证不静默失败
        applyFormatLegacy(type, options);
        return;
      }
      if (result.content === content) return;
      updateDocContent({ content: result.content });
      // 重渲染完成后恢复选区，用户能接着操作刚格式化的文字
      requestAnimationFrame(() => {
        richEditorRef.current?.focus();
        richEditorRef.current?.selectRange(result.start, result.end);
      });
    },
    [richEditorEnabled, activeDoc?.content, updateDocContent, applyFormatLegacy, pickImage, handleOpenLinkDialog],
  );

  // 格式刷：复制 / 套用行内格式
  const { painterFormats, handleFormatPainter, cancelFormatPainter } = useFormatPainter({
    activeFormats,
    applyFormat,
  });

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

  // 执行斜杠命令：先删除 "/query" 片段，再在删除后的光标处应用格式
  const handleSlashRun = useCallback((item: SlashCommandItem) => {
    const range = slashRangeRef.current;
    slashRangeRef.current = null;
    setSlashState(null);
    if (!range) return;

    // 提示块等命令的 id 与格式类型不同（5 个变体共用一个 FormatType）
    const formatType = (item.format ?? item.id) as FormatType;

    if (richEditorEnabled) {
      const content = activeDoc?.content ?? '';
      const hasToken = content.substring(range.start, range.end).startsWith('/');
      const cleaned = hasToken ? content.substring(0, range.start) + content.substring(range.end) : content;
      const commitCleaned = (): void => {
        if (cleaned !== content) updateDocContent({ content: cleaned });
      };

      /*
       * 图片 / 链接需要额外交互（文件选择、弹窗），不能直接改源码。
       * 先删掉 /query 并把光标放回原处，再触发对应流程。
       */
      if (item.id === 'image' || item.id === 'link') {
        commitCleaned();
        requestAnimationFrame(() => {
          richEditorRef.current?.focus();
          richEditorRef.current?.selectRange(range.start, range.start);
          if (item.id === 'image') pickImage();
          else handleOpenLinkDialog();
        });
        return;
      }

      /*
       * 其余命令直接作用在"删掉 /query 后的源码"上。
       * 旧实现先改内容、再调 applyFormat —— 后者读到的是渲染闭包里的旧内容
       * （仍含 /query），格式会落到错误位置。这里一次算完，避免竞态。
       */
      const result = applyMarkdownFormat(cleaned, range.start, range.start, formatType, item.options);
      const next = result ? result.content : cleaned;
      if (next !== content) updateDocContent({ content: next });
      const caret = result ? result.end : range.start;
      requestAnimationFrame(() => {
        richEditorRef.current?.focus();
        richEditorRef.current?.selectRange(caret, caret);
      });
      return;
    }

    const ta = textareaRef.current;
    if (!ta) return;
    if (range && ta.value.substring(range.start, range.end).startsWith('/')) {
      ta.value = ta.value.substring(0, range.start) + ta.value.substring(range.end);
      ta.selectionStart = ta.selectionEnd = range.start;
      ta.focus();
    }
    applyFormat(formatType, item.options);
  }, [applyFormat, richEditorEnabled, activeDoc?.content, updateDocContent, pickImage, handleOpenLinkDialog]);

  // 字号选择：有选中文本时作用于选区（span style，与颜色/高亮一致），
  // 无选区时回退为调整整个编辑器的基础字号
  const handleFontSizeSelect = useCallback((size: string) => {
    /*
     * 判断"是否有选区"必须按内核分流：
     * contenteditable 没有 selectionStart/End，旧判断会永远走 else 分支 ——
     * 实测症状是"选中文字后改字号，结果改的是整篇文档的基础字号"。
     */
    const hasSelection = richEditorEnabled
      ? (() => {
          const range = richEditorRef.current?.getSelectionRange();
          return !!range && range.end > range.start;
        })()
      : (() => {
          const ta = textareaRef.current;
          return !!ta && ta.selectionStart !== ta.selectionEnd;
        })();
    if (hasSelection) {
      applyFormat('fontSize', { size });
    } else {
      onFontSizeChange(size);
    }
  }, [applyFormat, onFontSizeChange, richEditorEnabled]);

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

  const handleStartPresentation = useCallback(() => {
    setShowPresentationMenu(false);
    setShowPresentation(true);
  }, []);

  // 滚动后浮层坐标失效，先关闭斜杠面板（已关闭时 setState(null) 不触发渲染）
  const handleEditorScrollStart = useCallback(() => {
    setSlashState((prev) => (prev ? null : prev));
  }, []);

  // 编辑器 ↔ 预览滚动同步（ref 直通，零重渲染）
  const { handleEditorScroll, handlePreviewScroll, handleRegisterPreviewSync } = usePreviewScrollSync({
    textareaRef,
    previewMode,
    onEditorScroll: handleEditorScrollStart,
    /* 富文本内核下 textareaRef 为 null，改由编辑器根节点提供滚动信息 */
    getScrollContainer: richEditorEnabled ? () => richEditorNode : undefined,
  });

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
        return;
      }
      // Esc 优先取消待应用的格式刷
      if (e.key === 'Escape' && painterFormats) {
        e.preventDefault();
        cancelFormatPainter();
        return;
      }
      /*
       * 语雀式：正在正文里写作时按 Esc，临时收起整条工具栏；再按一次恢复。
       * 只在焦点确实位于正文时生效 —— 否则在菜单、标题输入框、弹窗里按 Esc
       * 应该由各自负责关闭，不能被这里抢走。
       */
      if (
        e.key === 'Escape' &&
        !findBar.open &&
        !slashState &&
        !linkDialog &&
        !aiSelection
      ) {
        const active = document.activeElement;
        const inEditorContent = active instanceof Node && (
          (richEditorEnabled && !!richEditorNode?.contains(active)) ||
          (!richEditorEnabled && !!textareaNode && active === textareaNode)
        );
        if (inEditorContent) {
          e.preventDefault();
          toggleToolbar();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    togglePreviewMode,
    toggleFocusMode,
    isFocusMode,
    painterFormats,
    cancelFormatPainter,
    findBar.open,
    slashState,
    linkDialog,
    aiSelection,
    richEditorEnabled,
    richEditorNode,
    textareaNode,
    toggleToolbar,
  ]);

  // 文档内查找 / 替换的快捷键。
  // 必须用 capture 阶段：全局 useKeyboard 在 bubble 阶段对未识别按键一律 preventDefault，
  // 冒泡监听会晚一步、拿不到这次按键。
  useEffect(() => {
    const handleFindKeys = (e: KeyboardEvent): void => {
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && !e.altKey && !e.shiftKey && key === 'f') {
        e.preventDefault();
        setFindBar({ open: true, replace: false });
        return;
      }
      if (mod && !e.altKey && !e.shiftKey && key === 'h') {
        e.preventDefault();
        setFindBar({ open: true, replace: true });
        return;
      }
      if (e.key === 'Escape' && findBar.open) {
        e.preventDefault();
        setFindBar({ open: false, replace: false });
      }
    };
    window.addEventListener('keydown', handleFindKeys, true);
    return () => window.removeEventListener('keydown', handleFindKeys, true);
  }, [findBar.open]);

  // 搜索结果跳转定位（S1）：打开查找栏并预填关键词，落到首个命中。
  // 两条路径都要覆盖：文档刚切换过来（effect 依赖 activeDoc.id），
  // 以及命中的就是当前这篇（订阅回调）。
  useEffect(() => {
    const applyJump = (): void => {
      const docId = activeDocRef.current?.id;
      if (!docId) return;
      const query = consumeSearchJump(docId);
      if (query) setFindBar({ open: true, replace: false, query });
    };
    applyJump();
    return subscribeSearchJump(applyJump);
  }, [activeDoc?.id]);

  /**
   * 预览里点击 [[双链]]（K1）：先在本知识库内按标题找，再跨库找。
   * 找不到时不报错也不静默 —— 明确告诉用户"还没有这篇"，否则会让人怀疑链接坏了。
   */
  const handleWikiLink = useCallback((title: string) => {
    const state = useNotesStore.getState();
    const localDocs = state.notebooks.find((nb) => nb.id === state.activeNotebookId)?.docs ?? [];
    const localHit = resolveWikiLink(title, localDocs);
    if (localHit) {
      requestDocOpen({ notebookId: state.activeNotebookId, docId: localHit.id });
      return;
    }

    for (const notebook of state.notebooks) {
      const hit = resolveWikiLink(title, notebook.docs);
      if (hit) {
        requestDocOpen({ notebookId: notebook.id, docId: hit.id });
        return;
      }
    }

    toast.warning(`没有找到标题为「${title}」的文档`);
  }, []);

  /**
   * 大纲"当前章节"跟随阅读位置（语雀的大纲会随滚动高亮）。
   *
   * 驱动源用**滚动位置**而不是光标：阅读时用户常常只滚动、光标停在别处不动，
   * 若只看光标，高亮会长时间停在错误章节。
   * 滚动事件本身很密，因此只做 O(标题数) 的线性扫描（通常几十项），不引入额外状态。
   */
  const outlineHeadings = useMemo(
    () => collectOutlineHeadings(activeDoc?.content || ''),
    [activeDoc?.content],
  );
  /**
   * 高亮项连同"它属于哪篇文档"一起记。
   *
   * 旧写法用 effect 在 activeDocId 变化时 setActiveHeadingId(null) 来清理，
   * 但那是"effect 里同步 setState"（级联渲染，被 react-hooks/set-state-in-effect 拦下）。
   * 改为在这里携带 docId，渲染时判断归属：换了文档，旧高亮自然失效，无需 effect。
   */
  const [activeHeading, setActiveHeading] = useState<{ docId: string; headingId: string } | null>(null);
  const activeHeadingId = activeHeading && activeHeading.docId === activeDocId
    ? activeHeading.headingId
    : null;

  const setActiveHeadingId = useCallback((headingId: string | null) => {
    setActiveHeading(headingId ? { docId: activeDocId, headingId } : null);
  }, [activeDocId]);

  // 大纲点击跳转：position 是字符偏移，scrollTop 是像素，必须按行号换算，
  // 否则长文档会跳到完全错误的位置
  const handleOutlineClick = useCallback((position: number) => {
    /*
     * 富文本内核：没有 textarea 可算行高，直接用 Range 选中并让浏览器滚动。
     * `selectRange` 内部已调 scrollIntoView，因此不必再做像素换算 ——
     * 那套换算是为 textarea 的"等高行"假设服务的，contenteditable 里标题与
     * 正文行高不同，按行高估算必然偏。
     */
    if (richEditorEnabled) {
      richEditorRef.current?.focus();
      richEditorRef.current?.selectRange(position, position);
      setActiveHeadingId(findActiveHeadingId(outlineHeadings, position));
      return;
    }
    const ta = textareaRef.current;
    if (!ta) return;
    const line = ta.value.slice(0, position).split('\n').length - 1;
    const style = getComputedStyle(ta);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6 || 24;
    ta.focus();
    ta.setSelectionRange(position, position);
    ta.scrollTop = Math.max(0, line * lineHeight - 12);
    // 跳转后立即把大纲高亮切到目标章节，不等下一次滚动事件
    setActiveHeadingId(findActiveHeadingId(outlineHeadings, position));
  }, [outlineHeadings, setActiveHeadingId, richEditorEnabled]);

  const handleEditorScrollWithOutline = useCallback(() => {
    handleEditorScroll();
    /*
     * 富文本内核：用**光标所在块的源码偏移**近似当前阅读位置。
     *
     * contenteditable 里没有"行号 ↔ 偏移"的线性关系（标题、列表、代码块行高各异），
     * textarea 那套按行高换算在这里会明显偏移。改为取视口顶部附近块的首个可见元素，
     * 读它的 data-md 累加偏移 —— 精度足够驱动大纲高亮，且不依赖行高假设。
     */
    if (richEditorEnabled) {
      const root = richEditorNode;
      if (!root) return;
      const rootTop = root.getBoundingClientRect().top;
      let acc = 0
      for (const el of Array.from(root.children)) {
        const rect = el.getBoundingClientRect()
        // 找到第一个底边仍在视口内的块：它就是当前阅读位置
        if (rect.bottom >= rootTop + 4) {
          setActiveHeadingId(findActiveHeadingId(outlineHeadings, acc))
          return
        }
        acc += (el.getAttribute('data-md') ?? el.textContent ?? '').length + 2
      }
      return
    }
    const ta = textareaRef.current;
    if (!ta) return;
    const lineHeight = measureLineHeight(ta);
    const lineIndex = scrollTopToLineIndex(ta.scrollTop, lineHeight);
    const offset = lineIndexToOffset(ta.value, lineIndex);
    setActiveHeadingId(findActiveHeadingId(outlineHeadings, offset));
  }, [handleEditorScroll, outlineHeadings, setActiveHeadingId, richEditorEnabled, richEditorNode]);

  /**
   * 划词评论：把当前选区收成一个锚点，并打开评论面板。
   * 没有选区时退化为"文档级评论"（仍然打开面板，只是不带引用）。
   */
  const [pendingAnchor, setPendingAnchor] = useState<CommentAnchor | null>(null);
  /** 文档信息面板（字数/版本/评论/标签的集中视图） */
  const [showDocInfo, setShowDocInfo] = useState(false);

  const handleCommentSelection = useCallback(() => {
    // 新内核：用 Markdown 偏移取选区（与评论锚点的坐标系一致）
    if (richEditorEnabled) {
      const range = richEditorRef.current?.getSelectionRange();
      setPendingAnchor(
        range && range.end > range.start
          ? anchorFromSelection(activeDoc?.content ?? '', range.start, range.end)
          : null,
      );
      onToggleCommentsPanel?.();
      return;
    }
    const ta = textareaRef.current;
    if (ta) {
      const anchor = anchorFromSelection(ta.value, ta.selectionStart, ta.selectionEnd);
      setPendingAnchor(anchor);
    } else {
      setPendingAnchor(null);
    }
    onToggleCommentsPanel?.();
  }, [onToggleCommentsPanel, richEditorEnabled, activeDoc?.content]);

  /** 点击评论里的引用片段 → 选中并滚动到正文对应位置 */
  const handleJumpToAnchor = useCallback((start: number, end: number) => {
    // 新内核：按 Markdown 偏移在 DOM 里定位并滚动
    if (richEditorEnabled) {
      richEditorRef.current?.focus();
      richEditorRef.current?.selectRange(start, end);
      return;
    }
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(start, end);
    const line = ta.value.slice(0, start).split('\n').length - 1;
    const lineHeight = measureLineHeight(ta);
    ta.scrollTop = Math.max(0, line * lineHeight - ta.clientHeight / 3);
  }, [richEditorEnabled]);

  /**
   * 合并"与文档标题逐字相同的首行 H1"。
   *
   * 本项目标题是独立字段，正文里再写一个同名 `# 标题`（导入文档时最常见）
   * 就会在正文顶部出现两个一模一样的标题，看起来像渲染错误。
   * 只在**逐字相同**时合并，且每篇文档每次会话只处理一次（ref 去重），
   * 避免用户故意写同名标题时被反复删除。
   */
  const dedupedDocIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const doc = activeDoc;
    if (!doc) return;
    if (dedupedDocIdsRef.current.has(doc.id)) return;
    const deduped = stripDuplicateTitleHeading(doc.content ?? '', doc.title);
    if (deduped === null) return;
    dedupedDocIdsRef.current.add(doc.id);
    updateDocContent({ content: deduped });
    toast.info('已合并与标题重复的首行标题');
  }, [activeDoc, updateDocContent]);

  /*
   * 评论锚点在正文里的高亮（CSS Custom Highlight，不改 DOM）。
   *
   * 防抖 250ms：击键时 activeDoc.content 每个字符都变，逐次重算全部锚点
   * 会把输入成本从 O(1) 抬到 O(评论数 × 块数)。评论面板打开时也不额外加速 ——
   * 高亮是"余光可见"的信息，250ms 的延迟无感。
   */
  useEffect(() => {
    if (!richEditorEnabled) return
    const timer = window.setTimeout(() => {
      applyCommentHighlights(richEditorNode, activeDoc?.comments ?? [])
    }, 250)
    return () => window.clearTimeout(timer)
  }, [richEditorEnabled, richEditorNode, activeDoc?.comments, activeDoc?.content])

  // 卸载时清掉注册表，避免切到别的视图后高亮还挂在旧 Range 上
  useEffect(() => () => clearCommentHighlights(), [])

  if (!activeDoc) {
    return (
      <main className="editor-panel">
        <EmptyState
          icon={<IconDocument size={32} />}
          title="选择一个文档开始编辑"
          description="从左侧选择一个文档，或创建一个新文档开始记录"
          actions={[
            {
              label: '新建文档',
              icon: <IconPlus size={14} />,
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
        {onViewDoc && <TabBar onActivate={onViewDoc} />}
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
          applyFormat={applyFormat}
          onFormatPainter={handleFormatPainter}
          formatPainterActive={!!painterFormats}
          onAiAction={handleAiAction}
          activeFormats={richEditorEnabled ? richActiveFormats : activeFormats}
          showOutlinePanel={showOutlinePanel}
          onToggleOutlinePanel={onToggleOutlinePanel}
          showCommentsPanel={showCommentsPanel}
          onToggleCommentsPanel={handleCommentSelection}
          onShowDocInfo={() => setShowDocInfo(true)}
          /* 富文本内核下标题在正文里，顶部栏不再重复渲染标题输入框 */
          richEditorTitleInBody={richEditorEnabled}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isFocusMode={isFocusMode}
          onToggleFocusMode={toggleFocusMode}
          previewMode={previewMode}
          onTogglePreviewMode={togglePreviewMode}
          toolbarCollapsed={toolbarCollapsed}
          onToggleToolbar={toggleToolbar}
        />
        {/* 反向链接（K1）：只有真的被引用时才出现 */}
        <BacklinksBar />

        {findBar.open && (
          <EditorFindBar
            key={findBar.query ?? 'find'}
            content={activeDoc.content || ''}
            initialShowReplace={findBar.replace}
            initialQuery={findBar.query}
            textareaRef={textareaRef}
            onReplaceContent={(next) => updateDocContent({ content: next })}
            onClose={() => setFindBar({ open: false, replace: false })}
            onMatchesChange={setFindMatches}
            selectRangeInRichEditor={
              richEditorEnabled
                ? (start, end) => richEditorRef.current?.selectRange(start, end) ?? false
                : undefined
            }
            onRegisterJump={registerFindJump}
            /* 旧内核是 React.lazy，查找栏可能先于编辑器出现 —— 就绪后需重新定位 */
            editorReady={richEditorEnabled ? !!richEditorNode : !!textareaNode}
          />
        )}
        <div className={`editor-body-wrapper ${previewMode === 'split' ? 'editor-body-wrapper-split' : ''}`}>
          {showEditor && (
            <div className={`editor-content-wrapper ${previewMode === 'split' ? 'editor-content-split' : ''}`}>
              {/*
                富文本内核（contenteditable）与旧内核（textarea）按开关二选一。
                新内核尚未接完撤销/查找/评论锚点等链路，默认关闭 —— 打开开关即可试用，
                出问题切回开关就能立刻回到 textarea，不会陷入"打不了字"的状态。
              */}
              {richEditorEnabled ? (
                <>
                  {/*
                    标题进正文（语雀式）：标题与内容同一条内容列、同一字号阶梯，
                    看起来是"文档标题"而不是"窗口名"。旧内核保持原布局不变。
                  */}
                  <EditorDocTitle
                    activeDoc={activeDoc}
                    updateDocContent={updateDocContent}
                    onEnter={() => richEditorRef.current?.focus()}
                  />
                  <RichEditor
                    ref={richEditorRef}
                    activeDoc={activeDoc}
                    fontSize={fontSize}
                    updateDocContent={updateDocContent}
                    onScroll={handleEditorScrollWithOutline}
                    onSlashChange={handleSlashChange}
                    onMount={setRichEditorNode}
                    /* 粘贴图片 / 拖入文件：与 textarea 分支共用同一套处理 */
                    onInsertImage={handleInsertImage}
                    onInsertFile={handleInsertFile}
                    onInsertMarkdown={insertMarkdownAtCursor}
                    resolveShortcut={resolveShortcut}
                    onFormatShortcut={applyFormat}
                  />
                </>
              ) : (
                <Suspense fallback={<LegacyEditorFallback />}>
                  <EditorContent
                    activeDoc={activeDoc}
                    fontSize={fontSize}
                    updateDocContent={updateDocContent}
                    handlePaste={handlePaste}
                    onFormatShortcut={(type) => applyFormat(type)}
                    resolveShortcut={resolveShortcut}
                    onTextareaMount={handleTextareaMount}
                    onScroll={handleEditorScrollWithOutline}
                    onInsertImage={handleInsertImage}
                    onInsertFile={handleInsertFile}
                    onSlashChange={handleSlashChange}
                  />
                </Suspense>
              )}
              {slashState && (
                <SlashCommandMenu
                  query={slashState.query}
                  items={SLASH_ITEMS}
                  position={slashState.caret}
                  onRun={handleSlashRun}
                  onClose={closeSlashMenu}
                />
              )}
              {/* 查找命中刻度：textarea 无法内联高亮，用右侧刻度带回答"一共几处、都在哪" */}
              {findBar.open && findMatches && findMatches.matches.length > 0 && (
                <FindMatchGutter
                  matches={findMatches.matches}
                  current={findMatches.current}
                  contentLength={findMatches.contentLength}
                  onJump={handleFindJump}
                  textareaNode={textareaNode}
                  /* 富文本内核下 textareaNode 为 null，改由编辑器根节点提供滚动信息 */
                  scrollContainer={richEditorEnabled ? richEditorNode : null}
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
              <Suspense fallback={<PreviewFallback />}>
                <MarkdownPreview
                  content={activeDoc.content || ''}
                  syncScroll={previewMode === 'split'}
                  onScrollChange={handlePreviewScroll}
                  onRegisterEditorScrollSync={handleRegisterPreviewSync}
                  onToggleTask={handleToggleTask}
                  onWikiLink={handleWikiLink}
                />
              </Suspense>
            </div>
          )}
          <DocumentOutline
            content={activeDoc.content || ''}
            onHeadingClick={handleOutlineClick}
            isOpen={!!showOutlinePanel}
            onClose={() => onToggleOutlinePanel?.()}
            activeHeadingId={activeHeadingId}
          />
          <CommentsPanel
            comments={activeDoc.comments || []}
            docId={activeDocId}
            onAddComment={(docId, content, anchor) => addComment(activeNotebookId, docId, content, anchor)}
            onDeleteComment={(docId, commentId) => deleteComment(activeNotebookId, docId, commentId)}
            onAddReply={(docId, commentId, content) => addReply(activeNotebookId, docId, commentId, content)}
            isOpen={!!showCommentsPanel}
            onClose={() => onToggleCommentsPanel?.()}
            pendingAnchor={pendingAnchor}
            onCancelPendingAnchor={() => setPendingAnchor(null)}
            docContent={activeDoc.content || ''}
            onJumpToAnchor={handleJumpToAnchor}
          />
        </div>
        <EditorStatusBar
          content={activeDoc.content || ''}
          textareaRef={textareaRef}
          textareaNode={textareaNode}
          /*
           * 富文本内核下 textareaNode 为 null，行列号会永久停在"行1,列1"。
           * 传入光标信息提供者与编辑器根节点，状态栏改用 document 级
           * selectionchange 更新 —— 两种内核的显示规则完全一致。
           */
          cursorInfoProvider={
            richEditorEnabled ? () => richEditorRef.current?.getCursorInfo() ?? null : undefined
          }
          richEditorRoot={richEditorEnabled ? richEditorNode : null}
        />
      </main>
      {showPresentation && activeDoc && (
        <Suspense fallback={null}>
          <PresentationMode doc={activeDoc} onClose={() => setShowPresentation(false)} />
        </Suspense>
      )}
      {showDocInfo && activeDoc && (
        <DocInfoPanel
          notebookId={activeNotebookId}
          docId={activeDocId}
          onClose={() => setShowDocInfo(false)}
        />
      )}
      {linkDialog && (
        <LinkDialog
          initialText={linkDialog.text}
          onConfirm={handleLinkConfirm}
          onCancel={() => setLinkDialog(null)}
        />
      )}
      {aiSelection && aiMenuPosition && (        <AiSelectionMenu
          selection={aiSelection}
          position={aiMenuPosition}
          onApply={applyAiResult}
          onClose={closeAiSelection}
        />
      )}

      {/*
        划词浮层工具栏（语雀式）：选中文字后贴着选区上方出现，点一下即加粗。
        只在新内核下启用 —— 它依赖 Range 的屏幕坐标，textarea 拿不到。
        AI 浮层打开时让位（两者都贴选区，同时出现会重叠）。
      */}
      {richEditorEnabled && !aiSelection && (
        <SelectionToolbar
          root={richEditorNode}
          onFormat={(type) => applyFormat(type as FormatType)}
          onLink={handleOpenLinkDialog}
          enabled={previewMode !== 'preview'}
        />
      )}
    </>
  );
};

export default Editor;
