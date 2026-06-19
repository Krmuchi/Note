import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNotesStore } from '@/store';
import type { Notebook, TrashDoc } from '@/types';
import type { ViewType, LeftMenuType } from '@/hooks/useUIState';

interface SidebarProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  onSearchPanelOpen: () => void;
  activeLeftMenu: LeftMenuType;
  onLeftMenuChange: (menu: LeftMenuType) => void;
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  tags: { id: string; name: string }[];
  trash: TrashDoc[];
  onOpenSettings?: () => void;
  width?: number;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  searchText,
  onSearchChange,
  onSearchPanelOpen,
  activeLeftMenu,
  onLeftMenuChange,
  activeView,
  onViewChange,
  tags,
  trash,
  onOpenSettings,
  width,
  collapsed = false,
  onCollapsedChange,
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

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [notebookContextMenu, setNotebookContextMenu] = useState<{ x: number; y: number; notebookId: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hoveredNotebook, setHoveredNotebook] = useState<string | null>(null);
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null);
  const [editingNotebookTitle, setEditingNotebookTitle] = useState('');
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const notebookTitleInputRef = useRef<HTMLInputElement | null>(null);

  const sidebarCollapsed = collapsed;

  const setSidebarCollapsed = useCallback(
    (value: boolean) => {
      onCollapsedChange?.(value);
    },
    [onCollapsedChange],
  );

  const handleNotebookClick = useCallback((notebook: Notebook) => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
    onLeftMenuChange('notebooks');
    onViewChange('notebooks');
    setActiveNotebookId(notebook.id);
    setActiveDocId(notebook.docs[0]?.id ?? '');
  }, [sidebarCollapsed, setSidebarCollapsed, onLeftMenuChange, onViewChange, setActiveNotebookId, setActiveDocId]);

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

  const handleNavItemClick = useCallback((menu: LeftMenuType) => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
    onLeftMenuChange(menu);
    if (menu === 'favorite') {
      onViewChange('favorite');
    }
  }, [sidebarCollapsed, setSidebarCollapsed, onLeftMenuChange, onViewChange]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!sidebarCollapsed);
  }, [sidebarCollapsed, setSidebarCollapsed]);

  useEffect(() => {
    if (editingNotebookId) {
      notebookTitleInputRef.current?.focus();
      notebookTitleInputRef.current?.select();
    }
  }, [editingNotebookId]);

  const showTooltip = useCallback((text: string, e: React.MouseEvent) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltip({ text, x: e.currentTarget.getBoundingClientRect().right + 8, y: e.currentTarget.getBoundingClientRect().top });
    }, 300);
  }, []);

  const hideTooltip = useCallback(() => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltip(null);
  }, []);

  useEffect(() => {
    if (!notebookContextMenu) return;
    const handleClick = () => setNotebookContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [notebookContextMenu]);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMoreMenu]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  }, []);

  const navItems = [
    { id: 'start' as LeftMenuType, icon: 'home', label: '开始' },
    { id: 'note' as LeftMenuType, icon: 'note', label: '小记' },
    { id: 'favorite' as LeftMenuType, icon: 'star', label: '收藏' },
    { id: 'tags' as LeftMenuType, icon: 'tag', label: '标签' },
  ];

  return (
    <>
      <aside
        ref={sidebarRef}
        className={`main-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}
        role="navigation"
        aria-label="主导航"
        style={width !== undefined ? { width: sidebarCollapsed ? undefined : width } : undefined}
      >
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-icon-wrapper">
              <span className="brand-icon" aria-hidden="true">📝</span>
            </div>
            <span className="brand-text">笔记</span>
            <button
              className="brand-dropdown-btn"
              title="切换工作空间"
              aria-label="切换工作空间"
            >
              <span className="dropdown-arrow">▼</span>
            </button>
          </div>

          <div className="sidebar-search-wrapper">
            <div className={`sidebar-search ${searchFocused ? 'focused' : ''}`}>
              <svg className="search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                className="search-input"
                placeholder="搜索文档..."
                value={searchText}
                onChange={(e) => onSearchChange(e.target.value)}
                onClick={onSearchPanelOpen}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
              <span className="search-shortcut">Ctrl+K</span>
            </div>
            <button
              className="sidebar-add-btn"
              onClick={() => {
                if (activeNotebookId) {
                  useNotesStore.getState().createDoc(activeNotebookId, null);
                }
              }}
              title="新建文档"
              aria-label="新建文档"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        <nav className="sidebar-nav" role="menubar">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${activeLeftMenu === item.id ? 'active' : ''}`}
              onClick={() => handleNavItemClick(item.id)}
              role="menuitem"
              aria-current={activeLeftMenu === item.id ? 'page' : undefined}
              onMouseEnter={(e) => sidebarCollapsed && showTooltip(item.label, e)}
              onMouseLeave={hideTooltip}
            >
              <span className="nav-icon-wrapper">
                <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {item.icon === 'home' && <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>}
                  {item.icon === 'note' && <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></>}
                  {item.icon === 'star' && <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></>}
                  {item.icon === 'tag' && <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>}
                </svg>
              </span>
              <span className="nav-text">{item.label}</span>
              {item.id === 'tags' && tags.length > 0 && (
                <span className="nav-badge" aria-label={`${tags.length}个标签`}>{tags.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-section">
          <div
            className="section-header"
            onClick={() => {
              if (sidebarCollapsed) setSidebarCollapsed(false);
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
                      if (sidebarCollapsed) {
                        showTooltip(notebook.title, e);
                      }
                    }}
                    onMouseLeave={() => {
                      setHoveredNotebook(null);
                      hideTooltip();
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

        <div className="sidebar-footer">
          <div className="more-menu-container" ref={moreMenuRef}>
            <button
              className="footer-item"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              onMouseEnter={(e) => sidebarCollapsed && showTooltip('更多', e)}
              onMouseLeave={hideTooltip}
            >
              <span className="footer-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </span>
              <span className="footer-text">更多</span>
            </button>
            {showMoreMenu && (
              <div className="more-menu">
                <div className="more-menu-section">
                  <button
                    className={`more-menu-item ${activeView === 'trash' ? 'active' : ''}`}
                    onClick={() => {
                      onViewChange('trash');
                      setShowMoreMenu(false);
                    }}
                  >
                    <span className="more-menu-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </span>
                    <span className="more-menu-text">回收站</span>
                    {trash.length > 0 && <span className="more-menu-badge">{trash.length}</span>}
                  </button>
                </div>
                <div className="more-menu-section">
                  <button className="more-menu-item">
                    <span className="more-menu-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </span>
                    <span className="more-menu-text">导入文档</span>
                  </button>
                  <button className="more-menu-item">
                    <span className="more-menu-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </span>
                    <span className="more-menu-text">导出全部</span>
                  </button>
                </div>
                <div className="more-menu-section">
                  <button className="more-menu-item" onClick={() => { setShowMoreMenu(false); onOpenSettings?.(); }}>
                    <span className="more-menu-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    </span>
                    <span className="more-menu-text">设置</span>
                  </button>
                  <button className="more-menu-item">
                    <span className="more-menu-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </span>
                    <span className="more-menu-text">帮助中心</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {tooltip && sidebarCollapsed && (
        <div
          className="sidebar-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}

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