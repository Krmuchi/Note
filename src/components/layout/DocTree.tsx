import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNotesStore } from '@/store';
import { VirtualScroll, type VirtualScrollHandle } from '@/components/VirtualScroll';
import { EmptyState } from '@/components/common/EmptyState';
import { IconClose, IconDocument, IconPlus, IconSearch } from '@/components/common/Icon';
import { useDocTreeDrag } from '@/hooks/useDocTreeDrag';
import { confirmAction } from '@/hooks/useConfirmAction';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { ContextMenu } from '@/components/common/ContextMenu';
import { setPendingBatchUndo, undoBatch } from '@/utils/batchUndo';
import { DocTreeNode } from './DocTreeNode';
import {
  docMatchesFilters,
  filterAndSortDocs,
  sortDocs,
  type DocSortMode,
} from '@/utils/docSort';
import { readExpandedDocs, writeExpandedDocs, createAliveIdsDeriver } from '@/utils/docExpanded';
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
  /** P0-2：过滤无结果时「清除筛选」的出口（父级同时清空搜索词与标签） */
  onClearFilter?: () => void;
}

const DOC_VIRTUALIZE_THRESHOLD = 200;
const DOC_ITEM_HEIGHT = 40;

/** 往展开集合里补 id；无变化时返回原引用，避免渲染期 setState 造成额外一轮渲染 */
function withAddedExpanded(prev: Set<string>, ids: string[]): Set<string> {
  if (ids.length === 0) return prev;
  const next = new Set(prev);
  let changed = false;
  for (const id of ids) {
    if (!next.has(id)) {
      next.add(id);
      changed = true;
    }
  }
  return changed ? next : prev;
}

