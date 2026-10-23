import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNotesStore } from '@/store';
import { VirtualScroll } from '@/components/VirtualScroll';
import { EmptyState } from '@/components/common/EmptyState';
import { IconDocument } from '@/components/common/Icon';
import { useDocTreeDrag } from '@/hooks/useDocTreeDrag';
import { confirmAction } from '@/hooks/useConfirmAction';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { ContextMenu } from '@/components/common/ContextMenu';
import { setPendingBatchUndo, undoBatch } from '@/utils/batchUndo';
import { DocTreeNode } from './DocTreeNode';
import { filterAndSortDocs, type DocSortMode } from '@/utils/docSort';
import { readExpandedDocs, writeExpandedDocs } from '@/utils/docExpanded';
import { debounce } from '@/utils/debounce';
import { exportNotebookZip } from '@/services/storage';
import { toast, toastWithUndo } from '@/components/common/Toast';
import type { NoteDoc, Notebook } from '@/types';

interface DocTreeProps {
  activeNotebook: Notebook | null;
  searchText: string;
  onViewDoc: (notebookId: string, docId: string) => void;
  /** 请求父级打开"移动到其他知识库"对话框（单个） */
  onMoveRequest: (docId: string) => void;
  /** 批量移动：复用同一个对话框（T3） */
  onBatchMoveRequest?: (docIds: string[]) => void;
  /** 排序策略（T2）：由父级持有并持久化 */
  sortMode: DocSortMode;
  /** 标签过滤（K2）：空数组表示不过滤 */
  tagFilter?: string[];
}

const DOC_VIRTUALIZE_THRESHOLD = 200;
const DOC_ITEM_HEIGHT = 40;

