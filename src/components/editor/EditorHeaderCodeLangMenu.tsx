import React from 'react';
import type { FormatType } from '@/hooks/useEditorFormatting';
import { IconBtn } from './EditorHeaderIcon';

/** EditorHeader 代码块语言下拉菜单。从 EditorHeader.tsx 纯拆分，逻辑不变。 */

/** 代码块语言（value 为空表示无语言围栏） */
const CODE_LANGUAGES: { value: string; label: string }[] = [
  { value: '', label: '纯文本' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'json', label: 'JSON' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'yaml', label: 'YAML' },
  { value: 'mermaid', label: 'Mermaid 图表' },
];

interface EditorHeaderCodeLangMenuProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  activeFormats: Set<string>;
  applyFormat: (type: FormatType, options: { language: string }) => void;
  /** 渲染在「更多格式」溢出面板（role="menu"）内时，触发按钮需作为 menuitem */
  triggerRole?: 'menuitem';
}

export const EditorHeaderCodeLangMenu: React.FC<EditorHeaderCodeLangMenuProps> = ({
  open,
  setOpen,
  menuRef,
  activeFormats,
  applyFormat,
  triggerRole,
}) => (
  <div className="eh-dropdown" ref={menuRef} role="none">
    <IconBtn
      title="代码块（可选择语言）"
      data-eh-menu-trigger onClick={() => setOpen(!open)}
      active={activeFormats.has('codeblock') || open}
      role={triggerRole}
      aria-haspopup="menu"
      aria-expanded={open}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <polyline points="9 8 5 12 9 16" />
        <polyline points="15 8 19 12 15 16" />
      </svg>
    </IconBtn>
    {open && (
      <div className="eh-dropdown-menu eh-codelang-menu" role="menu" aria-label="代码块语言">
        <div className="eh-group-label" role="presentation">代码块语言</div>
        {CODE_LANGUAGES.map(lang => (
          <button
            key={lang.value || 'plain'}
            type="button"
            role="menuitem"
            className="eh-menu-item"
            onClick={() => {
              applyFormat('codeblock', { language: lang.value });
              setOpen(false);
            }}
          >
            {lang.label}
          </button>
        ))}
      </div>
    )}
  </div>
);
