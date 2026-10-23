import React, { useCallback } from 'react';
import type { FormatType } from '@/hooks/useEditorFormatting';

/** EditorHeader「添加内容」快速插入下拉菜单。从 EditorHeader.tsx 纯拆分，DOM/class/事件逻辑不变。 */
interface EditorHeaderAddMenuProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  applyFormat: (type: FormatType) => void;
}

export const EditorHeaderAddMenu: React.FC<EditorHeaderAddMenuProps> = ({
  open,
  setOpen,
  menuRef,
  applyFormat,
}) => {
  const handleAddAction = useCallback((action: () => void) => {
    action();
    setOpen(false);
  }, [setOpen]);

  return (
    <div className="eh-dropdown" ref={menuRef}>
      <button
        className="eh-add-btn"
        title="添加内容"
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      {open && (
        <div className="eh-dropdown-menu eh-add-menu">
          <div className="eh-menu-group">
            <div className="eh-group-label">基础块</div>
            <button className="eh-menu-item" onClick={() => handleAddAction(() => applyFormat('heading1'))}>
              <span className="eh-menu-icon">H1</span>标题 1
            </button>
            <button className="eh-menu-item" onClick={() => handleAddAction(() => applyFormat('heading2'))}>
              <span className="eh-menu-icon">H2</span>标题 2
            </button>
            <button className="eh-menu-item" onClick={() => handleAddAction(() => applyFormat('ulist'))}>
              <span className="eh-menu-icon">•</span>无序列表
            </button>
            <button className="eh-menu-item" onClick={() => handleAddAction(() => applyFormat('tasklist'))}>
              <span className="eh-menu-icon">☑</span>任务列表
            </button>
            <button className="eh-menu-item" onClick={() => handleAddAction(() => applyFormat('quote'))}>
              <span className="eh-menu-icon">❝</span>引用块
            </button>
            <button className="eh-menu-item" onClick={() => handleAddAction(() => applyFormat('callout'))}>
              <span className="eh-menu-icon">💡</span>提示块
            </button>
            <button className="eh-menu-item" onClick={() => handleAddAction(() => applyFormat('codeblock'))}>
              <span className="eh-menu-icon">&lt;/&gt;</span>代码块
            </button>
            <button className="eh-menu-item" onClick={() => handleAddAction(() => applyFormat('divider'))}>
              <span className="eh-menu-icon">—</span>分割线
            </button>
            <button className="eh-menu-item" onClick={() => handleAddAction(() => applyFormat('table'))}>
              <span className="eh-menu-icon">⊞</span>表格
            </button>
          </div>

          {/* 媒体与高级块：预览侧早已支持，缺的一直是插入入口 */}
          <div className="eh-menu-divider" />
          <div className="eh-menu-group">
            <div className="eh-group-label">媒体与高级</div>
            <button className="eh-menu-item" onClick={() => handleAddAction(() => applyFormat('image'))}>
              <span className="eh-menu-icon">🖼</span>图片
            </button>
            <button className="eh-menu-item" onClick={() => handleAddAction(() => applyFormat('math'))}>
              <span className="eh-menu-icon">∑</span>公式（LaTeX）
            </button>
            <button className="eh-menu-item" onClick={() => handleAddAction(() => applyFormat('mermaid'))}>
              <span className="eh-menu-icon">◇</span>流程图（Mermaid）
            </button>
          </div>
        </div>
      )}
    </div>
  );
};