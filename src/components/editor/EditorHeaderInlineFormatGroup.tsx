import React from 'react';
import { modKey } from '@/utils/platform';
import type { FormatType } from '@/hooks/useEditorFormatting';
import { IconBtn } from './EditorHeaderIcon';

/** EditorHeader 行内格式按钮组（粗体/斜体/删除线/下划线/行内代码）。从 EditorHeader.tsx 纯拆分，逻辑不变。 */
interface EditorHeaderInlineFormatGroupProps {
  activeFormats: Set<string>;
  applyFormat: (type: FormatType) => void;
}

export const EditorHeaderInlineFormatGroup: React.FC<EditorHeaderInlineFormatGroupProps> = ({
  activeFormats,
  applyFormat,
}) => (
  <>
    <IconBtn title={`粗体 (${modKey}+B)`} onClick={() => applyFormat('bold')} active={activeFormats.has('bold')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
        <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
      </svg>
    </IconBtn>
    <IconBtn title={`斜体 (${modKey}+I)`} onClick={() => applyFormat('italic')} active={activeFormats.has('italic')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="4" x2="10" y2="4" />
        <line x1="14" y1="20" x2="5" y2="20" />
        <line x1="15" y1="4" x2="9" y2="20" />
      </svg>
    </IconBtn>
    <IconBtn title={`删除线 (${modKey}+Shift+X)`} onClick={() => applyFormat('strike')} active={activeFormats.has('strike')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4H9a3 3 0 0 0-3 3 3 3 0 0 0 3 3h6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <path d="M15 12a3 3 0 1 1 0 6H8" />
      </svg>
    </IconBtn>
    <IconBtn title={`下划线 (${modKey}+U)`} onClick={() => applyFormat('underline')} active={activeFormats.has('underline')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3v7a6 6 0 0 0 12 0V3" />
        <line x1="4" y1="21" x2="20" y2="21" />
      </svg>
    </IconBtn>
    <IconBtn title={`行内代码 (${modKey}+E)`} onClick={() => applyFormat('code')} active={activeFormats.has('code')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    </IconBtn>
  </>
);