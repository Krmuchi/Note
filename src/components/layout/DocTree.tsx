import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNotesStore } from '@/store';
import { VirtualScroll } from '@/components/VirtualScroll';
import { EmptyState } from '@/components/common/EmptyState';
import { useDocTreeDrag } from '@/hooks/useDocTreeDrag';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { DocTreeNode } from './DocTreeNode';
import type { NoteDoc, Notebook } from '@/types';

interface DocTreeProps {
  activeNotebook: Notebook | null;
  searchText: string;
  onViewDoc: (notebookId: string, docId: string) => void;
  /** 请求父级打开"移动到其他知识库"对话框 */
  onMoveRequest: (docId: string) => void;
}

const DOC_VIRTUALIZE_THRESHOLD = 200;
const DOC_ITEM_HEIGHT = 40;

/** updatedAt 解析结果缓存：排序比较中反复 new Date() 解析 ISO 字符串开销大 */
const updatedAtCache = new WeakMap<NoteDoc, number>();
const getUpdatedTime = (doc: NoteDoc): number => {
  let t = updatedAtCache.get(doc);
  if (t === undefined) {
    t = new Date(doc.updatedAt).getTime();
    updatedAtCache.set(doc, t);
  }
  return t;
};

/** 搜索过滤 + 置顶/更新时间排序 */
const sortAndFilter = (docs: NoteDoc[], searchText: string): NoteDoc[] => {
  const filtered = searchText
    ? docs.filter((d) => d.title.toLowerCase().includes(searchText.toLowerCase()))
    : docs;
  return [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return getUpdatedTime(b) - getUpdatedTime(a);
  });
};

/** 知识库文档树：层级展示、搜索过滤、拖拽排序、右键菜单、虚拟化 */
export const DocTree: React.FC<DocTreeProps> = ({
  activeNotebook,
  searchText,
  onViewDoc,
  onMoveRequest,
}) => {
  const {
    activeDocId,
    setActiveDocId,
    updateDoc,
    toggleFavorite,
    togglePin,
    moveDocToTrash,
    reorderDocs,
  } = useNotesStore(useShallow((s) => ({
    activeDocId: s.activeDocId,
    setActiveDocId: s.setActiveDocId,
    updateDoc: s.updateDoc,
    toggleFavorite: s.toggleFavorite,
    togglePin: s.togglePin,
    moveDocToTrash: s.moveDocToTrash,
    reorderDocs: s.reorderDocs,
  })));

  const activeNotebookId = activeNotebook?.id ?? null;

  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; docId: string } | null>(null);
  // 重命名编辑状态提升到树层级：右键菜单"重命名"通过它驱动对应节点进入行内编辑
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const docsListRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(480);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const { confirmConfig, confirm, handleConfirm, handleCancel } = useConfirmAction();

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
    const update = () => setListHeight(el.clientHeight || 480);
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

  const batchDeleteDocs = useCallback(() => {
    if (!activeNotebookId || selectedDocs.size === 0) return;
    // 与单个删除/清空回收站保持一致的确认交互，避免误操作
    confirm({
      title: '批量删除',
      message: `确定要将选中的 ${selectedDocs.size} 个文档移入回收站吗？`,
      confirmText: '移入回收站',
      variant: 'danger',
      onConfirm: () => {
        selectedDocs.forEach(docId => {
          moveDocToTrash(activeNotebookId, docId);
        });
        setSelectedDocs(new Set());
      },
    });
  }, [activeNotebookId, selectedDocs, moveDocToTrash, confirm]);

  const handleContextMenu = useCallback((e: React.MouseEvent, docId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, docId });
  }, []);

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

  const flatDocList = useMemo(() => {
    const result: { doc: NoteDoc; depth: number }[] = [];
    const walk = (docs: NoteDoc[], depth: number) => {
      const sorted = sortAndFilter(docs, searchText);
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
  }, [activeNotebook, searchText, expandedDocs, childrenMap]);

  const selectAllDocs = useCallback(() => {
    if (selectedDocs.size === flatDocList.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(flatDocList.map(item => item.doc.id)));
    }
  }, [selectedDocs.size, flatDocList]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  if (!activeNotebook) return null;

  const renderDocItem = (doc: NoteDoc, depth: number) => {
    // 箭头可见性只取决于"是否有子文档"，展开与否由 isExpanded 控制
    const hasChildren = (childrenMap.get(doc.id) ?? []).length > 0;

    return (
      <DocTreeNode
        key={doc.id}
        doc={doc}
        depth={depth}
        isActive={activeDocId === doc.id}
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

  const renderDocTree = (docs: NoteDoc[], depth: number = 0) => {
    return sortAndFilter(docs, searchText).map((doc) => {
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
                <button className="batch-toolbar-btn danger" onClick={batchDeleteDocs}>
                  批量删除
                </button>
              </>
            )}
          </>
        )}
      </div>

      <div className="docs-list" ref={docsListRef}>
        {activeNotebook.docs.length === 0 ? (
          <EmptyState
            icon="📝"
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
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className="context-menu-item" onClick={() => startRename(contextMenu.docId)}>
            <span className="context-menu-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </span>
            <span className="context-menu-text">重命名</span>
          </button>
          <button className="context-menu-item" onClick={() => handleToggleFavorite(contextMenu.docId)}>
            <span className="context-menu-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </span>
            <span className="context-menu-text">{activeNotebook?.docs.find(d => d.id === contextMenu.docId)?.favorite ? '取消收藏' : '收藏'}</span>
          </button>
          <button className="context-menu-item" onClick={() => handleTogglePin(contextMenu.docId)}>
            <span className="context-menu-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 17v5" />
                <path d="M9 10.5L6 14l3 1.5V17h6v-1.5l3-1.5-3-3.5" />
                <path d="M9 10.5L5 6h14l-4 4.5" />
              </svg>
            </span>
            <span className="context-menu-text">{activeNotebook?.docs.find(d => d.id === contextMenu.docId)?.pinned ? '取消置顶' : '置顶'}</span>
          </button>
          <button className="context-menu-item" onClick={() => handleMove(contextMenu.docId)}>
            <span className="context-menu-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
            </span>
            <span className="context-menu-text">移动到</span>
          </button>
          <button className="context-menu-item danger" onClick={() => handleDelete(contextMenu.docId)}>
            <span className="context-menu-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </span>
            <span className="context-menu-text">删除</span>
          </button>
        </div>
      )}
      {confirmConfig && (
        <ConfirmDialog
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmText={confirmConfig.confirmText}
          variant={confirmConfig.variant}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  );
};

export default DocTree;
