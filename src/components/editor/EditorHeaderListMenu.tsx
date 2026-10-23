import React from 'react';
import type { FormatType } from '@/hooks/useEditorFormatting';

/** EditorHeader 列表下拉菜单（无序/有序/任务）。从 EditorHeader.tsx 纯拆分，逻辑不变。 */
interface EditorHeaderListMenuProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  activeFormats: Set<string>;
  applyFormat: (type: FormatType) => void;
}

export const EditorHeaderListMenu: React.FC<EditorHeaderListMenuProps> = ({
  open,
  setOpen,
  menuRef,
  activeFormats,
  applyFormat,
}) => (
  <div className="eh-dropdown" ref={menuRef}>
    <button
      className={`eh-icon-btn ${activeFormats.has('ulist') || activeFormats.has('olist') ? 'active' : ''}`}
      onClick={() => setOpen(!open)}
      title="列表"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <circle cx="4" cy="6" r="1" fill="currentColor" />
        <circle cx="4" cy="12" r="1" fill="currentColor" />
        <circle cx="4" cy="18" r="1" fill="currentColor" />
      </svg>
      <svg className="eh-arrow" viewBox="0 0 12 12" fill="currentColor"><path d="M3 5l3 3 3-3" /></svg>
    </button>
    {open && (
      <div className="eh-dropdown-menu eh-list-menu">
        <button className={`eh-menu-item ${activeFormats.has('ulist') ? 'active' : ''}`} onClick={() => { applyFormat('ulist'); setOpen(false); }}>
          <svg className="eh-menu-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>
          无序列表
        </button>
        <button className={`eh-menu-item ${activeFormats.has('olist') ? 'active' : ''}`} onClick={() => { applyFormat('olist'); setOpen(false); }}>
          <svg className="eh-menu-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none">1</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none">2</text><text x="2" y="20" fontSize="8" fill="currentColor" stroke="none">3</text></svg>
          有序列表
        </button>
        <button className="eh-menu-item" onClick={() => { applyFormat('tasklist'); setOpen(false); }}>
          <svg className="eh-menu-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          任务列表
        </button>
      </div>
    )}
  </div>
);