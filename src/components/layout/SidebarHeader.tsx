import React from 'react';
import { uiActions } from '@/hooks/useUIState';
import { useNotesStore } from '@/store';
import { modKey } from '@/utils/platform';
import { IconBook } from '@/components/common/Icon';
import { resolveTargetNotebookId } from '@/utils/targetNotebook';

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
  onOpenDoc,
  showMenuButton = false,
  menuOpen = false,
  onToggleMenu,
}) => {

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
        {/*
          P1-4 语义分离：这里是**全局搜索**的按钮式入口，就地过滤在文档列表顶部
          （DocsSidebar 的「过滤当前知识库文档…」）。旧版是一个受控输入框、
          又在 onClick 里打开搜索面板 —— 点一下焦点就被面板抢走，根本没法在框里打字，
          与下面那个同占位的过滤框也完全分不清。
        */}
        <button
          type="button"
          className="sidebar-search"
          onClick={onSearchPanelOpen}
          title="搜索全部知识库的标题与正文"
          aria-label="打开全局搜索"
        >
          <svg
            className="search-icon-svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span className="sidebar-search-label">搜索文档…</span>
          <span className="search-shortcut">{modKey}+K</span>
        </button>
        {/* 当前的文档树过滤是个独立状态：给它一个看得见、点得掉的出口 */}
        {searchText && (
          <button
            type="button"
            className="sidebar-filter-clear"
            onClick={() => onSearchChange('')}
            title="清除文档过滤"
            aria-label={`清除文档过滤：${searchText}`}
          >
            ×
          </button>
        )}
        {/*
          P1-12：快速打开（Ctrl+P）此前只有快捷键入口 —— 不记快捷键、用触屏的人
          永远见不到这个「1 击直达」功能。这里给一个与搜索并排的鼠标入口。
        */}
        <button
          type="button"
          className="sidebar-quick-open-btn"
          onClick={() => uiActions.setShowQuickOpen(true)}
          title={`快速打开（${modKey}+P）`}
          aria-label="快速打开文档"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 0 0 0-6z" />
          </svg>
        </button>
        <button
          className="sidebar-add-btn"
          onClick={() => {
            // 空库兜底：与 StartPage / Ctrl+N 共用同一套目标知识库解析，
            // 一个知识库都没有时自动创建「我的知识库」，而不是点了毫无反应
            const state = useNotesStore.getState();
            const notebookId = resolveTargetNotebookId(state);
            if (!notebookId) return;
            const docId = state.createDoc(notebookId, null);
            if (docId) onOpenDoc?.(notebookId, docId);
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
