import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import type { NoteDoc, Notebook } from "./types";
import { useNotesStore } from "./store/notesStore";
import {
  insertWrappedText as utilsInsertWrappedText,
  insertLinePrefix as utilsInsertLinePrefix,
  insertHeading as utilsInsertHeading,
  insertLink as utilsInsertLink,
  insertImage as utilsInsertImage,
  insertCodeBlock as utilsInsertCodeBlock
} from "./utils/editorUtils";
import { saveDraft, loadLatestDraft, clearDrafts } from "./utils/autoSaveUtils";
import { debounce } from "./utils/debounce";
import { ToastContainer, useToast } from "./components/Toast";
import { Loading } from "./components/Loading";
import { EditorHeader } from "./components/EditorHeader";
import { EditorContent } from "./components/EditorContent";
import "./App.css";

// 懒加载组件，优化首屏加载性能
const StartPage = lazy(() => import("./components/StartPage"));
const SharePanel = lazy(() => import("./components/SharePanel"));
const TagPanel = lazy(() => import("./components/TagPanel"));

const SearchPanel = lazy(() => import("./components/SearchPanel"));
const VersionHistoryPanel = lazy(() => import("./components/VersionHistoryPanel"));

/**
 * 懒加载包装组件
 * 为子组件提供加载状态的 fallback 显示
 */
type LazyLoaderProps = {
  children: React.ReactNode;
};

