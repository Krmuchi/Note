import React, { useState } from 'react';
import type { FormatType } from '@/hooks/useEditorFormatting';
import { IconBtn } from './EditorHeaderIcon';

/** EditorHeader 表格尺寸选择下拉菜单（8×10 网格）。从 EditorHeader.tsx 纯拆分，逻辑不变。 */

/** 表格尺寸选择器上限 */
const TABLE_MAX_ROWS = 8;
const TABLE_MAX_COLS = 10;

interface EditorHeaderTableMenuProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  applyFormat: (type: FormatType, options: { rows: number; cols: number }) => void;
  /** 渲染在「更多格式」溢出面板（role="menu"）内时，触发按钮需作为 menuitem */
  triggerRole?: 'menuitem';
}

export const EditorHeaderTableMenu: React.FC<EditorHeaderTableMenuProps> = ({
  open,
  setOpen,
  menuRef,
  applyFormat,
  triggerRole,
}) => {
  const [tableHover, setTableHover] = useState({ rows: 3, cols: 3 });

  return (
    <div className="eh-dropdown" ref={menuRef} role="none">
      <IconBtn
        title="表格（可选择行列数）"
        data-eh-menu-trigger onClick={() => setOpen(!open)}
        active={open}
        role={triggerRole}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      </IconBtn>
      {open && (
        <div className="eh-dropdown-menu eh-table-menu" role="menu" aria-label="表格尺寸">
          <div className="eh-table-grid" role="none" onMouseLeave={() => setTableHover({ rows: 3, cols: 3 })}>
            {Array.from({ length: TABLE_MAX_ROWS }).map((_, rowIdx) => (
              <div className="eh-table-grid-row" role="none" key={rowIdx}>
                {Array.from({ length: TABLE_MAX_COLS }).map((__, colIdx) => (
                  <button
                    key={colIdx}
                    type="button"
                    role="menuitem"
                    className={`eh-table-cell ${
                      rowIdx < tableHover.rows && colIdx < tableHover.cols ? 'active' : ''
                    }`}
                    onMouseEnter={() => setTableHover({ rows: rowIdx + 1, cols: colIdx + 1 })}
                    onClick={() => {
                      applyFormat('table', { rows: rowIdx + 1, cols: colIdx + 1 });
                      setOpen(false);
                    }}
                    aria-label={`插入 ${rowIdx + 1} 行 ${colIdx + 1} 列表格`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="eh-table-hint" role="none" aria-live="polite">
            {tableHover.rows} × {tableHover.cols} 表格
          </div>
        </div>
      )}
    </div>
  );
};
