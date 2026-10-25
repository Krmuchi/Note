import React from 'react';
import { modKey } from '@/utils/platform';
import type { PreviewMode } from './Editor';

/**
 * 工具栏右侧控件：预览 / 专注 / 更多格式 / 收起工具栏。
 *
 * 「更多格式」与「收起工具栏」是两件不同的事（之前被合成一个按钮）：
 * - 更多格式：展开低频工具的下级菜单，工具栏仍在；
 * - 收起工具栏：整条工具栏收起来，只留下正文与标题栏，Esc 可再展开。
 */
interface EditorHeaderViewControlsProps {
  previewMode: PreviewMode;
  onTogglePreviewMode?: () => void;
  isFocusMode: boolean;
  onToggleFocusMode?: () => void;
  /** 低频格式溢出菜单是否打开 */
  overflowOpen: boolean;
  onToggleOverflow: () => void;
  /** 收起整条格式工具栏 */
  onCollapseToolbar: () => void;
  /** 窄窗口下有控件被自动收进溢出菜单（按钮上显示小圆点提示） */
  hasHiddenItems?: boolean;
}

export const EditorHeaderViewControls: React.FC<EditorHeaderViewControlsProps> = ({
  previewMode,
  onTogglePreviewMode,
  isFocusMode,
  onToggleFocusMode,
  overflowOpen,
  onToggleOverflow,
  onCollapseToolbar,
  hasHiddenItems = false,
}) => (
  <>
    {onTogglePreviewMode && (
      <button
        className={`eh-icon-btn eh-preview-btn ${previewMode !== 'edit' ? 'active' : ''}`}
        onClick={onTogglePreviewMode}
        title={`预览模式 (${modKey}+Shift+P)\n当前: ${previewMode === 'edit' ? '仅编辑' : previewMode === 'preview' ? '仅预览' : '分屏'}\n点击切换模式`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {previewMode === 'edit' ? (
            // 编辑图标：铅笔
            <>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </>
          ) : previewMode === 'preview' ? (
            // 预览图标：眼睛
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </>
          ) : (
            // 分屏图标：左右分割
            <>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="12" y1="3" x2="12" y2="21" />
              <line x1="3" y1="12" x2="12" y2="12" />
              <line x1="12" y1="12" x2="21" y2="12" />
            </>
          )}
        </svg>
      </button>
    )}
    {onToggleFocusMode && (
      <button
        className={`eh-icon-btn eh-focus-btn ${isFocusMode ? 'active' : ''}`}
        onClick={onToggleFocusMode}
        title={`专注模式 (${modKey}+Shift+E)\n${isFocusMode ? '退出专注模式' : '进入专注模式'}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    )}

    <span className="eh-divider" />

    <button
      type="button"
      className={`eh-icon-btn eh-overflow-btn ${overflowOpen ? 'active' : ''} ${hasHiddenItems ? 'has-hidden' : ''}`}
      onClick={onToggleOverflow}
      title="更多格式"
      aria-haspopup="menu"
      aria-expanded={overflowOpen}
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="5" cy="12" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="19" cy="12" r="1.8" />
      </svg>
    </button>

    <button
      type="button"
      className="eh-icon-btn eh-collapse-btn"
      onClick={onCollapseToolbar}
      title="收起工具栏 (Esc)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  </>
);
