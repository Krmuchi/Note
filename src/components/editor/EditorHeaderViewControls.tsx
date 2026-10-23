import React from 'react';
import { modKey } from '@/utils/platform';
import type { PreviewMode } from './Editor';

/**
 * EditorHeader 主工具栏右侧：预览模式 / 专注模式 / 展开收敛按钮。
 * 从 EditorHeader.tsx 纯拆分，DOM/class/事件逻辑不变。
 */
interface EditorHeaderViewControlsProps {
  previewMode: PreviewMode;
  onTogglePreviewMode?: () => void;
  isFocusMode: boolean;
  onToggleFocusMode?: () => void;
  isMobile: boolean;
  toolbarExpanded: boolean;
  effectiveExpanded: boolean;
  setToolbarExpanded: (expanded: boolean) => void;
}

export const EditorHeaderViewControls: React.FC<EditorHeaderViewControlsProps> = ({
  previewMode,
  onTogglePreviewMode,
  isFocusMode,
  onToggleFocusMode,
  isMobile,
  toolbarExpanded,
  effectiveExpanded,
  setToolbarExpanded,
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
    <button
      className="eh-icon-btn eh-expand-btn"
      onClick={() => !isMobile && setToolbarExpanded(!toolbarExpanded)}
      disabled={isMobile}
      title={isMobile ? '窗口过窄，暂不支持展开' : (effectiveExpanded ? '收起工具栏' : '展开工具栏')}
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="19" r="2" />
      </svg>
    </button>
  </>
);
