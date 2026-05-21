import React, { useState } from 'react';
import { useNotesStore } from '../../store/notesStore';
import type { Notebook } from '../../types';

interface SidebarProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  onSearchPanelOpen: () => void;
  activeLeftMenu: string;
  onLeftMenuChange: (menu: string) => void;
  activeView: string;
  onViewChange: (view: string) => void;
  tags: { id: string; name: string }[];
  trash: any[];
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
}) => {
  const { notebooks, createNotebook, setActiveNotebookId, setActiveDocId } = useNotesStore();
  const [notebooksExpanded, setNotebooksExpanded] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [notebookContextMenu, setNotebookContextMenu] = useState<{ x: number; y: number; notebookId: string } | null>(null);

  const handleNotebookClick = (notebook: Notebook) => {
    onLeftMenuChange('notebooks');
    onViewChange('notebooks');
    setActiveNotebookId(notebook.id);
    setActiveDocId(notebook.docs[0]?.id ?? '');
  };

  const handleDeleteNotebook = (notebookId: string) => {
    const notebook = notebooks.find(nb => nb.id === notebookId);
    if (!notebook) return;
    
    if (window.confirm(`确定要删除知识库「${notebook.title}」吗？知识库中的所有文档将被移到回收站。`)) {
      useNotesStore.getState().deleteNotebook(notebookId);
    }
    setNotebookContextMenu(null);
  };

  return (
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
              onChange={(e) => onSearchChange(e.target.value)}
              onClick={onSearchPanelOpen}
            />
            <span className="search-shortcut">Ctrl+K</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${activeLeftMenu === 'start' ? 'active' : ''}`}
          onClick={() => onLeftMenuChange('start')}
        >
          <span className="nav-icon">🏠</span>
          <span className="nav-text">开始</span>
        </button>
        <button
          className={`nav-item ${activeLeftMenu === 'note' ? 'active' : ''}`}
          onClick={() => onLeftMenuChange('note')}
        >
          <span className="nav-icon">📝</span>
          <span className="nav-text">小记</span>
        </button>
        <button
          className={`nav-item ${activeLeftMenu === 'favorite' ? 'active' : ''}`}
          onClick={() => {
            onLeftMenuChange('favorite');
            onViewChange('favorite');
          }}
        >
          <span className="nav-icon">⭐</span>
          <span className="nav-text">收藏</span>
        </button>
        <button
          className={`nav-item ${activeLeftMenu === 'tags' ? 'active' : ''}`}
          onClick={() => onLeftMenuChange('tags')}
        >
          <span className="nav-icon">🏷️</span>
          <span className="nav-text">标签</span>
          {tags.length > 0 && <span className="nav-badge">{tags.length}</span>}
        </button>
      </nav>

      <div className="sidebar-section">
        <button
          className="section-header"
          onClick={() => setNotebooksExpanded(!notebooksExpanded)}
        >
          <span className="section-expand-icon">{notebooksExpanded ? '▼' : '▶'}</span>
          <span className="section-title">知识库</span>
          <button
            className="btn-add-notebook"
            onClick={(e) => {
              e.stopPropagation();
              createNotebook('新建知识库');
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
                className={`notebook-item ${useNotesStore.getState().activeNotebookId === notebook.id ? 'active' : ''}`}
                onClick={() => handleNotebookClick(notebook)}
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
          <button className="footer-item" onClick={() => setShowMoreMenu(!showMoreMenu)}>
            <span className="footer-icon">⋯</span>
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
                  <span className="more-menu-icon">🗑️</span>
                  <span className="more-menu-text">回收站</span>
                  {trash.length > 0 && <span className="more-menu-badge">{trash.length}</span>}
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

      {notebookContextMenu && (
        <div
          className="context-menu"
          style={{ left: notebookContextMenu.x, top: notebookContextMenu.y }}
          onClick={() => setNotebookContextMenu(null)}
        >
          <button onClick={() => handleDeleteNotebook(notebookContextMenu.notebookId)}>
            删除知识库
          </button>
        </div>
      )}
    </aside>
  );
};