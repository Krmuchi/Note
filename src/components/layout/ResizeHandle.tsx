import React from 'react';

interface ResizeHandleProps {
  onResizeStart: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  dragging?: boolean;
  variant?: 'sidebar' | 'docs';
  ariaLabel?: string;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  onResizeStart,
  onDoubleClick,
  collapsed = false,
  onToggleCollapse,
  dragging = false,
  variant = 'docs',
  ariaLabel = '调整面板大小',
}) => {
  const showCollapseBtn = variant === 'sidebar' && typeof onToggleCollapse === 'function';

  return (
    <div
      className={`resize-handle ${dragging ? 'dragging' : ''} resize-handle-${variant} ${
        collapsed ? 'is-collapsed' : ''
      }`}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onMouseDown={onResizeStart}
      onDoubleClick={onDoubleClick}
    >
      <span className="resize-handle-bar" />
      {showCollapseBtn && (
        <button
          type="button"
          className="resize-handle-collapse-btn"
          title={collapsed ? '展开侧栏' : '折叠侧栏'}
          aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse?.();
          }}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      )}
    </div>
  );
};