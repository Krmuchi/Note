import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNotesStore } from '@/store';
import type { TrashDoc } from '@/types';
import type { ViewType, LeftMenuType } from '@/hooks/useUIState';
import { SidebarHeader } from './SidebarHeader';
import { SidebarNav } from './SidebarNav';
import { SidebarNotebooks } from './SidebarNotebooks';
import { SidebarFooter } from './SidebarFooter';

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
  onOpenShortcutHelp?: () => void;
  /** 新建文档后打开该文档（切换到编辑器视图） */
  onOpenDoc?: (notebookId: string, docId: string) => void;
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
  onOpenShortcutHelp,
  onOpenDoc,
  width,
  collapsed = false,
  onCollapsedChange,
}) => {
  const activeNotebookId = useNotesStore(s => s.activeNotebookId);
  const sidebarRef = useRef<HTMLElement>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const setSidebarCollapsed = useCallback(
    (value: boolean) => {
      onCollapsedChange?.(value);
    },
    [onCollapsedChange],
  );

  const showTooltip = useCallback((text: string, e: React.MouseEvent) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    // React 事件对象的 currentTarget 只在派发期间有效，必须在 setTimeout 外同步捕获坐标
    const target = e.currentTarget as HTMLElement;
    const x = target.getBoundingClientRect().right + 8;
    const y = target.getBoundingClientRect().top;
    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltip({ text, x, y });
    }, 300);
  }, []);

  const hideTooltip = useCallback(() => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltip(null);
  }, []);

  // 注意：此处不再注册 Ctrl+B 快捷键。Ctrl+B 是编辑器加粗快捷键（keyboardSlice），
  // 此前的 window 级监听会在编辑时同时折叠侧边栏。侧边栏折叠由 Ctrl+\（toggleSidebar）负责。

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  }, []);

  return (
    <>
      <aside
        ref={sidebarRef}
        className={`main-sidebar ${collapsed ? 'collapsed' : ''}`}
        role="navigation"
        aria-label="主导航"
        style={width !== undefined ? { width: collapsed ? undefined : width } : undefined}
      >
        <SidebarHeader
          searchText={searchText}
          onSearchChange={onSearchChange}
          onSearchPanelOpen={onSearchPanelOpen}
          activeNotebookId={activeNotebookId}
          onOpenDoc={onOpenDoc}
        />

        <SidebarNav
          activeLeftMenu={activeLeftMenu}
          onLeftMenuChange={onLeftMenuChange}
          onViewChange={onViewChange}
          tags={tags}
          collapsed={collapsed}
          onShowTooltip={showTooltip}
          onHideTooltip={hideTooltip}
          onExpand={() => setSidebarCollapsed(false)}
        />

        <SidebarNotebooks
          activeLeftMenu={activeLeftMenu}
          onLeftMenuChange={onLeftMenuChange}
          onViewChange={onViewChange}
          collapsed={collapsed}
          onShowTooltip={showTooltip}
          onHideTooltip={hideTooltip}
          onExpand={() => setSidebarCollapsed(false)}
        />

        <SidebarFooter
          activeView={activeView}
          onViewChange={onViewChange}
          trash={trash}
          onOpenSettings={onOpenSettings}
          onOpenShortcutHelp={onOpenShortcutHelp}
          collapsed={collapsed}
          onShowTooltip={showTooltip}
          onHideTooltip={hideTooltip}
        />
      </aside>

      {tooltip && collapsed && (
        <div
          className="sidebar-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </>
  );
};

export default Sidebar;
