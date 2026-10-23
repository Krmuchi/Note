import React from 'react';
import type { FormatType } from '@/hooks/useEditorFormatting';

/** EditorHeader 对齐方式下拉菜单。从 EditorHeader.tsx 纯拆分，逻辑不变。 */
interface EditorHeaderAlignMenuProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  applyFormat: (type: FormatType) => void;
}

export const EditorHeaderAlignMenu: React.FC<EditorHeaderAlignMenuProps> = ({
  open,
  setOpen,
  menuRef,
  applyFormat,
}) => (
  <div className="eh-dropdown" ref={menuRef}>
    <button
      className="eh-icon-btn eh-btn-text"
      onClick={() => setOpen(!open)}
      title="对齐方式"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="15" y2="12" />
        <line x1="3" y1="18" x2="18" y2="18" />
      </svg>
      <svg className="eh-arrow" viewBox="0 0 12 12" fill="currentColor"><path d="M3 5l3 3 3-3" /></svg>
    </button>
    {open && (
      <div className="eh-dropdown-menu eh-align-menu">
        <button className="eh-menu-item" onClick={() => { applyFormat('alignLeft'); setOpen(false); }}>
          <svg className="eh-menu-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" /></svg>
          左对齐
        </button>
        <button className="eh-menu-item" onClick={() => { applyFormat('alignCenter'); setOpen(false); }}>
          <svg className="eh-menu-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
          居中
        </button>
        <button className="eh-menu-item" onClick={() => { applyFormat('alignRight'); setOpen(false); }}>
          <svg className="eh-menu-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" /></svg>
          右对齐
        </button>
      </div>
    )}
  </div>
);