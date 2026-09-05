import React, { useCallback } from 'react';
import type { LeftMenuType, ViewType } from '@/hooks/useUIState';

interface NavItem {
  id: LeftMenuType;
  icon: string;
  label: string;
}

interface SidebarNavProps {
  activeLeftMenu: LeftMenuType;
  onLeftMenuChange: (menu: LeftMenuType) => void;
  onViewChange: (view: ViewType) => void;
  tags: { id: string; name: string }[];
  collapsed: boolean;
  onShowTooltip: (text: string, e: React.MouseEvent) => void;
  onHideTooltip: () => void;
  onExpand: () => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeLeftMenu,
  onLeftMenuChange,
  onViewChange,
  tags,
  collapsed,
  onShowTooltip,
  onHideTooltip,
  onExpand,
}) => {
  const handleNavItemClick = useCallback((menu: LeftMenuType) => {
    if (collapsed) {
      onExpand();
    }
    onLeftMenuChange(menu);
    if (menu === 'favorite') {
      onViewChange('favorite');
    }
  }, [collapsed, onExpand, onLeftMenuChange, onViewChange]);

  const navItems: NavItem[] = [
    { id: 'start', icon: 'home', label: '开始' },
    { id: 'note', icon: 'note', label: '小记' },
    { id: 'favorite', icon: 'star', label: '收藏' },
    { id: 'tags', icon: 'tag', label: '标签' },
  ];

  return (
    <nav className="sidebar-nav" role="menubar">
      {navItems.map(item => (
        <button
          key={item.id}
          className={`nav-item ${activeLeftMenu === item.id ? 'active' : ''}`}
          onClick={() => handleNavItemClick(item.id)}
          role="menuitem"
          aria-current={activeLeftMenu === item.id ? 'page' : undefined}
          onMouseEnter={(e) => collapsed && onShowTooltip(item.label, e)}
          onMouseLeave={onHideTooltip}
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
  );
};

export default SidebarNav;
