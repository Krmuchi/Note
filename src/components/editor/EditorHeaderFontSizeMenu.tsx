import React from 'react';

/** EditorHeader 字号下拉菜单。从 EditorHeader.tsx 纯拆分，逻辑不变。 */

const FONT_SIZE_OPTIONS = ['12px', '13px', '14px', '15px', '16px', '18px', '20px'];

interface EditorHeaderFontSizeMenuProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  fontSize: string;
  setFontSize: (size: string) => void;
  /** 有选区时作用于选中文本，无选区时回退 setFontSize 调整基础字号 */
  onFontSizeSelect?: (size: string) => void;
  /** 渲染在「更多格式」溢出面板（role="menu"）内时，触发按钮需作为 menuitem */
  triggerRole?: 'menuitem';
}

export const EditorHeaderFontSizeMenu: React.FC<EditorHeaderFontSizeMenuProps> = ({
  open,
  setOpen,
  menuRef,
  fontSize,
  setFontSize,
  onFontSizeSelect,
  triggerRole,
}) => (
  <div className="eh-dropdown" ref={menuRef} role="none">
    <button
      type="button"
      className="eh-icon-btn eh-btn-text"
      data-eh-menu-trigger onClick={() => setOpen(!open)}
      title="字号"
      aria-label="字号"
      role={triggerRole}
      aria-haspopup="menu"
      aria-expanded={open}
    >
      {fontSize.replace('px', '')}
      <svg className="eh-arrow" viewBox="0 0 12 12" fill="currentColor"><path d="M3 5l3 3 3-3" /></svg>
    </button>
    {open && (
      <div className="eh-dropdown-menu eh-fontsize-menu" role="menu" aria-label="字号">
        {FONT_SIZE_OPTIONS.map((val) => (
          <button
            key={val}
            type="button"
            role="menuitem"
            className={`eh-menu-item ${fontSize === val ? 'active' : ''}`}
            onClick={() => {
              if (onFontSizeSelect) {
                onFontSizeSelect(val);
              } else {
                setFontSize(val);
              }
              setOpen(false);
            }}
          >
            {val}
          </button>
        ))}
      </div>
    )}
  </div>
);
