import React from 'react';
import type { FormatType } from '@/hooks/useEditorFormatting';

/** EditorHeader 段落样式（标题级别）下拉菜单。从 EditorHeader.tsx 纯拆分，逻辑不变。 */

type HeadingLevel = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

const HEADING_LEVELS = [
  { level: 'h1', format: 'heading1', label: '标题 1' },
  { level: 'h2', format: 'heading2', label: '标题 2' },
  { level: 'h3', format: 'heading3', label: '标题 3' },
  { level: 'h4', format: 'heading4', label: '标题 4' },
  { level: 'h5', format: 'heading5', label: '标题 5' },
  { level: 'h6', format: 'heading6', label: '标题 6' },
] as const;

interface EditorHeaderHeadingMenuProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  activeFormats: Set<string>;
  applyFormat: (type: FormatType) => void;
}

export const EditorHeaderHeadingMenu: React.FC<EditorHeaderHeadingMenuProps> = ({
  open,
  setOpen,
  menuRef,
  activeFormats,
  applyFormat,
}) => {
  const currentHeading = (): HeadingLevel => {
    for (const { level, format } of HEADING_LEVELS) {
      if (activeFormats.has(format)) return level;
    }
    return 'paragraph';
  };

  const handleHeadingSelect = (level: HeadingLevel): void => {
    // 先清除现有标题标记（applyFormat 对标题是切换语义），paragraph 则仅清除
    HEADING_LEVELS.forEach(({ format }) => {
      if (activeFormats.has(format)) applyFormat(format);
    });
    if (level !== 'paragraph') {
      const target = `heading${level[1]}` as 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6';
      if (!activeFormats.has(target)) applyFormat(target);
    }
    setOpen(false);
  };

  const headingLabel = (): string => {
    const h = currentHeading();
    return h === 'paragraph' ? '正文' : h.toUpperCase();
  };

  return (
    <div className="eh-dropdown" ref={menuRef}>
      <button
        className={`eh-icon-btn eh-btn-text ${currentHeading() !== 'paragraph' ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        title="段落样式"
      >
        {headingLabel()}
        <svg className="eh-arrow" viewBox="0 0 12 12" fill="currentColor"><path d="M3 5l3 3 3-3" /></svg>
      </button>
      {open && (
        <div className="eh-dropdown-menu eh-heading-menu">
          <button className={`eh-menu-item ${currentHeading() === 'paragraph' ? 'active' : ''}`} onClick={() => handleHeadingSelect('paragraph')}>
            <span className="eh-heading-p">正文</span>
          </button>
          {HEADING_LEVELS.map((h) => (
            <button
              key={h.level}
              className={`eh-menu-item ${currentHeading() === h.level ? 'active' : ''}`}
              onClick={() => handleHeadingSelect(h.level)}
            >
              <span className={`eh-heading-${h.level}`}>{h.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};