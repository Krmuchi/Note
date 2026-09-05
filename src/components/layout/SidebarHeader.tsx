import React, { useState } from 'react';
import { useNotesStore } from '@/store';
import { modKey } from '@/utils/platform';

interface SidebarHeaderProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  onSearchPanelOpen: () => void;
  activeNotebookId: string;
  /** 新建文档后打开该文档（切换到编辑器视图） */
  onOpenDoc?: (notebookId: string, docId: string) => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  searchText,
  onSearchChange,
  onSearchPanelOpen,
  activeNotebookId,
  onOpenDoc,
}) => {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
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
          <span className="search-shortcut">{modKey}+K</span>
        </div>
        <button
          className="sidebar-add-btn"
          onClick={() => {
            if (activeNotebookId) {
              const docId = useNotesStore.getState().createDoc(activeNotebookId, null);
              if (docId) onOpenDoc?.(activeNotebookId, docId);
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
  );
};

export default SidebarHeader;
