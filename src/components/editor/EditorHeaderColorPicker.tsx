import React from 'react';
import type { FormatType } from '@/hooks/useEditorFormatting';

export type ColorTab = 'text' | 'highlight';

const TEXT_COLORS = [
  '#000000', '#262626', '#595959', '#8c8c8c', '#bfbfbf', '#1677ff', '#0958d9', '#003eb3',
  '#52c41a', '#389e0d', '#13c2c2', '#08979c', '#722ed1', '#531dab', '#eb2f96', '#c41d7f',
  '#fa8c16', '#d46b08', '#fa541c', '#d4380d', '#f5222d', '#cf1322', '#faad14', '#d48806',
];

const HIGHLIGHT_COLORS = [
  '#fff3a0', '#ffe58f', '#ffd591', '#ffbb96', '#ff9c6e', '#d9f7be', '#b7eb8f', '#95de64',
  '#91d5ff', '#69c0ff', '#40a9ff', '#1890ff', '#b5f5ec', '#87e8de', '#5cdbd3', '#36cfc9',
  '#d3adf7', '#b37feb', '#9254de', '#722ed1', '#efdbff', '#ffadd2', '#ff85c0', '#f759ab',
];

interface ColorPickerProps {
  tab: ColorTab | null;
  onTabChange: (tab: ColorTab) => void;
  onPick: (type: FormatType, color: string) => void;
  onClose: () => void;
  pickerRef: React.RefObject<HTMLDivElement | null>;
}

/** 编辑器文字颜色/背景高亮选择器 */
export const EditorHeaderColorPicker: React.FC<ColorPickerProps> = ({
  tab,
  onTabChange,
  onPick,
  onClose,
  pickerRef,
}) => {
  if (!tab) return null;
  const colors = tab === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS;
  return (
    <div className="eh-color-picker" ref={pickerRef}>
      <div className="eh-color-tabs">
        <button
          className={`eh-color-tab ${tab === 'text' ? 'active' : ''}`}
          onClick={() => onTabChange('text')}
        >
          文字颜色
        </button>
        <button
          className={`eh-color-tab ${tab === 'highlight' ? 'active' : ''}`}
          onClick={() => onTabChange('highlight')}
        >
          背景高亮
        </button>
      </div>
      <div className="eh-color-grid">
        {colors.map((color) => (
          <button
            key={color}
            className="eh-color-swatch"
            style={{ backgroundColor: color }}
            title={color}
            aria-label={color}
            onClick={() => {
              onPick(tab === 'text' ? 'textColor' : 'highlight', color);
              onClose();
            }}
          />
        ))}
      </div>
    </div>
  );
};
