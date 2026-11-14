import React from 'react';
import type { FormatType } from '@/hooks/useEditorFormatting';
import type { ColorTab } from '@/types';

/* ColorTab 已下沉到 @/types（hooks 需要它，但不该 import 组件模块）。
   这里重新导出，保持既有 import 路径可用。 */
export type { ColorTab };

/** 文字颜色（值 → 可读名称；顺序与 TEXT_COLORS 一致） */
const TEXT_COLORS: { value: string; name: string }[] = [
  { value: '#000000', name: '黑色' },
  { value: '#262626', name: '深灰' },
  { value: '#595959', name: '灰色' },
  { value: '#8c8c8c', name: '浅灰' },
  { value: '#bfbfbf', name: '银灰' },
  { value: '#1677ff', name: '天蓝' },
  { value: '#0958d9', name: '蓝色' },
  { value: '#003eb3', name: '深蓝' },
  { value: '#52c41a', name: '草绿' },
  { value: '#389e0d', name: '深绿' },
  { value: '#13c2c2', name: '青色' },
  { value: '#08979c', name: '深青' },
  { value: '#722ed1', name: '紫色' },
  { value: '#531dab', name: '深紫' },
  { value: '#eb2f96', name: '玫红' },
  { value: '#c41d7f', name: '深玫红' },
  { value: '#fa8c16', name: '橙色' },
  { value: '#d46b08', name: '深橙' },
  { value: '#fa541c', name: '桔红' },
  { value: '#d4380d', name: '深桔红' },
  { value: '#f5222d', name: '红色' },
  { value: '#cf1322', name: '深红' },
  { value: '#faad14', name: '金色' },
  { value: '#d48806', name: '深金' },
];

/** 背景高亮色（值 → 可读名称） */
const HIGHLIGHT_COLORS: { value: string; name: string }[] = [
  { value: '#fff3a0', name: '浅黄' },
  { value: '#ffe58f', name: '杏黄' },
  { value: '#ffd591', name: '浅橙' },
  { value: '#ffbb96', name: '浅桔' },
  { value: '#ff9c6e', name: '桔粉' },
  { value: '#d9f7be', name: '浅绿' },
  { value: '#b7eb8f', name: '嫩绿' },
  { value: '#95de64', name: '草绿' },
  { value: '#91d5ff', name: '浅蓝' },
  { value: '#69c0ff', name: '天蓝' },
  { value: '#40a9ff', name: '亮蓝' },
  { value: '#1890ff', name: '蓝色' },
  { value: '#b5f5ec', name: '浅青' },
  { value: '#87e8de', name: '青绿' },
  { value: '#5cdbd3', name: '青色' },
  { value: '#36cfc9', name: '深青' },
  { value: '#d3adf7', name: '浅紫' },
  { value: '#b37feb', name: '淡紫' },
  { value: '#9254de', name: '紫色' },
  { value: '#722ed1', name: '深紫' },
  { value: '#efdbff', name: '藕紫' },
  { value: '#ffadd2', name: '浅粉' },
  { value: '#ff85c0', name: '粉色' },
  { value: '#f759ab', name: '玫红' },
];

interface ColorPickerProps {
  tab: ColorTab | null;
  onTabChange: (tab: ColorTab) => void;
  onPick: (type: FormatType, color: string) => void;
  onClose: () => void;
  pickerRef: React.RefObject<HTMLDivElement | null>;
}

/** 颜色 Tab 的中文名，作为色块可及名的前缀 */
const TAB_LABEL: Record<ColorTab, string> = {
  text: '文字颜色',
  highlight: '背景高亮',
};

/** 编辑器文字颜色 / 背景高亮选择器 */
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
      <div className="eh-color-tabs" role="group" aria-label="颜色类型">
        <button
          type="button"
          aria-pressed={tab === 'text'}
          className={`eh-color-tab ${tab === 'text' ? 'active' : ''}`}
          onClick={() => onTabChange('text')}
        >
          文字颜色
        </button>
        <button
          type="button"
          aria-pressed={tab === 'highlight'}
          className={`eh-color-tab ${tab === 'highlight' ? 'active' : ''}`}
          onClick={() => onTabChange('highlight')}
        >
          背景高亮
        </button>
      </div>
      <div className="eh-color-grid" role="group" aria-label={`${TAB_LABEL[tab]}色块`}>
        {colors.map(({ value, name }) => (
          <button
            key={value}
            type="button"
            className="eh-color-swatch"
            style={{ backgroundColor: value }}
            /* 可及名用「文字颜色 浅黄」这类有意义的名字，十六进制值只在 title 里作补充 */
            title={`${TAB_LABEL[tab]} ${name}（${value}）`}
            aria-label={`${TAB_LABEL[tab]} ${name}`}
            onClick={() => {
              onPick(tab === 'text' ? 'textColor' : 'highlight', value);
              onClose();
            }}
          />
        ))}
      </div>
    </div>
  );
};