/** 知识库文档树：层级展示、搜索过滤、排序、拖拽、右键菜单、批量操作、键盘导航、虚拟化 */
export const DocTree: React.FC<DocTreeProps> = ({
  activeNotebook,
  searchText,
  onViewDoc,
  onMoveRequest,
  onBatchMoveRequest,
  sortMode,
  tagFilter = [],
  onClearFilter,
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

  /*
   * 当前知识库中仍存在的文档 id：作为写入时的裁剪依据。
   * 经 createAliveIdsDeriver 派生：id 集不变就复用同一个 Set 引用 ——
   * 击键/改标题会换 activeNotebook 引用但不动 id 集，persist 的 effect
   * 不该跟着每次修改重跑（重跑＝debounce 被反复重置 + JSON.stringify + 同步 setItem）。
   */
  const deriveAliveIds = useMemo(() => createAliveIdsDeriver(), []);
  const aliveDocIds = useMemo(
    () => deriveAliveIds(activeNotebook?.docs ?? []),
    [activeNotebook, deriveAliveIds],
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
  /** 虚拟化列表的命令式句柄：键盘导航按行下标滚动（目标项可能不在 DOM 里） */
  const virtualScrollRef = useRef<VirtualScrollHandle>(null);
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
    sortMode,
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
    // 重命名期间树焦点同步到该节点：右键菜单路径此前不更新 focusedDocId，
    // Enter 保存后树的 Enter 分支会把编辑器切到 focusedDocId ?? 第 0 行的另一篇文档
    setFocusedDocId(docId);
  }, []);

  const endRename = useCallback(() => {
    setEditingDocId(null);
  }, []);

  const handleDelete = useCallback((docId: string) => {
    if (!activeNotebookId) return;
    setContextMenu(null);
    // 与批量删除/清空回收站一致的确认交互：单删此前无确认、无反馈、无撤销，
    // hover 行点删除就直接消失，误触不可恢复（只能去回收站手动找）
    const doc = activeNotebook?.docs.find((d) => d.id === docId);
    confirmAction({
      title: '删除文档',
      message: `确定要将「${doc?.title || '未命名文档'}」移入回收站吗？可在回收站里恢复。`,
      confirmText: '移入回收站',
      variant: 'danger',
      onConfirm: () => {
        moveDocToTrash(activeNotebookId, docId);
        toastWithUndo('已将文档移入回收站', () => {
          restoreFromTrash(docId);
          toast.info('已从回收站恢复');
        });
      },
    });
  }, [activeNotebookId, activeNotebook, moveDocToTrash, restoreFromTrash]);

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
    /*
     * 树侧的 doc 是结构投影的快照，content 不保证新鲜（正文击键不进投影）——
     * 导出必须读 store 当前快照，否则导出的 .md 是旧内容。
     */
    const latest = useNotesStore.getState().notebooks.find((nb) => nb.id === activeNotebook.id);
    const docs = (latest?.docs ?? activeNotebook.docs).filter((doc) => selectedDocs.has(doc.id));
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
      // 标题具体化：确认框标题不能是「确认操作」这种看不出动了什么的占位词
      title: `删除 ${selectedDocs.size} 篇文档`,
      message: `确定要将选中的 ${selectedDocs.size} 篇文档移入回收站吗？可在回收站里恢复。`,
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

  /*
   * P0-2：全层级过滤。
   * 旧实现逐层 filterAndSortDocs —— 未命中的祖先在本层就被筛掉，
   * 折叠层（更别说未展开的深层）里的命中项永远走不到，界面上还一片空白看不出原因。
   * 现在先算「自身命中」，再向上补齐祖先；过滤期间无视展开态直接下钻到命中项。
   */
  const filterActive = searchText.trim().length > 0 || tagFilter.length > 0;

  const matchedIds = useMemo(() => {
    if (!filterActive || !activeNotebook) return null;
    const ids = new Set<string>();
    for (const doc of activeNotebook.docs) {
      if (docMatchesFilters(doc, searchText, tagFilter)) ids.add(doc.id);
    }
    return ids;
  }, [filterActive, activeNotebook, searchText, tagFilter]);

  /** 可见集合 = 自身命中项 ∪ 命中项的祖先（祖先是路径上下文，必须一起显示） */
  const visibleIds = useMemo(() => {
    if (!matchedIds || !activeNotebook) return matchedIds;
    const parentOf = new Map<string, string | null>();
    for (const doc of activeNotebook.docs) parentOf.set(doc.id, doc.parentId ?? null);
    const visible = new Set<string>(matchedIds);
    for (const id of matchedIds) {
      const guard = new Set<string>();
      let parentId = parentOf.get(id) ?? null;
      while (parentId && !guard.has(parentId)) {
        guard.add(parentId);
        visible.add(parentId);
        parentId = parentOf.get(parentId) ?? null;
      }
    }
    return visible;
  }, [matchedIds, activeNotebook]);

  /*
   * P0-2：命中项的祖先自动展开，并把展开状态记进 expandedDocs ——
   * 过滤期间本来就会无视展开态显示整条链；这里把状态同步下来，
   * 用户清掉筛选后看到的仍是刚才那棵树，而不是立刻合回去。
   * 渲染期按签名变化调整 state（DocsSidebar prevCompact 同款写法），
   * 签名不变就不会再触发 setState，无循环。
   */
  const expandSignature =
    filterActive && visibleIds && matchedIds
      ? [...visibleIds]
          .filter((id) => !matchedIds.has(id))
          .sort()
          .join(',')
      : '';
  const [expandedForFilter, setExpandedForFilter] = useState('');
  if (expandSignature !== expandedForFilter) {
    setExpandedForFilter(expandSignature);
    if (expandSignature) {
      setExpandedDocs((prev) => withAddedExpanded(prev, expandSignature.split(',')));
    }
  }

  /*
   * P2-14：打开文档后在树里把它找出来 —— 先展开祖先。
   * 只在 activeDocId 变化那一次执行：否则用户手动收起某个父级，
   * 下一帧又会被自动撑开（等于收不起）。滚动定位见下面的 effect。
   */
  const [expandedForDoc, setExpandedForDoc] = useState<string | null>(null);
  if (activeDocId && activeNotebook && expandedForDoc !== activeDocId) {
    setExpandedForDoc(activeDocId);
    const byId = new Map(activeNotebook.docs.map((d) => [d.id, d]));
    const missing: string[] = [];
    const guard = new Set<string>();
    let parentId = byId.get(activeDocId)?.parentId ?? null;
    while (parentId && !guard.has(parentId)) {
      guard.add(parentId);
      if (!expandedDocs.has(parentId)) missing.push(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    if (missing.length > 0) setExpandedDocs((prev) => withAddedExpanded(prev, missing));
  }
  const flatDocList = useMemo(() => {
    const result: { doc: NoteDoc; depth: number; contextPath: string; isContext: boolean }[] = [];
    const walk = (docs: NoteDoc[], depth: number, context: string[]): void => {
      // 过滤期间只排序不过滤：该留谁由 visibleIds 决定，
      // 否则未命中的祖先在这一层就被 filter 掉，它下面的命中项永远到不了
      const candidates = filterActive
        ? sortDocs(docs, sortMode)
        : filterAndSortDocs(docs, searchText, sortMode, tagFilter);
      for (const doc of candidates) {
        if (filterActive && !visibleIds!.has(doc.id)) continue;
        const selfMatch = !filterActive || matchedIds!.has(doc.id);
        const nextContext = selfMatch ? [] : [...context, doc.title];
        result.push({
          doc,
          depth,
          // 自身命中、但祖先没命中：把父路径写在标题前（否则深层文档在结果里没有落点）
          contextPath: selfMatch && context.length > 0 ? context.join(' › ') : '',
          isContext: !selfMatch,
        });
        const children = childrenMap.get(doc.id) ?? [];
        if (children.length === 0) continue;
        const descend = filterActive
          ? children.some((child) => visibleIds!.has(child.id))
          : expandedDocs.has(doc.id);
        if (descend) walk(children, depth + 1, nextContext);
      }
    };
    // 顶层只遍历根文档（parentId === null），docs 是含子文档的扁平数组
    if (activeNotebook) walk(childrenMap.get(null) ?? [], 0, []);
    return result;
  }, [
    activeNotebook,
    searchText,
    expandedDocs,
    childrenMap,
    sortMode,
    tagFilter,
    filterActive,
    matchedIds,
    visibleIds,
  ]);

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

  /*
   * P2-14：把当前文档滚进可视区。
   * 拆开两个动作的原因：祖先展开要先落地，flatDocList 才会包含目标行；
   * 这里按 docIndexMap 变化重试，找到一次就记账（scrolledDocRef），
   * 之后输入过滤、排序切换都不会反复把列表拽回当前文档。
   */
  const scrolledDocRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeDocId || scrolledDocRef.current === activeDocId) return;
    const index = docIndexMap.get(activeDocId);
    // 不在当前知识库 / 被筛选掉了：等下一次列表变化再试（清掉筛选后会自动补上）
    if (index === undefined) return;
    scrolledDocRef.current = activeDocId;
    const frame = requestAnimationFrame(() => {
      if (flatDocList.length > DOC_VIRTUALIZE_THRESHOLD) {
        virtualScrollRef.current?.scrollToIndex(index);
      } else {
        docsListRef.current
          ?.querySelector('[data-doc-id="' + activeDocId + '"]')
          ?.scrollIntoView({ block: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [activeDocId, docIndexMap, flatDocList]);

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
    if (flatDocList.length > DOC_VIRTUALIZE_THRESHOLD) {
      // 虚拟化下目标项可能不在 DOM 里，querySelector + scrollIntoView 会静默失效
      // （键盘导航"焦点消失"）；必须走命令式 scrollToIndex 按行高计算滚动位置
      virtualScrollRef.current?.scrollToIndex(clamped);
    } else {
      docsListRef.current?.querySelector(`[data-doc-id="${docId}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [flatDocList]);

  /**
   * P1-11：键盘打开行的右键菜单（Shift+F10 / 菜单键）。
   * 行内 4 个操作按钮默认 display:none（对键盘不可见），这四件事在菜单里都有 ——
   * 键盘用户的等价入口就是这里；坐标拿不到时（jsdom / 虚拟化未渲染）回落到列表左上角。
   */
  const openContextMenuFor = useCallback((docId: string) => {
    const list = docsListRef.current;
    const row = list?.querySelector<HTMLElement>('[data-doc-id="' + docId + '"]');
    const rowRect = row?.getBoundingClientRect();
    const listRect = list?.getBoundingClientRect();
    const placed = Boolean(rowRect && rowRect.width > 0);
    setContextMenu({
      docId,
      x: (placed ? rowRect!.left + 32 : (listRect?.left ?? 0) + 32),
      y: (placed ? rowRect!.bottom : (listRect?.top ?? 0) + 40),
    });
    setFocusedDocId(docId);
  }, []);

  const handleTreeKeyDown = useCallback((e: React.KeyboardEvent) => {
    // 行内输入（重命名 input 等）的按键不归树管：空格要能打出来、方向键要移光标。
    // 否则按键冒泡到这里被 preventDefault + 树语义劫持（空格变展开/收起、
    // 方向键变树导航、Enter 变打开文档）。
    const target = e.target as HTMLElement;
    if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
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
      case 'ContextMenu':
      case 'F10':
        // Shift+F10 是标准的「打开上下文菜单」键；单独的 F10 在部分平台留给菜单栏
        if (e.key === 'F10' && !e.shiftKey) return;
        if (!current) return;
        e.preventDefault();
        openContextMenuFor(current.id);
        break;
      default:
        break;
    }
  }, [childrenMap, docIndexMap, expandedDocs, flatDocList, focusByIndex, focusedIndex, handleDocClick, startRename, toggleExpand, openContextMenuFor]);

  const selectAllDocs = useCallback(() => {
    if (selectedDocs.size === flatDocList.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(flatDocList.map(item => item.doc.id)));
    }
  }, [selectedDocs.size, flatDocList]);

  if (!activeNotebook) return null;

  const renderDocItem = (
    doc: NoteDoc,
    depth: number,
    contextPath?: string,
    isContext?: boolean,
  ): React.JSX.Element => {
    // 箭头可见性只取决于"是否有子文档"，展开与否由 isExpanded 控制
    const hasChildren = (childrenMap.get(doc.id) ?? []).length > 0;
    // 还没用键盘操作过时，把当前打开的文档当作焦点，避免"按方向键没反应"
    const highlightId = focusedDocId ?? activeDocId;

    return (
      <DocTreeNode
        key={doc.id}
        doc={doc}
        depth={depth}
        contextPath={contextPath}
        isContext={isContext}
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

  /*
   * 非虚拟化路径直接吃 flatDocList：它已经带了层级深度与过滤上下文。
   * 旧版 renderDocTree 在这里会**再**做一次逐层 filter —— 与 P0-2 的全层级
   * 过滤结果冲突（过滤态下的路径上下文行会被它筛掉）。
   */
  const renderDocList = (): React.JSX.Element[] =>
    flatDocList.map((item) => (
      <React.Fragment key={item.doc.id}>
        {renderDocItem(item.doc, item.depth, item.contextPath, item.isContext)}
      </React.Fragment>
    ));

  // 过滤无结果时的空态描述：明确说出是哪个条件把结果筛没了（P0-2）
  const noMatchDesc =
    '当前条件下没有文档' +
    (searchText.trim() ? '（搜索：' + searchText.trim() + '）' : '') +
    (tagFilter.length > 0 ? '（已按 ' + tagFilter.length + ' 个标签筛选）' : '');

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
                icon: <IconPlus size={14} />,
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
        // P0-2：筛选无结果必须给出口，否则整块列表一片空白，看不出是筛没了还是没有数据
        ) : filterActive && flatDocList.length === 0 ? (
          <EmptyState
            icon={<IconSearch size={32} />}
            title="没有匹配的文档"
            description={noMatchDesc}
            actions={onClearFilter
              ? [
                  {
                    label: '清除筛选',
                    icon: <IconClose size={14} />,
                    variant: 'secondary',
                    onClick: onClearFilter,
                  },
                ]
              // 显式空数组：没有清除回调时无出口可给（而非省略整个字段）
              : []}
          />
        ) : flatDocList.length > DOC_VIRTUALIZE_THRESHOLD ? (
          <VirtualScroll
            ref={virtualScrollRef}
            items={flatDocList}
            itemHeight={DOC_ITEM_HEIGHT}
            containerHeight={listHeight}
            renderItem={({ doc, depth, contextPath, isContext }) =>
              renderDocItem(doc, depth, contextPath, isContext)
            }
            getKey={(item) => item.doc.id}
          />
        ) : (
          renderDocList()
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
              id: 'new-child',
              label: '在此新建子文档',
              title: '在该文档下面创建一篇子文档（P1-13）',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              ),
              onSelect: () => {
                if (!activeNotebookId) return;
                const created = useNotesStore
                  .getState()
                  .createDoc(activeNotebookId, contextMenu.docId);
                if (!created) return;
                // 子文档默认是收起的：不展开父级，新建完在树上看不到它
                setExpandedDocs((prev) => withAddedExpanded(prev, [contextMenu.docId]));
                setFocusedDocId(created);
                onViewDoc(activeNotebookId, created);
              },
            },
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
              // 与相邻菜单项同款内联线性图标（曾是 '↑' 文本字形，与 SVG 图标集割裂）
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" />
                  <path d="M5 12l7-7 7 7" />
                </svg>
              ),
              disabled: sortMode !== 'manual',
              title: sortMode === 'manual' ? '同级上移' : '切换到「手动排序」后可调整顺序',
              onSelect: () => moveDocByOffset(contextMenu.docId, -1),
            },
            {
              id: 'move-down',
              label: '下移',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14" />
                  <path d="M19 12l-7 7-7-7" />
                </svg>
              ),
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
