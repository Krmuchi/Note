import React, { useState } from 'react';
import { useNotesStore } from '@/store';
import { modKey } from '@/utils/platform';
import { IconBook } from '@/components/common/Icon';

interface SidebarHeaderProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  onSearchPanelOpen: () => void;
  activeNotebookId: string;
  /** 新建文档后打开该文档（切换到编辑器视图） */
  onOpenDoc?: (notebookId: string, docId: string) => void;
  /** 移动端：显示导航抽屉开关按钮 */
  showMenuButton?: boolean;
  menuOpen?: boolean;
  onToggleMenu?: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  searchText,
  onSearchChange,
  onSearchPanelOpen,
  activeNotebookId,
  onOpenDoc,
  showMenuButton = false,
  menuOpen = false,
  onToggleMenu,
}) => {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <div className="sidebar-header">
      {showMenuButton && (
        <button
          type="button"
          className={`mobile-nav-toggle ${menuOpen ? 'active' : ''}`}
          onClick={onToggleMenu}
          aria-label={menuOpen ? '关闭导航菜单' : '打开导航菜单'}
          aria-expanded={menuOpen}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {menuOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      )}

      <div className="brand">
        <div className="brand-icon-wrapper">
          {/* 品牌标记：简洁的线性图标（替代彩色 emoji）。logo 类标记的共同点是
              "单色、可缩放、随主题变色"，emoji 在不同字体下渲染不一致且颜色失控 */}
          <span className="brand-icon" aria-hidden="true">
            <IconBook size={18} />
          </span>
        </div>
        <span className="brand-text">笔记</span>
        {/* 多工作空间尚未实现：置灰并说明，避免呈现为可点击却无响应的死按钮 */}
        <button
          className="brand-dropdown-btn"
          title="工作空间切换即将推出"
          aria-label="工作空间切换即将推出"
          disabled
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