function LazyLoader({ children }: LazyLoaderProps) {
  return (
    <Suspense fallback={
      <div style={{ padding: '20px', textAlign: 'center', color: '#999', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Loading type="spinner" size="medium" text="加载中..." />
      </div>
    }>
      {children}
    </Suspense>
  );
}

/**
 * 最近浏览记录接口
 */
interface RecentView {
  docId: string;
  notebookId: string;
  viewedAt: string;
}

/**
 * 主应用组件
 * 包含笔记应用的完整界面布局和核心功能
 */
function App() {
  // 从状态管理获取笔记数据和操作方法
  const {
    notebooks, 
    activeNotebookId, 
    activeDocId, 
    searchText,
    trash,
    tags,
    loadNotes,
    saveNotes,
    setActiveNotebookId,
    setActiveDocId,
    setSearchText,
    createNotebook,
    deleteNotebook,
    createDoc,
    updateDoc,
    moveDocToTrash,
    toggleFavorite,
    restoreFromTrash,
    deleteFromTrash,
    clearTrash,
    generateShareLink,
    deleteShareLink,
    saveStatus,
    setSaveStatus,
  } = useNotesStore();

  // UI 状态管理
  const [showMoreMenu, setShowMoreMenu] = useState(false);         // 更多菜单显示状态
  const [fontSize, setFontSize] = useState<string>("15px");        // 编辑器字体大小
  const [showMoreOptions, setShowMoreOptions] = useState(false);   // 更多选项菜单
  const [activeView, setActiveView] = useState<string>("notebooks"); // 当前视图类型
  const [activeLeftMenu, setActiveLeftMenu] = useState<string>("notebooks"); // 左侧菜单激活项
  const [recentViews, setRecentViews] = useState<RecentView[]>([]); // 最近浏览记录
  const [notebooksExpanded, setNotebooksExpanded] = useState(true); // 知识库列表展开状态
  const [showSharePanel, setShowSharePanel] = useState(false);     // 分享面板显示
  const [showTagPanel, setShowTagPanel] = useState(false);         // 标签面板显示
  const [showSearchPanel, setShowSearchPanel] = useState(false);   // 搜索面板显示
  const [showVersionHistory, setShowVersionHistory] = useState(false); // 版本历史面板
  const [, setTagsUpdated] = useState(0);                          // 标签更新触发器
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false); // 草稿恢复对话框
  const [recoveryDraftMeta, setRecoveryDraftMeta] = useState<{ timestamp: string; docTitle: string } | null>(null); // 草稿元数据
  const [isLoading, setIsLoading] = useState(true);                // 加载状态

  // Dialog 状态
  const [renameDocId, setRenameDocId] = useState<string | null>(null);    // 正在重命名的文档 ID
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null); // 确认操作回调
  const [moveDocData, setMoveDocData] = useState<{ id: string; title: string; options: { id: string; label: string; depth: number }[] } | null>(null); // 移动文档信息

  const dirtyRef = useRef(false);                                  // 脏标记（用于跳过首次触发）
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 自动保存定时器

  // Toast 通知钩子
  const { toasts, removeToast, error } = useToast();

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    docId: string;
  } | null>(null);

  const [notebookContextMenu, setNotebookContextMenu] = useState<{
    x: number;
    y: number;
    notebookId: string;
  } | null>(null);

  // 使用防抖优化搜索功能
  const debouncedSetSearchText = useCallback(debounce((value: string) => {
    setSearchText(value);
  }, 300), [setSearchText]);



  // 点击外部关闭右键菜单
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
      setNotebookContextMenu(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  /**
   * 查看文档处理
   * 更新最近浏览记录并切换到文档视图
   */
  const handleViewDoc = (notebookId: string, docId: string) => {
    setRecentViews(prev => {
      const filtered = prev.filter(v => !(v.docId === docId && v.notebookId === notebookId));
      return [{ docId, notebookId, viewedAt: new Date().toISOString() }, ...filtered].slice(0, 50);
    });
    setActiveNotebookId(notebookId);
    setActiveDocId(docId);
    setActiveView("notebooks");
    setActiveLeftMenu("notebooks");
  };

  /**
   * 重命名文档
   */
  const handleRename = (docId: string) => {
    setRenameDocId(docId);
    setContextMenu(null);
  };

  // 这些函数在组件的其他部分被使用，但TypeScript可能无法完全追踪到
  const handleRenameConfirm = useCallback((newTitle: string) => {
    if (!renameDocId || !newTitle.trim()) return;
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === renameDocId));
    if (!notebook) return;
    updateDoc(notebook.id, renameDocId, { title: newTitle.trim() });
    setRenameDocId(null);
  }, [renameDocId, notebooks]); // eslint-disable-line @typescript-eslint/no-unused-vars

  const handleRenameCancel = useCallback(() => setRenameDocId(null), []); // eslint-disable-line @typescript-eslint/no-unused-vars

  const handleMoveConfirm = useCallback((targetId: string | null) => {
    if (!moveDocData) return;
    updateDoc(notebooks.find(nb => nb.docs.some(d => d.id === moveDocData.id))!.id, moveDocData.id, { parentId: targetId });
    setMoveDocData(null);
  }, [moveDocData, notebooks]); // eslint-disable-line @typescript-eslint/no-unused-vars

  const handleMoveCancel = useCallback(() => setMoveDocData(null), []); // eslint-disable-line @typescript-eslint/no-unused-vars

  /**
   * 复制文档链接到剪贴板
   */
  const handleCopyLink = (docId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/doc/${docId}`);
    setContextMenu(null);
  };

  /**
   * 复制文档（创建副本）
   */
  const handleCopy = (docId: string) => {
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
    if (!notebook) return;
    
    const doc = notebook.docs.find(d => d.id === docId);
    if (!doc) return;
    
    createDoc(notebook.id, doc.parentId, {
      title: `${doc.title || '未命名文档'} (副本)`,
      content: doc.content,
      tags: doc.tags,
    });
    setContextMenu(null);
  };

  /**
   * 删除文档到回收站
   */
  const handleDelete = (docId: string) => {
    setConfirmAction(() => () => {
      const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
      if (!notebook) return;
      moveDocToTrash(notebook.id, docId);
      if (activeDocId === docId) {
        setActiveDocId('');
      }
      setConfirmAction(null);
      setContextMenu(null);
    });
    setContextMenu(null);
  };

  /**
   * 在新窗口中打开文档
   */
  const handleOpenInNewWindow = (docId: string) => {
    window.open(`/doc/${docId}`, '_blank');
    setContextMenu(null);
  };

  // 演示菜单状态
  const [showPresentationMenu, setShowPresentationMenu] = useState(false);

  /**
   * 开始演示
   */
  const handleStartPresentation = () => {
    error('演示功能尚未实现');
    setShowPresentationMenu(false);
  };

  /**
   * 编辑演示分页
   */
  const handleEditPresentation = () => {
    error('演示分页编辑功能尚未实现');
    setShowPresentationMenu(false);
  };

  /**
   * 从目录中移除文档（设为根目录）
   */
  const handleRemoveFromDirectory = (docId: string) => {
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
    if (!notebook) return;
    
    updateDoc(notebook.id, docId, { parentId: null });
    setContextMenu(null);
  };

  /**
   * 移动文档到指定位置
   */
  const handleMove = (docId: string) => {
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
    if (!notebook) return;

    const doc = notebook.docs.find(d => d.id === docId);
    if (!doc) return;

    const otherDocs = notebook.docs.filter(d => d.id !== docId);
    if (otherDocs.length === 0) {
      error('没有其他文档可以移动');
      setContextMenu(null);
      return;
    }

    const options = otherDocs.map(d => ({
      id: d.id,
      label: `${' '.repeat((docDepthMap.get(d.id) ?? 0) * 2)}${d.title || '未命名文档'}`.trim(),
      depth: docDepthMap.get(d.id) ?? 0,
    }));

    setMoveDocData({ id: docId, title: doc.title || '未命名文档', options });
    setContextMenu(null);
  };

  /**
   * 导出文档为 Markdown 文件
   */
  const handleExport = (docId: string) => {
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
    if (!notebook) return;
    
    const doc = notebook.docs.find(d => d.id === docId);
    if (!doc) return;
    
    const content = `# ${doc.title || '未命名文档'}\n\n${doc.content || ''}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${doc.title || '未命名文档'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setContextMenu(null);
  };

  /**
   * 固定/取消固定文档
   */
  const handlePin = (docId: string) => {
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
    if (!notebook) return;
    
    const doc = notebook.docs.find(d => d.id === docId);
    if (!doc) return;
    
    updateDoc(notebook.id, docId, { pinned: !doc.pinned });
    setContextMenu(null);
  };

  /**
   * 从收藏中移除知识库（预留功能）
   */
  const handleRemoveNotebookFromFavorites = (_notebookId: string) => {
    setNotebookContextMenu(null);
    error('该功能尚未实现');
  };

  const handleSetNotebookOfflineAvailable = (_notebookId: string) => {
    setNotebookContextMenu(null);
    error('该功能尚未实现');
  };

  const handleNotebookPermissions = (_notebookId: string) => {
    setNotebookContextMenu(null);
    error('该功能尚未实现');
  };

  const handleNotebookMoreSettings = (_notebookId: string) => {
    setNotebookContextMenu(null);
    error('该功能尚未实现');
  };

  /**
   * 删除知识库
   */
  const handleDeleteNotebook = (notebookId: string) => {
    const notebook = notebooks.find(nb => nb.id === notebookId);
    if (!notebook) return;
    
    if (window.confirm(`确定要删除知识库「${notebook.title}」吗？知识库中的所有文档将被移到回收站。`)) {
      deleteNotebook(notebookId);
      setNotebookContextMenu(null);
    } else {
      setNotebookContextMenu(null);
    }
  };

  /**
   * 获取所有收藏的文档（按更新时间排序）
   */
  const favoriteDocs = useMemo(() => {
    const favorites: { notebook: Notebook; doc: NoteDoc }[] = [];
    notebooks.forEach(notebook => {
      notebook.docs.forEach(doc => {
        if (doc.favorite) {
          favorites.push({ notebook, doc });
        }
      });
    });
    return favorites.sort((a, b) => new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime());
  }, [notebooks]);

  /**
   * 初始化加载笔记数据和草稿恢复检测
   */
  useEffect(() => {
    const draft = loadLatestDraft();

    loadNotes().then(() => {
      setIsLoading(false);
      // 加载完成后检查是否有更新的本地草稿（崩溃恢复）
      if (draft) {
        const current = useNotesStore.getState();
        const draftNotebooks = JSON.stringify(draft.data.notebooks);
        const currentNotebooks = JSON.stringify(current.notebooks);
        const draftTrash = JSON.stringify(draft.data.trash);
        const currentTrash = JSON.stringify(current.trash);

        if (draftNotebooks !== currentNotebooks || draftTrash !== currentTrash) {
          setRecoveryDraftMeta({
            timestamp: draft.meta.timestamp,
            docTitle: draft.meta.docTitle,
          });
          setShowRecoveryDialog(true);
        }
      }
    }).catch(error => {
      console.error('Failed to load notes:', error);
      setIsLoading(false);
      error('加载笔记失败，请检查数据文件');
    });
  }, [error]);

  /**
   * 页面关闭前保存数据并清除草稿
   */
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveNotes();
      clearDrafts();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  /**
   * 自动保存：数据变化时延迟保存到磁盘和 localStorage
   */
  const notebooksRef = useRef(notebooks);
  const trashRef = useRef(trash);
  const tagsRef = useRef(tags);
  const activeDocIdRef = useRef(activeDocId);
  const activeDocTitleRef = useRef("");
  useEffect(() => { notebooksRef.current = notebooks; }, [notebooks]);
  useEffect(() => { trashRef.current = trash; }, [trash]);
  useEffect(() => { tagsRef.current = tags; }, [tags]);
  useEffect(() => { activeDocIdRef.current = activeDocId; }, [activeDocId]);


  useEffect(() => {
    // 跳过初始挂载触发
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      const state = useNotesStore.getState();
      saveDraft(
        { notebooks: state.notebooks, trash: state.trash, tags: state.tags, searchHistory: state.searchHistory },
        activeDocTitleRef.current,
      );
      saveNotes();
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [notebooks, trash, tags]);

  /**
   * 恢复草稿
   */
  const handleRecoverDraft = useCallback(() => {
    const draft = loadLatestDraft();
    if (!draft) return;

    const state = useNotesStore.getState();
    state.updateStore(draft.data);

    // 如果可能，重新选择活动文档
    if (draft.data.notebooks.length > 0) {
      const nb = draft.data.notebooks[0];
      state.setActiveNotebookId(nb.id);
      if (nb.docs.length > 0) {
        state.setActiveDocId(nb.docs[0].id);
      }
    }

    setSaveStatus('saved');
    setShowRecoveryDialog(false);
    clearDrafts();
  }, [setSaveStatus]);

  /**
   * 丢弃草稿
   */
  const handleDiscardDraft = useCallback(() => {
    clearDrafts();
    setShowRecoveryDialog(false);
  }, []);

  /**
   * 当前活动知识库
   */
  const activeNotebook = useMemo(
    () => notebooks.find((item) => item.id === activeNotebookId) ?? null,
    [activeNotebookId, notebooks],
  );

  /**
   * 当前活动文档
   */
  const activeDoc = useMemo(
    () => activeNotebook?.docs.find((item) => item.id === activeDocId) ?? null,
    [activeDocId, activeNotebook],
  );

  // 编辑器文本域引用
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => { 
    if (activeDoc) {
      activeDocTitleRef.current = activeDoc.title; 
    }
  }, [activeDoc?.title]);

  /**
   * 搜索结果文档列表
   */
  const searchResultDocs = useMemo(() => {
    if (!activeNotebook || !searchText.trim()) return activeNotebook?.docs || [];
    const keyword = searchText.trim().toLowerCase();
    return activeNotebook.docs.filter((doc) => {
      const haystack = `${doc.title} ${doc.content} ${doc.tags.join(" ")}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [activeNotebook, searchText]);

  /**
   * 文档层级映射（用于树形显示缩进）
   */
  const docDepthMap = useMemo(() => {
    if (!activeNotebook) return new Map<string, number>();
    const map = new Map<string, number>();
    const lookup = new Map(activeNotebook.docs.map((doc) => [doc.id, doc]));
    const depthFor = (doc: NoteDoc, seen = new Set<string>()): number => {
      if (!doc.parentId || !lookup.get(doc.parentId) || seen.has(doc.parentId)) return 0;
      const parent = lookup.get(doc.parentId);
      if (!parent) return 0;
      seen.add(doc.parentId);
      return 1 + depthFor(parent, seen);
    };
    activeNotebook.docs.forEach((doc) => {
      map.set(doc.id, depthFor(doc));
    });
    return map;
  }, [activeNotebook]);

  // 撤销/重做历史相关
  type DocSnapshot = { title: string; content: string; tags: string[]; time?: number };
  const [pastSnapshots, setPastSnapshots] = useState<DocSnapshot[]>([]); // 撤销历史
  const [futureSnapshots, setFutureSnapshots] = useState<DocSnapshot[]>([]); // 重做历史
  const historyLimit = 200; // 历史记录上限
  const lastHistoryAtRef = useRef<number>(0); // 上次记录时间
  const mergeWindow = 1000; // 合并窗口（毫秒）

  // Use refs for undo/redo state to avoid stale closures in keyboard handler
  const pastSnapshotsRef = useRef(pastSnapshots);
  const futureSnapshotsRef = useRef(futureSnapshots);
  const activeDocRef = useRef(activeDoc);
  const activeNotebookIdRef = useRef(activeNotebookId);
  useEffect(() => { pastSnapshotsRef.current = pastSnapshots; }, [pastSnapshots]);
  useEffect(() => { futureSnapshotsRef.current = futureSnapshots; }, [futureSnapshots]);
  useEffect(() => { activeDocRef.current = activeDoc; }, [activeDoc]);
  useEffect(() => { activeNotebookIdRef.current = activeNotebookId; }, [activeNotebookId]);

  const canUndo = pastSnapshotsRef.current.length > 0;
  const canRedo = futureSnapshotsRef.current.length > 0;

  /**
   * 撤销操作
   */
  const undo = useCallback(() => {
    const doc = activeDocRef.current;
    if (!doc || !canUndo) return;
    const prev = pastSnapshotsRef.current[pastSnapshotsRef.current.length - 1];
    setPastSnapshots((p) => p.slice(0, p.length - 1));
    setFutureSnapshots((f) => [...f, { title: doc.title ?? "", content: doc.content ?? "", tags: doc.tags ?? [] }]);
    updateDoc(activeNotebookIdRef.current, doc.id, { title: prev.title, content: prev.content, tags: prev.tags });
  }, [canUndo]);

  /**
   * 重做操作
   */
  const redo = useCallback(() => {
    const doc = activeDocRef.current;
    if (!doc || !canRedo) return;
    const next = futureSnapshotsRef.current[futureSnapshotsRef.current.length - 1];
    setFutureSnapshots((f) => f.slice(0, f.length - 1));
    setPastSnapshots((p) => [...p, { title: doc.title ?? "", content: doc.content ?? "", tags: doc.tags ?? [] }]);
    updateDoc(activeNotebookIdRef.current, doc.id, { title: next.title, content: next.content, tags: next.tags });
  }, [canRedo]);

  /**
   * 全局键盘事件监听
   * 处理快捷键：Ctrl+K 打开搜索、Ctrl+Z 撤销、Ctrl+Y/Shift+Ctrl+Z 重做
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      // Ctrl/Cmd + K: 打开搜索面板
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearchPanel(true);
        return;
      }
      
      if (!meta) return;
      if (isInput) return;
      
      const key = e.key.toLowerCase();
      // Ctrl/Cmd + Z: 撤销
      if (key === 'z') {
        e.preventDefault();
        undo();
      } 
      // Ctrl/Cmd + Y 或 Ctrl/Cmd + Shift + Z: 重做
      else if (key === 'y' || (e.shiftKey && key === 'z')) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /**
   * 处理粘贴事件
   * 支持粘贴图片
   */
  const handlePaste = (ev: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = ev.clipboardData && ev.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type && item.type.indexOf("image") === 0) {
        const file = item.getAsFile();
        if (file) {
          ev.preventDefault();
          void insertImageFunc(file);
          return;
        }
      }
    }
  };

  /**
   * 在选中文本周围插入包裹符
   */
  const insertWrap = (prefix: string, suffix?: string) => {
    const ta = textareaRef.current;
    if (!ta || !activeDoc) return;
    utilsInsertWrappedText(ta, prefix, suffix);
    updateDocContent({ content: ta.value });
  };

  /**
   * 插入标题
   */
  const insertHeadingFunc = (level: number) => {
    const ta = textareaRef.current;
    if (!ta || !activeDoc) return;
    utilsInsertHeading(ta, level);
    updateDocContent({ content: ta.value });
    setTimeout(() => ta.focus(), 0);
  };

  /**
   * 插入链接
   */
  const insertLinkFunc = () => {
    const ta = textareaRef.current;
    if (!ta || !activeDoc) return;
    utilsInsertLink(ta);
    updateDocContent({ content: ta.value });
  };

  /**
   * 插入图片
   */
  const insertImageFunc = async (file: File) => {
    if (!file || !activeDoc) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const data = (reader.result as string) || "";
      try {
        const saved = await window.notesApi.saveImage({ name: file.name, data });
        const src = saved || data;
        const ta = textareaRef.current;
        if (ta) {
          utilsInsertImage(ta, src);
          updateDocContent({ content: ta.value });
        }
      } catch (err) {
        // 如果上传失败，使用 base64 数据
        const ta = textareaRef.current;
        if (ta) {
          utilsInsertImage(ta, data);
          updateDocContent({ content: ta.value });
        }
      }
    };
    reader.readAsDataURL(file);
  };

  /**
   * 插入代码块
   */
  const insertCodeBlockFunc = () => {
    const ta = textareaRef.current;
    if (!ta || !activeDoc) return;
    utilsInsertCodeBlock(ta);
    updateDocContent({ content: ta.value });
  };

  /**
   * 插入引用
   */
  const insertQuote = () => {
    const ta = textareaRef.current;
    if (ta) {
      utilsInsertLinePrefix(ta, "> ");
      updateDocContent({ content: ta.value });
    }
  };

  /**
   * 插入下划线
   */
  const insertUnderline = () => {
    const ta = textareaRef.current;
    if (ta) {
      utilsInsertWrappedText(ta, "<u>", "</u>");
      updateDocContent({ content: ta.value });
    }
  };

  /**
   * 插入无序列表
   */
  const insertUnorderedList = () => {
    const ta = textareaRef.current;
    if (ta) {
      utilsInsertLinePrefix(ta, "- ");
      updateDocContent({ content: ta.value });
    }
  };

  /**
   * 插入有序列表
   */
  const insertOrderedList = () => {
    const ta = textareaRef.current;
    if (ta) {
      utilsInsertLinePrefix(ta, "1. ");
      updateDocContent({ content: ta.value });
    }
  };

  /**
   * 更新文档内容（带历史记录）
   */
  const updateDocContent = (changes: Partial<NoteDoc>) => {
    if (!activeNotebook || !activeDoc) return;
    // 只有内容、标题或标签变化时才记录历史
    if (typeof changes.content !== 'undefined' || typeof changes.title !== 'undefined' || typeof changes.tags !== 'undefined') {
      const now = Date.now();
      const last = lastHistoryAtRef.current;
      const prevSnapshot: DocSnapshot = {
        title: activeDoc.title ?? "",
        content: activeDoc.content ?? "",
        tags: activeDoc.tags ?? [],
        time: now,
      };
      // 超过合并窗口时间才记录新快照
      if (now - last > mergeWindow) {
        setPastSnapshots((p) => {
          const next = [...p, prevSnapshot];
          if (next.length > historyLimit) return next.slice(next.length - historyLimit);
          return next;
        });
        setFutureSnapshots([]);
        lastHistoryAtRef.current = now;
      } else {
        lastHistoryAtRef.current = now;
      }
    }
    updateDoc(activeNotebook.id, activeDoc.id, changes);
  };

  const handleGenerateShareLink = (permission: string, password: string, expiresAt: string | null) => {
    if (!activeNotebookId || !activeDocId) return;
    generateShareLink(activeNotebookId, activeDocId, permission as 'view' | 'comment' | 'edit' | 'manage', password, expiresAt);
  };

  const handleDeleteShareLink = (linkId: string) => {
    if (!activeNotebookId || !activeDocId) return;
    deleteShareLink(activeNotebookId, activeDocId, linkId);
  };

  const handleCopyShareUrl = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  return (
    <>
      {isLoading ? (
        <div className="app-loading">
          <Loading type="spinner" size="large" text="正在加载笔记..." />
        </div>
      ) : (
        <div className="app-shell">
          <aside className="main-sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-icon">📝</span>
            <span className="brand-text">笔记</span>
          </div>
          <div className="sidebar-search-wrapper">
            <div className="sidebar-search">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                placeholder="搜索"
                value={searchText}
                onChange={(event) => debouncedSetSearchText(event.target.value)}
                onClick={() => setShowSearchPanel(true)}
              />
              <span className="search-shortcut">Ctrl+K</span>
            </div>
            <button 
              className="search-add-btn"
              onClick={() => activeNotebook && createDoc(activeNotebook.id, null)}
              title="新建文档"
            >
              +
            </button>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeLeftMenu === "start" ? "active" : ""}`}
            onClick={() => setActiveLeftMenu("start")}
          >
            <span className="nav-icon">🏠</span>
            <span className="nav-text">开始</span>
          </button>
          <button
            className={`nav-item ${activeLeftMenu === "note" ? "active" : ""}`}
            onClick={() => setActiveLeftMenu("note")}
          >
            <span className="nav-icon">📝</span>
            <span className="nav-text">小记</span>
          </button>
          <button
            className={`nav-item ${activeLeftMenu === "favorite" ? "active" : ""}`}
            onClick={() => {
              setActiveLeftMenu("favorite");
              setActiveView("favorite");
            }}
          >
            <span className="nav-icon">⭐</span>
            <span className="nav-text">收藏</span>
          </button>
          <button
            className={`nav-item ${activeLeftMenu === "tags" ? "active" : ""}`}
            onClick={() => {
              setActiveLeftMenu("tags");
              setShowTagPanel(true);
            }}
          >
            <span className="nav-icon">🏷️</span>
            <span className="nav-text">标签</span>
            {tags.length > 0 && (
              <span className="nav-badge">{tags.length}</span>
            )}
          </button>
        </nav>
        
        <div className="sidebar-section">
          <button
            className="section-header"
            onClick={() => setNotebooksExpanded(!notebooksExpanded)}
          >
            <span className="section-expand-icon">{notebooksExpanded ? "▼" : "▶"}</span>
            <span className="section-title">知识库</span>
            <button
              className="btn-add-notebook"
              onClick={(e) => {
                e.stopPropagation();
                createNotebook("新建知识库");
              }}
              title="新建知识库"
            >
              +
            </button>
          </button>
          {notebooksExpanded && (
            <div className="notebooks-list">
              {notebooks.map((notebook) => (
                <button
                  key={notebook.id}
                  className={`notebook-item ${activeNotebookId === notebook.id ? "active" : ""}`}
                  onClick={() => {
                    setActiveLeftMenu("notebooks");
                    setActiveView("notebooks");
                    setActiveNotebookId(notebook.id);
                    setActiveDocId(notebook.docs[0]?.id ?? "");
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setNotebookContextMenu({ x: e.clientX, y: e.clientY, notebookId: notebook.id });
                  }}
                >
                  <span className="notebook-icon">📁</span>
                  <span className="notebook-name">{notebook.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="sidebar-footer">
          <div className="more-menu-container">
            <button 
              className="footer-item"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
            >
              <span className="footer-icon">⋯</span>
              <span className="footer-text">更多</span>
            </button>
            {showMoreMenu && (
              <div className="more-menu">
                <div className="more-menu-section">
                  <button 
                    className={`more-menu-item ${activeView === "trash" ? "active" : ""}`}
                    onClick={() => {
                      setActiveView("trash");
                      setShowMoreMenu(false);
                    }}
                  >
                    <span className="more-menu-icon">🗑️</span>
                    <span className="more-menu-text">回收站</span>
                    {trash.length > 0 && (
                      <span className="more-menu-badge">{trash.length}</span>
                    )}
                  </button>
                </div>
                <div className="more-menu-section">
                  <button className="more-menu-item">
                    <span className="more-menu-icon">📤</span>
                    <span className="more-menu-text">导入文档</span>
                  </button>
                  <button className="more-menu-item">
                    <span className="more-menu-icon">📥</span>
                    <span className="more-menu-text">导出全部</span>
                  </button>
                </div>
                <div className="more-menu-section">
                  <button className="more-menu-item">
                    <span className="more-menu-icon">🔧</span>
                    <span className="more-menu-text">设置</span>
                  </button>
                  <button className="more-menu-item">
                    <span className="more-menu-icon">💡</span>
                    <span className="more-menu-text">帮助中心</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {activeLeftMenu === "start" ? (
        <main className="start-panel">
          <LazyLoader>
            <StartPage
              notebooks={notebooks}
              recentViews={recentViews}
              onViewDoc={handleViewDoc}
              onCreateDoc={createDoc}
              onCreateNotebook={createNotebook}
            />
          </LazyLoader>
        </main>
      ) : activeLeftMenu === "note" ? (
        <main className="editor-panel">
          <div className="empty-editor">
            <div className="empty-icon">📝</div>
            <div className="empty-text">小记功能开发中</div>
          </div>
        </main>
      ) : activeLeftMenu === "favorite" ? (
        <>
          <aside className="docs-sidebar">
            <div className="docs-header">
              <div className="docs-title-row">
                <span className="docs-icon">⭐</span>
                <span className="docs-title">收藏</span>
              </div>
            </div>
            <div className="docs-list">
              {favoriteDocs.length === 0 ? (
                <div className="empty-favorite">
                  <span className="empty-icon">⭐</span>
                  <span className="empty-text">暂无收藏</span>
                  <span className="empty-hint">点击文档上的星标进行收藏</span>
                </div>
              ) : (
                <>
                  <div className="favorite-list-header">
                    <span className="favorite-col-name">名称</span>
                    <span className="favorite-col-belong">归属</span>
                    <span className="favorite-col-time">更新时间</span>
                  </div>
                  {favoriteDocs.map(({ notebook, doc }) => (
                    <div
                      key={doc.id}
                      className={`favorite-item ${activeDocId === doc.id ? "active" : ""}`}
                      onClick={() => handleViewDoc(notebook.id, doc.id)}
                    >
                      <span className="favorite-item-name">{doc.title}</span>
                      <span className="favorite-item-belong">{notebook.title}</span>
                      <span className="favorite-item-time">
                        {new Date(doc.updatedAt).toLocaleString('zh-CN')}
                      </span>
                      <button
                        className="favorite-item-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(notebook.id, doc.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </aside>
          <main className="editor-panel">
            {activeDoc && (
              <>
                <EditorHeader
                  activeDoc={activeDoc}
                  activeNotebookId={activeNotebookId}
                  activeDocId={activeDocId}
                  saveStatus={saveStatus}
                  fontSize={fontSize}
                  showPresentationMenu={showPresentationMenu}
                  updateDocContent={updateDocContent}
                  toggleFavorite={toggleFavorite}
                  handleCopyLink={handleCopyLink}
                  handleOpenInNewWindow={handleOpenInNewWindow}
                  setShowSharePanel={setShowSharePanel}
                  setShowPresentationMenu={setShowPresentationMenu}
                  setFontSize={setFontSize}
                  showMoreOptions={showMoreOptions}
                  setShowMoreOptions={setShowMoreOptions}
                  insertWrap={insertWrap}
                  insertUnderline={insertUnderline}
                  insertHeadingFunc={insertHeadingFunc}
                  insertUnorderedList={insertUnorderedList}
                  insertOrderedList={insertOrderedList}
                  insertQuote={insertQuote}
                  insertCodeBlockFunc={insertCodeBlockFunc}
                  insertLinkFunc={insertLinkFunc}
                  insertImageFunc={insertImageFunc}
                  undo={undo}
                  redo={redo}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  handleStartPresentation={handleStartPresentation}
                  handleEditPresentation={handleEditPresentation}
                  setTagsUpdated={setTagsUpdated}
                />
                <EditorContent
                  activeDoc={activeDoc}
                  fontSize={fontSize}
                  updateDocContent={updateDocContent}
                  handlePaste={handlePaste}
                  activeView={activeView}
                />
              </>
            )}
          </main>
        </>
      ) : (
        <>
          <aside className="docs-sidebar">
            <div className="docs-header">
              <div className="docs-title-row">
                <span className="docs-icon">📁</span>
                <span className="docs-title">{activeNotebook?.title || "知识库"}</span>
                <button
                  className="btn-add-doc"
                  onClick={() => activeNotebook && createDoc(activeNotebook.id, null)}
                  title="新建文档"
                >
                  +
                </button>
              </div>
            </div>
            
            <div className="docs-search">
              <input
                className="search-input"
                placeholder="搜索文档"
                value={searchText}
                onChange={(event) => debouncedSetSearchText(event.target.value)}
              />
            </div>
            
            <div className="docs-nav">
              <button
                className={`docs-nav-item ${activeView === "notebooks" ? "active" : ""}`}
                onClick={() => setActiveView("notebooks")}
              >
                <span className="docs-nav-icon">📄</span>
                <span className="docs-nav-text">全部文档</span>
                <span className="docs-nav-count">{activeNotebook?.docs.length || 0}</span>
              </button>
              <button
                className={`docs-nav-item ${activeView === "favorite" ? "active" : ""}`}
                onClick={() => setActiveView("favorite")}
              >
                <span className="docs-nav-icon">⭐</span>
                <span className="docs-nav-text">收藏</span>
                <span className="docs-nav-count">{favoriteDocs.length}</span>
              </button>
            </div>
            
            <div className="docs-list">
              {activeView === "favorite" ? (
                favoriteDocs.length === 0 ? (
                  <div className="empty-favorite">
                    <span className="empty-icon">⭐</span>
                    <span className="empty-text">暂无收藏</span>
                  </div>
                ) : (
                  favoriteDocs.map(({ notebook, doc }) => (
                    <button
                      key={doc.id}
                      className={`doc-item ${activeDocId === doc.id ? "active" : ""}`}
                      onClick={() => handleViewDoc(notebook.id, doc.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, docId: doc.id });
                      }}
                    >
                      <span className="doc-icon">📄</span>
                      <span className="doc-name">{doc.title}</span>
                      <span className="doc-favorite">⭐</span>
                    </button>
                  ))
                )
              ) : (
                searchResultDocs.map((doc) => (
                  <button
                    key={doc.id}
                    className={`doc-item ${activeDocId === doc.id ? "active" : ""}`}
                    onClick={() => handleViewDoc(activeNotebookId, doc.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, docId: doc.id });
                    }}
                    style={{ paddingLeft: `${(docDepthMap.get(doc.id) ?? 0) * 16 + 16}px` }}
                  >
                    <span className="doc-icon">{doc.pinned ? "📌" : "📄"}</span>
                    <span className="doc-name">{doc.title}</span>
                    {doc.favorite && <span className="doc-favorite">⭐</span>}
                  </button>
                ))
              )}
            </div>
          </aside>
          
          <main className="editor-panel">
            {activeView === "trash" ? (
              <div className="trash-view">
                <div className="docs-header">
                  <button className="btn-back" onClick={() => setActiveView("notebooks")}>
                    ←返回
                  </button>
                  <span className="docs-title">回收站</span>
                  <button className="btn-clear-trash" onClick={() => clearTrash()} disabled={trash.length === 0}>
                    清空回收站
                  </button>
                </div>
                <div className="docs-list">
                  {trash.length === 0 ? (
                    <div className="empty-trash">
                      <span className="empty-icon">🗑️</span>
                      <span className="empty-text">回收站为空</span>
                    </div>
                  ) : (
                    trash.map((doc) => (
                      <div key={doc.id} className="trash-item">
                        <button
                          className="trash-item-content"
                          onClick={() => {
                            handleViewDoc(doc.notebookId, doc.id);
                          }}
                        >
                          <span className="trash-item-icon">📄</span>
                          <span className="trash-item-title">{doc.title}</span>
                        </button>
                        <div className="trash-item-meta">
                          <span className="trash-item-notebook">{doc.notebookTitle}</span>
                        </div>
                        <div className="trash-item-actions">
                          <button className="trash-action-btn restore" onClick={() => restoreFromTrash(doc.id)}>
                            ↩
                          </button>
                          <button className="trash-action-btn delete" onClick={() => deleteFromTrash(doc.id)}>
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <>
                <EditorHeader
                  activeDoc={activeDoc}
                  activeNotebookId={activeNotebookId}
                  activeDocId={activeDocId}
                  saveStatus={saveStatus}
                  fontSize={fontSize}
                  showPresentationMenu={showPresentationMenu}
                  updateDocContent={updateDocContent}
                  toggleFavorite={toggleFavorite}
                  handleCopyLink={handleCopyLink}
                  handleOpenInNewWindow={handleOpenInNewWindow}
                  setShowSharePanel={setShowSharePanel}
                  setShowPresentationMenu={setShowPresentationMenu}
                  setFontSize={setFontSize}
                  showMoreOptions={showMoreOptions}
                  setShowMoreOptions={setShowMoreOptions}
                  insertWrap={insertWrap}
                  insertUnderline={insertUnderline}
                  insertHeadingFunc={insertHeadingFunc}
                  insertUnorderedList={insertUnorderedList}
                  insertOrderedList={insertOrderedList}
                  insertQuote={insertQuote}
                  insertCodeBlockFunc={insertCodeBlockFunc}
                  insertLinkFunc={insertLinkFunc}
                  insertImageFunc={insertImageFunc}
                  undo={undo}
                  redo={redo}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  handleStartPresentation={handleStartPresentation}
                  handleEditPresentation={handleEditPresentation}
                  setTagsUpdated={setTagsUpdated}
                />
                <div className="editor-content">
                  {activeDoc ? (
                    <div className="editor-body">
                      {activeView === "trash" ? (
                        <div className="trash-document-view">
                          <div className="trash-doc-title">{activeDoc.title}</div>
                          <div className="trash-doc-content">{activeDoc.content || "该文档没有内容"}</div>
                        </div>
                      ) : (
                        <textarea
                          ref={textareaRef}
                          className="editor-textarea"
                          value={activeDoc?.content || ""}
                          onChange={(e) => {
                            if (activeDoc) {
                              updateDocContent({ content: e.target.value });
                            }
                          }}
                          onPaste={handlePaste}
                          placeholder="开始编写你的文章..."
                          spellCheck={false}
                          style={{ fontSize: fontSize }}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="empty-editor">
                      <div className="empty-icon">📄</div>
                      <div className="empty-text">选择文档开始编辑</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </main>
        </>
      )}

      {contextMenu && (
        <div 
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className="context-menu-item" onClick={() => handleRename(contextMenu.docId)}>
            <span className="context-menu-icon">✏️</span>
            <span className="context-menu-text">重命名</span>
          </button>
          <button className="context-menu-item" onClick={() => handleCopyLink(contextMenu.docId)}>
            <span className="context-menu-icon">🔗</span>
            <span className="context-menu-text">复制链接</span>
          </button>
          <button className="context-menu-item" onClick={() => handleOpenInNewWindow(contextMenu.docId)}>
            <span className="context-menu-icon">↗</span>
            <span className="context-menu-text">在新窗口打开</span>
          </button>
          <button className="context-menu-item" onClick={() => handleRemoveFromDirectory(contextMenu.docId)}>
            <span className="context-menu-icon">📤</span>
            <span className="context-menu-text">移出目录</span>
          </button>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={() => handleCopy(contextMenu.docId)}>
            <span className="context-menu-icon">📋</span>
            <span className="context-menu-text">复制...</span>
          </button>
          <button className="context-menu-item" onClick={() => handleMove(contextMenu.docId)}>
            <span className="context-menu-icon">📦</span>
            <span className="context-menu-text">移动...</span>
          </button>
          <button className="context-menu-item" onClick={() => handleExport(contextMenu.docId)}>
            <span className="context-menu-icon">📥</span>
            <span className="context-menu-text">导出...</span>
          </button>
          <button className="context-menu-item" onClick={() => handlePin(contextMenu.docId)}>
            <span className="context-menu-icon">📌</span>
            <span className="context-menu-text">置顶文档</span>
          </button>
          <div className="context-menu-divider" />
          <button className="context-menu-item danger" onClick={() => handleDelete(contextMenu.docId)}>
            <span className="context-menu-icon">🗑️</span>
            <span className="context-menu-text">删除</span>
          </button>
        </div>
      )}

      {notebookContextMenu && (
        <div 
          className="context-menu"
          style={{ left: notebookContextMenu.x, top: notebookContextMenu.y }}
        >
          <button className="context-menu-item" onClick={() => handleRemoveNotebookFromFavorites(notebookContextMenu.notebookId)}>
            <span className="context-menu-icon">↗</span>
            <span className="context-menu-text">移出常用</span>
          </button>
          <button className="context-menu-item" onClick={() => handleSetNotebookOfflineAvailable(notebookContextMenu.notebookId)}>
            <span className="context-menu-icon">📥</span>
            <span className="context-menu-text">设为离线可用</span>
          </button>
          <button className="context-menu-item" onClick={() => handleNotebookPermissions(notebookContextMenu.notebookId)}>
            <span className="context-menu-icon">🔒</span>
            <span className="context-menu-text">权限</span>
          </button>
          <button className="context-menu-item" onClick={() => handleNotebookMoreSettings(notebookContextMenu.notebookId)}>
            <span className="context-menu-icon">⚙️</span>
            <span className="context-menu-text">更多设置</span>
          </button>
          <div className="context-menu-divider" />
          <button className="context-menu-item danger" onClick={() => handleDeleteNotebook(notebookContextMenu.notebookId)}>
            <span className="context-menu-icon">🗑️</span>
            <span className="context-menu-text">删除</span>
          </button>
        </div>
      )}

      <LazyLoader>
        <SharePanel
          isOpen={showSharePanel}
          onClose={() => setShowSharePanel(false)}
          docTitle={activeDoc?.title || "未命名文档"}
          docId={activeDocId}
          notebookId={activeNotebookId}
          shareLinks={activeDoc?.shareLinks || []}
          onGenerateLink={handleGenerateShareLink}
          onDeleteLink={handleDeleteShareLink}
          onCopyLink={handleCopyShareUrl}
        />
      </LazyLoader>

      <LazyLoader>
        <TagPanel
          isOpen={showTagPanel}
          onClose={() => setShowTagPanel(false)}
        />
      </LazyLoader>

      <LazyLoader>
        <SearchPanel
          isOpen={showSearchPanel}
          onClose={() => setShowSearchPanel(false)}
        />
      </LazyLoader>

      {showVersionHistory && (
        <LazyLoader>
          <VersionHistoryPanel
            notebookId={activeNotebookId}
            docId={activeDocId}
            onClose={() => setShowVersionHistory(false)}
          />
        </LazyLoader>
      )}

      {showRecoveryDialog && recoveryDraftMeta && (
        <div className="recovery-overlay" onClick={() => setShowRecoveryDialog(false)}>
          <div className="recovery-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="recovery-header">
              <span className="recovery-icon">⚠️</span>
              <span className="recovery-title">发现本地草稿</span>
            </div>
            <div className="recovery-body">
              <p>检测到有未保存的编辑内容，可能是上次异常退出导致的。</p>
              <div className="recovery-draft-info">
                <div className="recovery-draft-row">
                  <span className="recovery-label">草稿时间</span>
                  <span className="recovery-value">{new Date(recoveryDraftMeta.timestamp).toLocaleString('zh-CN')}</span>
                </div>
                {recoveryDraftMeta.docTitle && (
                  <div className="recovery-draft-row">
                    <span className="recovery-label">编辑文档</span>
                    <span className="recovery-value">{recoveryDraftMeta.docTitle}</span>
                  </div>
                )}
              </div>
              <p className="recovery-hint">恢复草稿将覆盖当前数据，放弃则永久删除本地草稿。</p>
            </div>
            <div className="recovery-actions">
              <button className="recovery-btn discard" onClick={handleDiscardDraft}>
                放弃草稿
              </button>
              <button className="recovery-btn recover" onClick={handleRecoverDraft}>
                恢复草稿
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
      )}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </>
  );
}

export default App;