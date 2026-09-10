import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNotesStore } from '@/store';
import type { Notebook } from '@/types';
import type { LeftMenuType, ViewType } from '@/hooks/useUIState';

interface SidebarNotebooksProps {
  activeLeftMenu: LeftMenuType;
  onLeftMenuChange: (menu: LeftMenuType) => void;
  onViewChange: (view: ViewType) => void;
  collapsed: boolean;
  onShowTooltip: (text: string, e: React.MouseEvent) => void;
  onHideTooltip: () => void;
  onExpand: () => void;
}

export const SidebarNotebooks: React.FC<SidebarNotebooksProps> = ({
  onLeftMenuChange,
  onViewChange,
  collapsed,
  onShowTooltip,
  onHideTooltip,
  onExpand,
}) => {
  const { notebooks, activeNotebookId, createNotebook, deleteNotebook, updateNotebookTitle, setActiveNotebookId, setActiveDocId } = useNotesStore(useShallow((s) => ({
    notebooks: s.notebooks,
    activeNotebookId: s.activeNotebookId,
    createNotebook: s.createNotebook,
    deleteNotebook: s.deleteNotebook,
    updateNotebookTitle: s.updateNotebookTitle,
    setActiveNotebookId: s.setActiveNotebookId,
    setActiveDocId: s.setActiveDocId,
  })));

  const [notebookContextMenu, setNotebookContextMenu] = useState<{ x: number; y: number; notebookId: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hoveredNotebook, setHoveredNotebook] = useState<string | null>(null);
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null);
  const [editingNotebookTitle, setEditingNotebookTitle] = useState('');
  const notebookTitleInputRef = useRef<HTMLInputElement | null>(null);

  const handleNotebookClick = useCallback((notebook: Notebook) => {
    if (collapsed) {
      onExpand();
    }
    onLeftMenuChange('notebooks');
    onViewChange('notebooks');
    setActiveNotebookId(notebook.id);
    setActiveDocId(notebook.docs[0]?.id ?? '');
  }, [collapsed, onExpand, onLeftMenuChange, onViewChange, setActiveNotebookId, setActiveDocId]);

  const handleStartRenameNotebook = useCallback((notebook: Notebook) => {
    setEditingNotebookId(notebook.id);
    setEditingNotebookTitle(notebook.title);
    setNotebookContextMenu(null);
  }, []);

  const handleSaveNotebookTitle = useCallback(() => {
    if (editingNotebookId && editingNotebookTitle.trim()) {
      updateNotebookTitle(editingNotebookId, editingNotebookTitle.trim());
    }
    setEditingNotebookId(null);
  }, [editingNotebookId, editingNotebookTitle, updateNotebookTitle]);

  const handleDeleteNotebook = useCallback((notebookId: string) => {
    setConfirmDeleteId(notebookId);
    setNotebookContextMenu(null);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (confirmDeleteId) {
      deleteNotebook(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  }, [confirmDeleteId, deleteNotebook]);

  useEffect(() => {
    if (editingNotebookId) {
      notebookTitleInputRef.current?.focus();
      notebookTitleInputRef.current?.select();
    }
  }, [editingNotebookId]);

  useEffect(() => {
    if (!notebookContextMenu) return;
    const handleClick = (): void => setNotebookContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [notebookContextMenu]);

  return (
    <>
      <div className="sidebar-section">
        <div
          className="section-header"
          onClick={() => {
            if (collapsed) onExpand();
          }}
        >
          <span className="section-title">知识库</span>
          <button
            className="btn-add-notebook"
            onClick={(e) => {
              e.stopPropagation();
              createNotebook('新建知识库');
            }}
            title="新建知识库"
            aria-label="新建知识库"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        <div className="notebooks-list">
          {notebooks.map((notebook) => {
            const isActive = activeNotebookId === notebook.id;
            const isEditing = editingNotebookId === notebook.id;

            return (
              <div key={notebook.id} className="notebook-group">
                <button
                  className={`notebook-header ${isActive ? 'active' : ''}`}
                  onClick={() => handleNotebookClick(notebook)}
                  onMouseEnter={(e) => {
                    setHoveredNotebook(notebook.id);
                    if (collapsed) {
                      onShowTooltip(notebook.title, e);
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredNotebook(null);
                    onHideTooltip();
                  }}
                >
                  <span className="notebook-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </span>
                  {isEditing ? (
                    <input
                      ref={notebookTitleInputRef}
                      className="notebook-title-input"
                      value={editingNotebookTitle}
                      onChange={(e) => setEditingNotebookTitle(e.target.value)}
                      onBlur={handleSaveNotebookTitle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveNotebookTitle();
                        if (e.key === 'Escape') setEditingNotebookId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="notebook-name">{notebook.title}</span>
                  )}
                  {!isEditing && <span className="notebook-count">{notebook.docs.length}</span>}
                  {!isEditing && (
                    <span
                      className={`notebook-more-btn ${hoveredNotebook === notebook.id ? 'visible' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setNotebookContextMenu({ x: e.clientX, y: e.clientY, notebookId: notebook.id });
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {notebookContextMenu && (
        <div
          className="context-menu"
          style={{ left: notebookContextMenu.x, top: notebookContextMenu.y }}
          onClick={() => setNotebookContextMenu(null)}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              const nb = notebooks.find((n) => n.id === notebookContextMenu.notebookId);
              if (nb) handleStartRenameNotebook(nb);
            }}
          >
            <span className="context-menu-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </span>
            <span className="context-menu-text">重命名</span>
          </button>
          <button className="context-menu-item danger" onClick={() => handleDeleteNotebook(notebookContextMenu.notebookId)}>
            <span className="context-menu-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </span>
            <span className="context-menu-text">删除知识库</span>
          </button>
        </div>
      )}

      {confirmDeleteId && (
        <div className="confirm-dialog-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="confirm-dialog confirm-dialog-danger" onClick={(e) => e.stopPropagation()}>
            <h3>确认删除</h3>
            <p>确定要删除该知识库吗？知识库中的所有文档将被移到回收站。</p>
            <div className="confirm-dialog-actions">
              <button onClick={() => setConfirmDeleteId(null)}>取消</button>
              <button onClick={handleConfirmDelete} className="btn-danger">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SidebarNotebooks;
