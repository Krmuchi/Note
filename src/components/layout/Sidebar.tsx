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
  /** 窄窗口/移动端：侧栏退化为顶部条 + 抽屉式导航面板 */
  mobile?: boolean;
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
  mobile = false,
}) => {
  const activeNotebookId = useNotesStore(s => s.activeNotebookId);
  const sidebarRef = useRef<HTMLElement>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  /** 移动端导航抽屉开关 */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobilePanelRef = useRef<HTMLDivElement>(null);

  const setSidebarCollapsed = useCallback(
    (value: boolean) => {
      onCollapsedChange?.(value);
    },
    [onCollapsedChange],
  );

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
    // 关闭后把焦点还给开关按钮，避免焦点停留在已卸载的面板内
    sidebarRef.current?.querySelector<HTMLButtonElement>('.mobile-nav-toggle')?.focus();
  }, []);

  // 打开抽屉时把焦点移入面板，键盘用户可直接 Tab 遍历导航项
  useEffect(() => {
    if (mobile && mobileNavOpen) mobilePanelRef.current?.focus();
  }, [mobile, mobileNavOpen]);

  // 切回桌面宽度时收起抽屉，避免状态残留。
  // 用"渲染期调整状态"代替 effect：setState-in-effect 会触发级联渲染，且此处无需副作用
  const [prevMobile, setPrevMobile] = useState(mobile);
  if (prevMobile !== mobile) {
    setPrevMobile(mobile);
    if (!mobile && mobileNavOpen) setMobileNavOpen(false);
  }

  // Esc 关闭移动端抽屉（与全局 Escape 处理互补：抽屉打开时优先关闭抽屉）
  useEffect(() => {
    if (!mobile || !mobileNavOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMobileNav();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [mobile, mobileNavOpen, closeMobileNav]);

  // 移动端点选后自动收起抽屉，符合"选中即离开"的手势预期
  const handleLeftMenuChange = useCallback(
    (menu: LeftMenuType) => {
      onLeftMenuChange(menu);
      if (mobile) closeMobileNav();
    },
    [onLeftMenuChange, mobile, closeMobileNav],
  );

  const handleViewChange = useCallback(
    (view: ViewType) => {
      onViewChange(view);
      if (mobile) closeMobileNav();
    },
    [onViewChange, mobile, closeMobileNav],
  );

  const handleOpenDoc = useCallback(
    (notebookId: string, docId: string) => {
      onOpenDoc?.(notebookId, docId);
      if (mobile) closeMobileNav();
    },
    [onOpenDoc, mobile, closeMobileNav],
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
        className={`main-sidebar ${collapsed && !mobile ? 'collapsed' : ''} ${mobile ? 'main-sidebar-mobile' : ''}`}
        role="navigation"
        aria-label="主导航"
        style={!mobile && width !== undefined ? { width: collapsed ? undefined : width } : undefined}
      >
        <SidebarHeader
          searchText={searchText}
          onSearchChange={onSearchChange}
          onSearchPanelOpen={onSearchPanelOpen}
          activeNotebookId={activeNotebookId}
          onOpenDoc={handleOpenDoc}
          showMenuButton={mobile}
          menuOpen={mobileNavOpen}
          onToggleMenu={() => setMobileNavOpen(open => !open)}
        />

        {mobile ? (
          mobileNavOpen && (
            <>
              <div className="mobile-nav-backdrop" onClick={closeMobileNav} aria-hidden="true" />
              <div
                className="mobile-nav-panel"
                role="dialog"
                aria-modal="true"
                aria-label="导航菜单"
                tabIndex={-1}
                ref={mobilePanelRef}
              >
                <SidebarNav
                  activeLeftMenu={activeLeftMenu}
                  onLeftMenuChange={handleLeftMenuChange}
                  onViewChange={handleViewChange}
                  tags={tags}
                  collapsed={false}
                  onShowTooltip={showTooltip}
                  onHideTooltip={hideTooltip}
                  onExpand={() => undefined}
                />
                <SidebarNotebooks
                  activeLeftMenu={activeLeftMenu}
                  onLeftMenuChange={handleLeftMenuChange}
                  onViewChange={handleViewChange}
                  collapsed={false}
                  onShowTooltip={showTooltip}
                  onHideTooltip={hideTooltip}
                  onExpand={() => undefined}
                />
                <SidebarFooter
                  activeView={activeView}
                  onViewChange={handleViewChange}
                  trash={trash}
                  onOpenSettings={onOpenSettings}
                  onOpenShortcutHelp={onOpenShortcutHelp}
                  collapsed={false}
                  onShowTooltip={showTooltip}
                  onHideTooltip={hideTooltip}
                />
              </div>
            </>
          )
        ) : (
          <>
            <SidebarNav
              activeLeftMenu={activeLeftMenu}
              onLeftMenuChange={handleLeftMenuChange}
              onViewChange={handleViewChange}
              tags={tags}
              collapsed={collapsed}
              onShowTooltip={showTooltip}
              onHideTooltip={hideTooltip}
              onExpand={() => setSidebarCollapsed(false)}
            />

            <SidebarNotebooks
              activeLeftMenu={activeLeftMenu}
              onLeftMenuChange={handleLeftMenuChange}
              onViewChange={handleViewChange}
              collapsed={collapsed}
              onShowTooltip={showTooltip}
              onHideTooltip={hideTooltip}
              onExpand={() => setSidebarCollapsed(false)}
            />

            <SidebarFooter
              activeView={activeView}
              onViewChange={handleViewChange}
              trash={trash}
              onOpenSettings={onOpenSettings}
              onOpenShortcutHelp={onOpenShortcutHelp}
              collapsed={collapsed}
              onShowTooltip={showTooltip}
              onHideTooltip={hideTooltip}
            />
          </>
        )}
      </aside>

      {tooltip && collapsed && !mobile && (
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
