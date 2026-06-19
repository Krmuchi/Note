import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNotesStore } from '@/store';
import type { NoteDoc } from '@/types';

interface DocsSidebarProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  onViewDoc: (notebookId: string, docId: string) => void;
  width?: number;
}

export const DocsSidebar: React.FC<DocsSidebarProps> = ({
  searchText,
  onSearchChange,
  onViewDoc,
  width,
}) => {
  const {
    notebooks,
    activeNotebookId,
    activeDocId,
    createDoc,
    updateDoc,
    setActiveDocId,
    toggleFavorite,
    moveDocToTrash,
    moveDocToNotebook,
    reorderDocs,
  } = useNotesStore(useShallow((s) => ({
    notebooks: s.notebooks,
    activeNotebookId: s.activeNotebookId,
    activeDocId: s.activeDocId,
    createDoc: s.createDoc,
    updateDoc: s.updateDoc,
    setActiveDocId: s.setActiveDocId,
    toggleFavorite: s.toggleFavorite,
    moveDocToTrash: s.moveDocToTrash,
    moveDocToNotebook: s.moveDocToNotebook,
    reorderDocs: s.reorderDocs,
  })));

  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; docId: string } | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveDocId, setMoveDocId] = useState<string | null>(null);
  const [dragOverDocId, setDragOverDocId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | 'inside' | null>(null);
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  const draggedDocIdRef = useRef<string | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.offsetWidth;
      setIsCompact(w < 250);
    });
    observer.observe(el);
    setIsCompact(el.offsetWidth < 250);
    return () => observer.disconnect();
  }, []);

  const activeNotebook = useMemo(
    () => notebooks.find((nb) => nb.id === activeNotebookId) ?? null,
    [notebooks, activeNotebookId]
  );

  const toggleExpand = (docId: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleDocClick = (docId: string) => {
    setActiveDocId(docId);
    if (activeNotebookId) onViewDoc(activeNotebookId, docId);
  };

  const handleStartEditTitle = (doc: NoteDoc) => {
    setEditingDocId(doc.id);
    setEditingTitle(doc.title);
    setContextMenu(null);
  };

  const handleSaveTitle = () => {
    if (editingDocId && editingTitle.trim()) {
      updateDoc(activeNotebookId, editingDocId, { title: editingTitle.trim() });
    }
    setEditingDocId(null);
  };

  const handleDelete = (docId: string) => {
    moveDocToTrash(activeNotebookId, docId);
    setContextMenu(null);
  };

  const handleMove = (docId: string) => {
    setMoveDocId(docId);
    setShowMoveDialog(true);
    setContextMenu(null);
  };

  const handleToggleFavorite = (docId: string) => {
    toggleFavorite(activeNotebookId, docId);
    setContextMenu(null);
  };

  const handleDragStart = useCallback((e: React.DragEvent, docId: string) => {
    draggedDocIdRef.current = docId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', docId);
    const target = e.currentTarget as HTMLElement;
    target.classList.add('dragging');
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.classList.remove('dragging');
    draggedDocIdRef.current = null;
    setDragOverDocId(null);
    setDragOverPosition(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, docId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    let position: 'before' | 'after' | 'inside';
    if (y < height * 0.25) {
      position = 'before';
    } else if (y > height * 0.75) {
      position = 'after';
    } else {
      position = 'inside';
    }

    setDragOverDocId(docId);
    setDragOverPosition(position);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDocId(null);
    setDragOverPosition(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetDocId: string) => {
    e.preventDefault();
    const sourceDocId = draggedDocIdRef.current;
    if (!sourceDocId || sourceDocId === targetDocId || !activeNotebook) {
      setDragOverDocId(null);
      setDragOverPosition(null);
      return;
    }

    const sourceDoc = activeNotebook.docs.find(d => d.id === sourceDocId);
    const targetDoc = activeNotebook.docs.find(d => d.id === targetDocId);
    if (!sourceDoc || !targetDoc) return;

    if (dragOverPosition === 'inside') {
      updateDoc(activeNotebookId, sourceDocId, { parentId: targetDocId });
      setExpandedDocs(prev => new Set([...prev, targetDocId]));
    } else {
      const parentId = targetDoc.parentId;
      const siblings = activeNotebook.docs.filter(d => d.parentId === parentId);
      const fromIndex = siblings.findIndex(d => d.id === sourceDocId);
      let toIndex = siblings.findIndex(d => d.id === targetDocId);

      if (fromIndex === -1) {
        updateDoc(activeNotebookId, sourceDocId, { parentId });
        const newSiblings = activeNotebook.docs.filter(d => d.parentId === parentId);
        const newToIndex = newSiblings.findIndex(d => d.id === targetDocId);
        if (newToIndex !== -1) {
          reorderDocs(activeNotebookId, newSiblings.findIndex(d => d.id === sourceDocId), dragOverPosition === 'after' ? newToIndex + 1 : newToIndex, parentId);
        }
      } else {
        if (dragOverPosition === 'after') toIndex++;
        if (fromIndex < toIndex) toIndex--;
        reorderDocs(activeNotebookId, fromIndex, toIndex, parentId);
      }
    }

    setDragOverDocId(null);
    setDragOverPosition(null);
    draggedDocIdRef.current = null;
  }, [activeNotebook, activeNotebookId, dragOverPosition, updateDoc, reorderDocs]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const renderDocTree = (docs: NoteDoc[], depth: number = 0) => {
    const filtered = searchText
      ? docs.filter((d) => d.title.toLowerCase().includes(searchText.toLowerCase()))
      : docs;

    const sorted = [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return sorted.map((doc) => {
      const hasChildren = doc.parentId === null || expandedDocs.has(doc.id);
      const children = docs.filter((d) => d.parentId === doc.id);
      const isDragOver = dragOverDocId === doc.id;
      const isHovered = hoveredDocId === doc.id;

      return (
        <React.Fragment key={doc.id}>
          <div
            className={`doc-item ${activeDocId === doc.id ? 'active' : ''} ${depth > 0 ? 'doc-item-nested' : ''} ${isDragOver && dragOverPosition === 'inside' ? 'drag-over-inside' : ''}`}
            style={{ paddingLeft: depth * 16 + 12 }}
            onClick={() => handleDocClick(doc.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, docId: doc.id });
            }}
            onMouseEnter={() => setHoveredDocId(doc.id)}
            onMouseLeave={() => setHoveredDocId(null)}
            draggable
            onDragStart={(e) => handleDragStart(e, doc.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, doc.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, doc.id)}
          >
            {isDragOver && dragOverPosition === 'before' && <div className="drag-indicator drag-indicator-before" />}
            <span className="doc-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </span>
            {doc.pinned && (
              <span className="doc-pin-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 17v5" />
                  <path d="M9 10.5L6 14l3 1.5V17h6v-1.5l3-1.5-3-3.5" />
                  <path d="M9 10.5L5 6h14l-4 4.5" />
                </svg>
              </span>
            )}
            {doc.favorite && (
              <span className="doc-fav-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </span>
            )}
            {children.length > 0 && (
              <span
                className="doc-expand-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(doc.id);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points={expandedDocs.has(doc.id) ? "6 9 12 15 18 9" : "9 18 15 12 9 6"} />
                </svg>
              </span>
            )}
            {editingDocId === doc.id ? (
              <input
                className="doc-title-input"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') setEditingDocId(null);
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="doc-title">{doc.title}</span>
            )}
            <span className="doc-time">{formatTime(doc.updatedAt)}</span>
            {isHovered && !editingDocId && (
              <div className="doc-actions">
                <button
                  className="doc-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFavorite(doc.id);
                  }}
                  title={doc.favorite ? '取消收藏' : '收藏'}
                >
                  <svg viewBox="0 0 24 24" fill={doc.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
                <button
                  className="doc-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMove(doc.id);
                  }}
                  title="移动"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="M12 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  className="doc-action-btn danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(doc.id);
                  }}
                  title="删除"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            )}
            {isDragOver && dragOverPosition === 'after' && <div className="drag-indicator drag-indicator-after" />}
          </div>
          {hasChildren && children.length > 0 && renderDocTree(children, depth + 1)}
        </React.Fragment>
      );
    });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  return (
    <aside
      ref={sidebarRef}
      className={`docs-sidebar ${isCompact ? 'docs-sidebar-compact' : ''}`}
      style={width !== undefined ? { width } : undefined}
    >
      {activeNotebook && (
        <>
          <div className="docs-header">
            <div className="docs-title-row">
              <span className="docs-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className="docs-title">{activeNotebook.title}</span>
              <span className="docs-count">{activeNotebook.docs.length}</span>
            </div>
            <button
              className="btn-add-doc"
              onClick={() => createDoc(activeNotebookId, null)}
              title="新建文档"
              aria-label="新建文档"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
          <div className="docs-search">
            <input
              className="docs-search-input"
              placeholder="搜索文档..."
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <div className="docs-list">
            {activeNotebook.docs.length === 0 ? (
              <div className="docs-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <p>暂无文档</p>
                <span>点击右上角 + 新建文档</span>
              </div>
            ) : (
              renderDocTree(activeNotebook.docs)
            )}
          </div>
        </>
      )}

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className="context-menu-item" onClick={() => {
            const doc = activeNotebook?.docs.find(d => d.id === contextMenu.docId);
            if (doc) handleStartEditTitle(doc);
          }}>
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

      {showMoveDialog && moveDocId && (
        <div className="confirm-dialog-overlay" onClick={() => setShowMoveDialog(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>移动文档</h3>
            <p>选择目标知识库：</p>
            <div className="move-target-list">
              {notebooks
                .filter((nb) => nb.id !== activeNotebookId)
                .map((nb) => (
                  <button
                    key={nb.id}
                    className="move-target-item"
                    onClick={() => {
                      moveDocToNotebook(activeNotebookId, moveDocId, nb.id);
                      setShowMoveDialog(false);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    {nb.title}
                  </button>
                ))}
            </div>
            <div className="confirm-dialog-actions">
              <button onClick={() => setShowMoveDialog(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};