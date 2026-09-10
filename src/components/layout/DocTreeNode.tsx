import React, { useState, useRef, useEffect, memo } from 'react';
import type { NoteDoc } from '@/types';
import type { DragPosition } from '@/hooks/useDocTreeDrag';
import { formatRelativeTime } from '@/utils/formatters';

interface DocTreeNodeProps {
  doc: NoteDoc;
  depth: number;
  isActive: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  /** 由父级（右键菜单"重命名"）驱动的行内编辑态 */
  isEditingTitle?: boolean;
  onTitleEditEnd?: () => void;
  /** 双击标题发起重命名 */
  onStartRename?: (docId: string) => void;
  dragOverDocId: string | null;
  dragOverPosition: DragPosition | null;
  onDocClick: (docId: string) => void;
  onToggleExpand: (docId: string) => void;
  /** 保存行内编辑后的标题（title 为编辑后的完整 doc） */
  onSaveTitle: (doc: NoteDoc) => void;
  onToggleFavorite: (docId: string) => void;
  onTogglePin: (docId: string) => void;
  onMove: (docId: string) => void;
  onDelete: (docId: string) => void;
  onContextMenu: (e: React.MouseEvent, docId: string) => void;
  onDragStart: (e: React.DragEvent, docId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent, docId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, docId: string) => void;
  isMultiSelectMode?: boolean;
  isSelected?: boolean;
  onSelect?: (docId: string) => void;
}

const DocTreeNodeInner: React.FC<DocTreeNodeProps> = ({
  doc,
  depth,
  isActive,
  isExpanded,
  hasChildren,
  isEditingTitle = false,
  onTitleEditEnd,
  onStartRename,
  dragOverDocId,
  dragOverPosition,
  onDocClick,
  onToggleExpand,
  onSaveTitle,
  onToggleFavorite,
  onTogglePin,
  onMove,
  onDelete,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  isMultiSelectMode = false,
  isSelected = false,
  onSelect,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(doc.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDragOver = dragOverDocId === doc.id;
  const editing = isEditing || isEditingTitle;

  // 进入编辑态时重置草稿为最新标题（渲染期调整 state，避免 effect 中同步 setState）。
  // 否则上次取消留下的旧文本会残留在输入框中
  const [prevEditing, setPrevEditing] = useState(false);
  if (editing !== prevEditing) {
    setPrevEditing(editing);
    if (editing) {
      setEditingTitle(doc.title);
    }
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const handleSaveTitle = (): void => {
    if (editingTitle.trim()) {
      onSaveTitle({ ...doc, title: editingTitle.trim() });
    }
    setIsEditing(false);
    onTitleEditEnd?.();
  };

  const handleCancelTitle = (): void => {
    setIsEditing(false);
    onTitleEditEnd?.();
  };

  return (
    <div
      className={`doc-item ${isActive ? 'active' : ''} ${depth > 0 ? 'doc-item-nested' : ''} ${isDragOver && dragOverPosition === 'inside' ? 'drag-over-inside' : ''}`}
      style={{ paddingLeft: depth * 16 + 12 }}
      onClick={() => onDocClick(doc.id)}
      onContextMenu={(e) => onContextMenu(e, doc.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      draggable
      onDragStart={(e) => onDragStart(e, doc.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, doc.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, doc.id)}
    >
      {isDragOver && dragOverPosition === 'before' && <div className="drag-indicator drag-indicator-before" />}
      {isMultiSelectMode && (
        <input
          type="checkbox"
          className="doc-select-checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect?.(doc.id);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      )}
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
      {hasChildren && (
        <span
          className="doc-expand-icon"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(doc.id);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={isExpanded ? "6 9 12 15 18 9" : "9 18 15 12 9 6"} />
          </svg>
        </span>
      )}
      {editing ? (
        <input
          ref={inputRef}
          className="doc-title-input"
          value={editingTitle}
          onChange={(e) => setEditingTitle(e.target.value)}
          onBlur={handleSaveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveTitle();
            if (e.key === 'Escape') handleCancelTitle();
          }}
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="doc-title"
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartRename?.(doc.id);
          }}
        >
          {doc.title}
        </span>
      )}
      <span className="doc-time">{formatRelativeTime(doc.updatedAt)}</span>
      {isHovered && !editing && (
        <div className="doc-actions">
          <button
            className="doc-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(doc.id);
            }}
            title={doc.pinned ? '取消置顶' : '置顶'}
            aria-label={doc.pinned ? '取消置顶' : '置顶'}
          >
            <svg viewBox="0 0 24 24" fill={doc.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 17v5" />
              <path d="M9 10.5L6 14l3 1.5V17h6v-1.5l3-1.5-3-3.5" />
              <path d="M9 10.5L5 6h14l-4 4.5" />
            </svg>
          </button>
          <button
            className="doc-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(doc.id);
            }}
            title={doc.favorite ? '取消收藏' : '收藏'}
            aria-label={doc.favorite ? '取消收藏' : '收藏'}
          >
            <svg viewBox="0 0 24 24" fill={doc.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <button
            className="doc-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMove(doc.id);
            }}
            title="移动"
            aria-label="移动"
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
              onDelete(doc.id);
            }}
            title="删除"
            aria-label="删除"
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
  );
};

/** memo 化：树任意 state（右键菜单/拖拽/多选）变化时，未受影响的节点跳过重渲染 */
export const DocTreeNode = memo(DocTreeNodeInner);

export default DocTreeNode;
