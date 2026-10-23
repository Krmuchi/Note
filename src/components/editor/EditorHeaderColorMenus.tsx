import React from 'react';
import type { FormatType } from '@/hooks/useEditorFormatting';
import { EditorHeaderColorPicker, type ColorTab } from './EditorHeaderColorPicker';

/**
 * EditorHeader 文字颜色 / 背景高亮两个下拉入口（含共用的颜色选择器浮层）。
 * 从 EditorHeader.tsx 纯拆分，DOM/class/事件逻辑不变。
 */
interface EditorHeaderColorMenusProps {
  applyFormat: (type: FormatType, options: { color: string }) => void;
  showColorPicker: ColorTab | null;
  setShowColorPicker: (tab: ColorTab | null) => void;
  colorPickerRef: React.RefObject<HTMLDivElement | null>;
  /** 由父级提供的触发按钮 ref 注册函数（保持原有内联 ref 回调的挂载/卸载时机） */
  registerTriggerRef: (index: number) => (el: HTMLButtonElement | null) => void;
}

export const EditorHeaderColorMenus: React.FC<EditorHeaderColorMenusProps> = ({
  applyFormat,
  showColorPicker,
  setShowColorPicker,
  colorPickerRef,
  registerTriggerRef,
}) => {
  const renderColorPicker = (): React.JSX.Element => (
    <EditorHeaderColorPicker
      tab={showColorPicker}
      onTabChange={setShowColorPicker}
      onPick={(type, color) => applyFormat(type, { color })}
      onClose={() => setShowColorPicker(null)}
      pickerRef={colorPickerRef}
    />
  );

  return (
    <>
      <div className="eh-dropdown">
        <button
          ref={registerTriggerRef(0)}
          className="eh-icon-btn eh-btn-text eh-color-trigger"
          onClick={() => setShowColorPicker(showColorPicker === 'text' ? null : 'text')}
          title="文字颜色"
        >
          <span className="eh-color-letter">A</span>
          <span className="eh-color-underline" />
          <svg className="eh-arrow" viewBox="0 0 12 12" fill="currentColor"><path d="M3 5l3 3 3-3" /></svg>
        </button>
        {showColorPicker === 'text' && renderColorPicker()}
      </div>

      <div className="eh-dropdown">
        <button
          ref={registerTriggerRef(1)}
          className="eh-icon-btn eh-color-trigger"
          onClick={() => setShowColorPicker(showColorPicker === 'highlight' ? null : 'highlight')}
          title="高亮颜色"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l-6 6v3h3l6-6" />
            <path d="M14 6l3.5-3.5a2.12 2.12 0 0 1 3 3L17 9z" />
            <path d="M9 11l5 5" />
          </svg>
          <svg className="eh-arrow" viewBox="0 0 12 12" fill="currentColor"><path d="M3 5l3 3 3-3" /></svg>
        </button>
        {showColorPicker === 'highlight' && renderColorPicker()}
      </div>
    </>
  );
};