/** 知识库文档树：层级展示、搜索过滤、排序、拖拽、右键菜单、批量操作、键盘导航、虚拟化 */
export const DocTree: React.FC<DocTreeProps> = ({
  activeNotebook,
  searchText,
  onViewDoc,
  onMoveRequest,
  onBatchMoveRequest,
  sortMode,
  tagFilter = [],
}) => {
  const {
    activeDocId,
    setActiveDocId,
    updateDoc,
    toggleFavorite,
    togglePin,
    moveDocToTrash,
    reorderDocs,
    moveDocRelativeTo,
    addTagToDoc,
    removeTagFromDoc,
    restoreFromTrash,
    availableTags,
  } = useNotesStore(useShallow((s) => ({
    activeDocId: s.activeDocId,
    setActiveDocId: s.setActiveDocId,
    updateDoc: s.updateDoc,
    toggleFavorite: s.toggleFavorite,
    togglePin: s.togglePin,
    moveDocToTrash: s.moveDocToTrash,
    reorderDocs: s.reorderDocs,
    moveDocRelativeTo: s.moveDocRelativeTo,
    // T3 批量打标签（撤销时需要摘标签）
    addTagToDoc: s.addTagToDoc,
    removeTagFromDoc: s.removeTagFromDoc,
    // 批量删除的撤销：把文档从回收站恢复回来
    restoreFromTrash: s.restoreFromTrash,
    availableTags: s.tags,
  })));

  const activeNotebookId = activeNotebook?.id ?? null;

  // 展开态持久化（对齐语雀）：刷新/重启后保持上次展开的节点。
  // 惰性初始化只读一次 localStorage，避免每次渲染都同步解析 JSON
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(() => readExpandedDocs());

  /**
   * 展开态变化后写回 localStorage（防抖）：连续展开多个节点时只写一次。
   * 用 debounce 而不是每次 setState 都写：展开/收起是高频交互，
   * 同步 JSON.stringify 会在长列表上造成可感知的卡顿。
   *
   * 已删除文档的残留 id 在**写入时**裁剪（见 writeExpandedDocs 的 aliveIds 参数），
   * 而不是用 effect 去 setState —— 后者会触发级联渲染，也被
   * react-hooks/set-state-in-effect 规则拦下。
   */
  const persistExpanded = useMemo(
    () =>
      debounce((ids: Set<string>, aliveIds: Set<string>) => writeExpandedDocs(ids, aliveIds), 400),
    [],
  );

  /** 当前知识库中仍存在的文档 id：作为写入时的裁剪依据 */
  const aliveDocIds = useMemo(
    () => new Set((activeNotebook?.docs ?? []).map((d) => d.id)),
    [activeNotebook],
  );

  useEffect(() => {
    persistExpanded(expandedDocs, aliveDocIds);
  }, [expandedDocs, aliveDocIds, persistExpanded]);

  // 卸载时把挂起的写入立即落盘，否则防抖窗口内关闭页面会丢失最后一次展开
  useEffect(() => {
    const pending = persistExpanded;
    return () => pending.flush();
  }, [persistExpanded]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; docId: string } | null>(null);
  // 重命名编辑状态提升到树层级：右键菜单"重命名"通过它驱动对应节点进入行内编辑
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const docsListRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(480);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  /** 键盘导航的"当前项"（roving）：整棵树是一个 tab 停靠点，方向键在其中移动 */
  const [focusedDocId, setFocusedDocId] = useState<string | null>(null);
  // 批量导出是长操作：统一挂"进行中"反馈
  const { run: runAsync } = useAsyncAction();

  // 使用拖拽 hook
  const {
    dragOverDocId,
    dragOverPosition,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useDocTreeDrag({
    activeNotebook,
    activeNotebookId,
    updateDoc,
    reorderDocs,
    onExpandDoc: (docId) => setExpandedDocs(prev => new Set([...prev, docId])),
  });

  useEffect(() => {
    const el = docsListRef.current;
    if (!el) return;
    const update = (): void => setListHeight(el.clientHeight || 480);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggleExpand = useCallback((docId: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }, []);

  const handleDocClick = useCallback((docId: string) => {
    setActiveDocId(docId);
    // 点击也更新键盘焦点，保证"点一下再用方向键"从这一项继续
    setFocusedDocId(docId);
    if (activeNotebookId) onViewDoc(activeNotebookId, docId);
  }, [activeNotebookId, setActiveDocId, onViewDoc]);

  // 保存标题（由节点行内编辑完成时回调）
  const handleSaveTitle = useCallback((doc: NoteDoc) => {
    if (!activeNotebookId) return;
    updateDoc(activeNotebookId, doc.id, { title: doc.title });
  }, [activeNotebookId, updateDoc]);

  const startRename = useCallback((docId: string) => {
    setEditingDocId(docId);
    setContextMenu(null);
  }, []);

  const endRename = useCallback(() => {
    setEditingDocId(null);
  }, []);

  const handleDelete = useCallback((docId: string) => {
    if (!activeNotebookId) return;
    moveDocToTrash(activeNotebookId, docId);
    setContextMenu(null);
  }, [activeNotebookId, moveDocToTrash]);

  const handleMove = useCallback((docId: string) => {
    onMoveRequest(docId);
    setContextMenu(null);
  }, [onMoveRequest]);

  const handleToggleFavorite = useCallback((docId: string) => {
    if (!activeNotebookId) return;
    toggleFavorite(activeNotebookId, docId);
    setContextMenu(null);
  }, [activeNotebookId, toggleFavorite]);

  const handleTogglePin = useCallback((docId: string) => {
    if (!activeNotebookId) return;
    togglePin(activeNotebookId, docId);
    setContextMenu(null);
  }, [activeNotebookId, togglePin]);

  // 批量操作处理
  const toggleDocSelection = useCallback((docId: string) => {
    setSelectedDocs(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  }, []);

  /** 批量打标签（T3）：把选中的文档一次性挂上同一个标签 */
  const batchAddTag = useCallback((tagId: string) => {
    if (!activeNotebookId || !tagId) return;
    const ids = [...selectedDocs];
    // 记录"之前没挂这个标签"的文档，撤销时逐个摘掉 —— 已经挂过的不能被撤销误删
    const newlyTagged = ids.filter((docId) => {
      const doc = activeNotebook?.docs.find((d) => d.id === docId);
      return doc ? !doc.tags.includes(tagId) : false;
    });
    ids.forEach((docId) => addTagToDoc(activeNotebookId, docId, tagId));
    setSelectedDocs(new Set());

    if (newlyTagged.length > 0) {
      const batchId = setPendingBatchUndo('批量打标签', () => {
        newlyTagged.forEach((docId) => removeTagFromDoc(activeNotebookId, docId, tagId));
      });
      toastWithUndo(`已为 ${ids.length} 篇文档添加标签`, () => {
        if (undoBatch(batchId)) toast.info('已撤销打标签');
        else toast.warning('撤销已过期');
      });
    } else {
      toast.success('已为 ' + ids.length + ' 篇文档添加标签');
    }
  }, [activeNotebookId, activeNotebook, addTagToDoc, removeTagFromDoc, selectedDocs]);

  /** 批量导出（T3）：选中的文档打成一个 zip（每篇一个 .md） */
  const batchExportDocs = useCallback(() => {
    if (!activeNotebook || selectedDocs.size === 0) return;
    const docs = activeNotebook.docs.filter((doc) => selectedDocs.has(doc.id));
    void runAsync(async () => {
      const ok = await exportNotebookZip({
        title: activeNotebook.title + '-选中文档',
        docs,
      });
      if (ok) toast.success('已导出 ' + docs.length + ' 篇文档');
    }, { pendingMsg: '正在导出选中文档…', errorMsg: '导出选中文档失败' });
  }, [activeNotebook, selectedDocs, runAsync]);

  const batchDeleteDocs = useCallback(() => {
    if (!activeNotebookId || selectedDocs.size === 0) return;
    // 与单个删除/清空回收站保持一致的确认交互，避免误操作（走 App 层挂载的唯一 ConfirmDialog）
    confirmAction({
      title: '批量删除',
      message: `确定要将选中的 ${selectedDocs.size} 个文档移入回收站吗？`,
      confirmText: '移入回收站',
      variant: 'danger',
      onConfirm: () => {
        const ids = [...selectedDocs];
        ids.forEach(docId => {
          moveDocToTrash(activeNotebookId, docId);
        });
        setSelectedDocs(new Set());

        // 删除进的是回收站，撤销＝把它们恢复回来（比"永久删除"安全得多）
        const batchId = setPendingBatchUndo('批量删除', () => {
          ids.forEach((docId) => restoreFromTrash(docId));
        });
        toastWithUndo(`已将 ${ids.length} 个文档移入回收站`, () => {
          if (undoBatch(batchId)) toast.info('已从回收站恢复');
          else toast.warning('撤销已过期，请到回收站恢复');
        });
      },
    });
  }, [activeNotebookId, selectedDocs, moveDocToTrash, restoreFromTrash]);

  /** 批量收藏 / 批量置顶：多选下逐个套用 */
  const batchToggleFavorite = useCallback(() => {
    if (!activeNotebookId || selectedDocs.size === 0) return;
    const ids = [...selectedDocs];
    ids.forEach((docId) => toggleFavorite(activeNotebookId, docId));
    setSelectedDocs(new Set());

    // 收藏是切换语义：撤销＝对同一批文档再切换一次，结果精确回到原状
    const batchId = setPendingBatchUndo('批量收藏', () => {
      ids.forEach((docId) => toggleFavorite(activeNotebookId, docId));
    });
    toastWithUndo(`已更新 ${ids.length} 篇文档的收藏状态`, () => {
      if (undoBatch(batchId)) toast.info('已撤销收藏变更');
      else toast.warning('撤销已过期');
    });
  }, [activeNotebookId, selectedDocs, toggleFavorite]);

  const batchTogglePin = useCallback(() => {
    if (!activeNotebookId || selectedDocs.size === 0) return;
    const ids = [...selectedDocs];
    ids.forEach((docId) => togglePin(activeNotebookId, docId));
    setSelectedDocs(new Set());

    const batchId = setPendingBatchUndo('批量置顶', () => {
      ids.forEach((docId) => togglePin(activeNotebookId, docId));
    });
    toastWithUndo(`已更新 ${ids.length} 篇文档的置顶状态`, () => {
      if (undoBatch(batchId)) toast.info('已撤销置顶变更');
      else toast.warning('撤销已过期');
    });
  }, [activeNotebookId, selectedDocs, togglePin]);

  const batchMoveDocs = useCallback(() => {
    if (selectedDocs.size === 0) return;
    onBatchMoveRequest?.(Array.from(selectedDocs));
    setSelectedDocs(new Set());
  }, [onBatchMoveRequest, selectedDocs]);

  /**
   * 同级上移 / 下移（A4）。
   * HTML5 拖放在触屏上根本不触发，所以顺序调整必须有一条不依赖拖拽的路径 ——
   * 这条路径同时也是键盘与读屏用户唯一能用的方式。
   */
  // 预建 parentId → children 索引：替代每次渲染对每个节点执行 O(n) 的 docs.filter，
  // 将树构建复杂度从 O(n²) 降为 O(n)
  const childrenMap = useMemo(() => {
    const map = new Map<string | null, NoteDoc[]>();
    if (!activeNotebook) return map;
    for (const doc of activeNotebook.docs) {
      const arr = map.get(doc.parentId);
      if (arr) arr.push(doc);
      else map.set(doc.parentId, [doc]);
    }
    return map;
  }, [activeNotebook]);

  /**
   * 当前视图里"某个父级下的同级文档"顺序（已应用搜索/标签过滤与排序模式）。
   * 上移/下移以它为准：用户点的是界面上看到的相邻关系。
   */
  const visibleSiblingsOf = useCallback((parentId: string | null): NoteDoc[] => {
    return filterAndSortDocs(childrenMap.get(parentId) ?? [], searchText, sortMode, tagFilter);
  }, [childrenMap, searchText, sortMode, tagFilter]);

  const moveDocByOffset = useCallback((docId: string, offset: number) => {
    if (!activeNotebookId || !activeNotebook) return;
    const doc = activeNotebook.docs.find((d) => d.id === docId);
    if (!doc) return;

    const parentId = doc.parentId ?? null;
    // 用"当前视图里看到的同级顺序"来找相邻项 —— 用户点的是界面上看到的上下关系，
    // 拿数据原始下标去换序会在开着搜索/标签过滤或按标题/时间排序时指错文档
    const siblings = visibleSiblingsOf(parentId);
    const index = siblings.findIndex((d) => d.id === docId);
    if (index < 0) return;

    const neighbour = siblings[index + offset];
    if (!neighbour) return;

    moveDocRelativeTo(activeNotebookId, docId, neighbour.id, offset > 0 ? 'after' : 'before');
    setContextMenu(null);
    setFocusedDocId(docId);
  }, [activeNotebook, activeNotebookId, moveDocRelativeTo, visibleSiblingsOf]);

  const handleContextMenu = useCallback((e: React.MouseEvent, docId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, docId });
  }, []);

  const flatDocList = useMemo(() => {
    const result: { doc: NoteDoc; depth: number }[] = [];
    const walk = (docs: NoteDoc[], depth: number): void => {
      const sorted = filterAndSortDocs(docs, searchText, sortMode, tagFilter);
      for (const doc of sorted) {
        result.push({ doc, depth });
        // 只在显式展开时下钻，否则子文档会同时出现在根层级和父级内部（重复渲染）
        if (expandedDocs.has(doc.id)) {
          const children = childrenMap.get(doc.id) ?? [];
          if (children.length > 0) walk(children, depth + 1);
        }
      }
    };
    // 顶层只遍历根文档（parentId === null），docs 是含子文档的扁平数组
    if (activeNotebook) walk(childrenMap.get(null) ?? [], 0);
    return result;
  }, [activeNotebook, searchText, expandedDocs, childrenMap, sortMode, tagFilter]);

  /**
   * docId → 在 flatDocList 中的下标。
   *
   * 键盘导航里有两处线性查找：`focusedIndex`（每次渲染）与
   * `ArrowLeft` 回父级时的 `flatDocList.findIndex`（每次按键）。深层嵌套下
   * 后者是 O(深度 × n)，按一次键就要扫好几遍整棵树。
   * 预建索引后两者都变成 O(1)。
   */
  const docIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    flatDocList.forEach((item, index) => map.set(item.doc.id, index))
    return map
  }, [flatDocList]);

  /** 键盘导航（T6）：↑↓ 移动、→← 展开/收起/进父级、Enter 打开、F2 重命名、空格展开 */
  const focusedIndex = useMemo(
    () => (focusedDocId ? docIndexMap.get(focusedDocId) ?? -1 : -1),
    [docIndexMap, focusedDocId],
  );

  const focusByIndex = useCallback((index: number) => {
    if (flatDocList.length === 0) return;
    const clamped = Math.max(0, Math.min(index, flatDocList.length - 1));
    const docId = flatDocList[clamped].doc.id;
    setFocusedDocId(docId);
    // 虚拟化列表与普通列表都支持 scrollIntoView
    docsListRef.current?.querySelector(`[data-doc-id="${docId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [flatDocList]);

  const handleTreeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (flatDocList.length === 0) return;
    const index = focusedIndex >= 0 ? focusedIndex : 0;
    const current = flatDocList[index]?.doc;
    const hasChildren = current ? (childrenMap.get(current.id) ?? []).length > 0 : false;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusByIndex(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusByIndex(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusByIndex(0);
        break;
      case 'End':
        e.preventDefault();
        focusByIndex(flatDocList.length - 1);
        break;
      case 'ArrowRight':
        if (!current) return;
        e.preventDefault();
        // 收起 → 展开；已展开 → 进入第一个子项（前序顺序里就是下一项）
        if (hasChildren && !expandedDocs.has(current.id)) toggleExpand(current.id);
        else if (hasChildren) focusByIndex(index + 1);
        break;
      case 'ArrowLeft': {
        if (!current) return;
        e.preventDefault();
        if (expandedDocs.has(current.id)) {
          toggleExpand(current.id);
          break;
        }
        const parentIndex = current.parentId
          ? docIndexMap.get(current.parentId) ?? -1
          : -1;
        if (parentIndex >= 0) focusByIndex(parentIndex);
        break;
      }
      case 'Enter':
        if (!current) return;
        e.preventDefault();
        handleDocClick(current.id);
        break;
      case 'F2':
        if (!current) return;
        e.preventDefault();
        startRename(current.id);
        break;
      case ' ':
        if (!current || !hasChildren) return;
        e.preventDefault();
        toggleExpand(current.id);
        break;
      default:
        break;
    }
  }, [childrenMap, docIndexMap, expandedDocs, flatDocList, focusByIndex, focusedIndex, handleDocClick, startRename, toggleExpand]);

  const selectAllDocs = useCallback(() => {
    if (selectedDocs.size === flatDocList.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(flatDocList.map(item => item.doc.id)));
    }
  }, [selectedDocs.size, flatDocList]);

  if (!activeNotebook) return null;

  const renderDocItem = (doc: NoteDoc, depth: number): React.JSX.Element => {
    // 箭头可见性只取决于"是否有子文档"，展开与否由 isExpanded 控制
    const hasChildren = (childrenMap.get(doc.id) ?? []).length > 0;
    // 还没用键盘操作过时，把当前打开的文档当作焦点，避免"按方向键没反应"
    const highlightId = focusedDocId ?? activeDocId;

    return (
      <DocTreeNode
        key={doc.id}
        doc={doc}
        depth={depth}
        isActive={activeDocId === doc.id}
        isFocused={highlightId === doc.id}
        isExpanded={expandedDocs.has(doc.id)}
        hasChildren={hasChildren}
        isEditingTitle={editingDocId === doc.id}
        onTitleEditEnd={endRename}
        onStartRename={startRename}
        dragOverDocId={dragOverDocId}
        dragOverPosition={dragOverPosition}
        onDocClick={handleDocClick}
        onToggleExpand={toggleExpand}
        onSaveTitle={handleSaveTitle}
        onToggleFavorite={handleToggleFavorite}
        onTogglePin={handleTogglePin}
        onMove={handleMove}
        onDelete={handleDelete}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        isMultiSelectMode={isMultiSelectMode}
        isSelected={selectedDocs.has(doc.id)}
        onSelect={toggleDocSelection}
      />
    );
  };

  const renderDocTree = (docs: NoteDoc[], depth: number = 0): React.JSX.Element[] => {
    return filterAndSortDocs(docs, searchText, sortMode, tagFilter).map((doc) => {
      const children = childrenMap.get(doc.id) ?? [];
      const expanded = expandedDocs.has(doc.id);

      return (
        <React.Fragment key={doc.id}>
          {renderDocItem(doc, depth)}
          {expanded && children.length > 0 && renderDocTree(children, depth + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <>
      {/* 批量操作工具栏 */}
      <div className="batch-toolbar">
        <button
          className={`batch-toolbar-btn ${isMultiSelectMode ? 'active' : ''}`}
          onClick={() => {
            setIsMultiSelectMode(!isMultiSelectMode);
            if (isMultiSelectMode) {
              setSelectedDocs(new Set());
            }
          }}
        >
          {isMultiSelectMode ? '退出多选' : '多选'}
        </button>
        {isMultiSelectMode && (
          <>
            <button className="batch-toolbar-btn" onClick={selectAllDocs}>
              {selectedDocs.size === flatDocList.length ? '取消全选' : '全选'}
            </button>
            {selectedDocs.size > 0 && (
              <>
                <span className="batch-toolbar-info">已选 {selectedDocs.size} 项</span>
                <button className="batch-toolbar-btn" onClick={batchToggleFavorite}>
                  收藏
                </button>
                <button className="batch-toolbar-btn" onClick={batchTogglePin}>
                  置顶
                </button>
                <button className="batch-toolbar-btn" onClick={batchMoveDocs}>
                  移动到
                </button>
                {/* 打标签：没有标签时禁用（先建标签才有意义），避免点了没反应 */}
                <select
                  className="batch-toolbar-select"
                  value=""
                  disabled={availableTags.length === 0}
                  title={availableTags.length === 0 ? '还没有标签，请先在标签页里创建' : '为选中的文档添加标签'}
                  aria-label="为选中的文档添加标签"
                  onChange={(e) => {
                    batchAddTag(e.target.value);
                    e.target.value = '';
                  }}
                >
                  <option value="">打标签…</option>
                  {availableTags.map((tag: { id: string; name: string }) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
                <button className="batch-toolbar-btn" onClick={() => void batchExportDocs()}>
                  导出
                </button>
                <button className="batch-toolbar-btn danger" onClick={batchDeleteDocs}>
                  批量删除
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* 整棵树只有一个 tab 停靠点（roving tabindex）：焦点在容器上，用方向键在项之间移动 */}
      <div
        className="docs-list"
        ref={docsListRef}
        role="tree"
        tabIndex={0}
        aria-label={activeNotebook ? activeNotebook.title + ' 文档树' : '文档树'}
        onKeyDown={handleTreeKeyDown}
      >
        {activeNotebook.docs.length === 0 ? (
          <EmptyState
            icon={<IconDocument size={32} />}
            title="暂无文档"
            description="在这个知识库中创建你的第一篇文档"
            actions={[
              {
                label: '新建文档',
                icon: '➕',
                onClick: () => {
                  if (activeNotebookId) {
                    const docId = useNotesStore.getState().createDoc(activeNotebookId, null);
                    if (docId) onViewDoc(activeNotebookId, docId);
                  }
                },
                variant: 'primary',
              },
            ]}
          />
        ) : flatDocList.length > DOC_VIRTUALIZE_THRESHOLD ? (
          <VirtualScroll
            items={flatDocList}
            itemHeight={DOC_ITEM_HEIGHT}
            containerHeight={listHeight}
            renderItem={({ doc, depth }) => renderDocItem(doc, depth)}
            getKey={(item) => item.doc.id}
          />
        ) : (
          renderDocTree(childrenMap.get(null) ?? [])
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          ariaLabel="文档操作"
          onClose={() => setContextMenu(null)}
          items={[
            {
              id: 'rename',
              label: '重命名',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              ),
              onSelect: () => startRename(contextMenu.docId),
            },
            {
              id: 'favorite',
              label: activeNotebook?.docs.find(d => d.id === contextMenu.docId)?.favorite ? '取消收藏' : '收藏',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              ),
              onSelect: () => handleToggleFavorite(contextMenu.docId),
            },
            {
              id: 'pin',
              label: activeNotebook?.docs.find(d => d.id === contextMenu.docId)?.pinned ? '取消置顶' : '置顶',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 17v5" />
                  <path d="M9 10.5L6 14l3 1.5V17h6v-1.5l3-1.5-3-3.5" />
                  <path d="M9 10.5L5 6h14l-4 4.5" />
                </svg>
              ),
              onSelect: () => handleTogglePin(contextMenu.docId),
            },
            {
              id: 'move-up',
              label: '上移',
              icon: '↑',
              disabled: sortMode !== 'manual',
              title: sortMode === 'manual' ? '同级上移' : '切换到「手动排序」后可调整顺序',
              onSelect: () => moveDocByOffset(contextMenu.docId, -1),
            },
            {
              id: 'move-down',
              label: '下移',
              icon: '↓',
              disabled: sortMode !== 'manual',
              title: sortMode === 'manual' ? '同级下移' : '切换到「手动排序」后可调整顺序',
              onSelect: () => moveDocByOffset(contextMenu.docId, 1),
            },
            {
              id: 'move',
              label: '移动到',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              ),
              onSelect: () => handleMove(contextMenu.docId),
            },
            {
              id: 'delete',
              label: '删除',
              danger: true,
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2h4a2 2 0 0 1 2 2v2" />
                </svg>
              ),
              onSelect: () => handleDelete(contextMenu.docId),
            },
          ]}
        />
      )}
    </>
  );
};

export default DocTree;
