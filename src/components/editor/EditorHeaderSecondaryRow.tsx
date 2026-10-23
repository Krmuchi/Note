import React from 'react';
import type { FormatType } from '@/hooks/useEditorFormatting';
import { IconBtn } from './EditorHeaderIcon';
import { EditorHeaderCodeLangMenu } from './EditorHeaderCodeLangMenu';
import { EditorHeaderTableMenu } from './EditorHeaderTableMenu';
import { EditorHeaderFontSizeMenu } from './EditorHeaderFontSizeMenu';

/**
 * 工具栏「更多格式」浮层（语雀式的低频项收纳）。
 *
 * 为什么从"常驻第二行"改成浮层：
 * 常驻两行会把页头撑到 90px 以上，且第二行只有图标没有分组标题，
 * 用户既看不懂也不敢点。语雀的做法是主栏只放高频格式，低频项收进 `⋯` 浮层。
 * 浮层不受页头高度影响，也可以直接写分组标题（文字比图标更好认）。
 */
interface EditorHeaderSecondaryRowProps {
  applyFormat: (type: FormatType, options?: { language?: string; rows?: number; cols?: number }) => void;
  activeFormats: Set<string>;
  hideTableAndDivider: boolean;
  /** 字号（基础字号 / 选中文字字号） */
  fontSize: string;
  setFontSize: (size: string) => void;
  onFontSizeSelect?: (size: string) => void;
  showFontSizeMenu: boolean;
  setShowFontSizeMenu: (open: boolean) => void;
  fontSizeMenuRef: React.RefObject<HTMLDivElement | null>;
  /** 格式刷 */
  onFormatPainter?: () => void;
  formatPainterActive?: boolean;
  /** 选区 AI */
  onAiAction?: () => void;
  onClose: () => void;
  showCodeLangMenu: boolean;
  setShowCodeLangMenu: (open: boolean) => void;
  codeLangMenuRef: React.RefObject<HTMLDivElement | null>;
  showTableMenu: boolean;
  setShowTableMenu: (open: boolean) => void;
  tableMenuRef: React.RefObject<HTMLDivElement | null>;
}

export const EditorHeaderSecondaryRow: React.FC<EditorHeaderSecondaryRowProps> = ({
  applyFormat,
  activeFormats,
  hideTableAndDivider,
  fontSize,
  setFontSize,
  onFontSizeSelect,
  showFontSizeMenu,
  setShowFontSizeMenu,
  fontSizeMenuRef,
  onFormatPainter,
  formatPainterActive = false,
  onAiAction,
  onClose,
  showCodeLangMenu,
  setShowCodeLangMenu,
  codeLangMenuRef,
  showTableMenu,
  setShowTableMenu,
  tableMenuRef,
}) => (
  <div className="eh-format-popover" role="dialog" aria-label="更多格式">
    <div className="eh-format-popover-head">
      <span>更多格式</span>
      <button type="button" className="eh-format-popover-close" onClick={onClose} title="收起">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>

    <div className="eh-format-section">
      <span className="eh-format-label">文字</span>
      <div className="eh-format-row">
        <EditorHeaderFontSizeMenu
          open={showFontSizeMenu}
          setOpen={setShowFontSizeMenu}
          menuRef={fontSizeMenuRef}
          fontSize={fontSize}
          setFontSize={setFontSize}
          onFontSizeSelect={onFontSizeSelect}
        />
        {onFormatPainter && (
          <IconBtn
            title={formatPainterActive ? '格式刷已就绪：选中目标文本后再次点击应用' : '格式刷：复制当前行内格式'}
            onClick={onFormatPainter}
            active={formatPainterActive}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 4l2 2-9.5 9.5a2.12 2.12 0 0 1-3-3z" />
              <path d="M6 14c-1.5 1.5-1 4-1 4s2.5.5 4-1" />
            </svg>
          </IconBtn>
        )}
        {onAiAction && (
          <IconBtn title="AI 处理选中文本（润色 / 改写 / 扩写 / 总结 / 风格转换）" onClick={onAiAction}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" />
              <path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" />
            </svg>
          </IconBtn>
        )}
        <IconBtn title="清除格式" onClick={() => applyFormat('clearFormat')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21l9-9" />
            <path d="M12 12l4-4a2 2 0 0 1 3 3l-4 4" />
            <path d="M16 16l4 4" />
            <line x1="5" y1="5" x2="19" y2="19" />
          </svg>
        </IconBtn>
      </div>
    </div>

    <div className="eh-format-section">
      <span className="eh-format-label">段落与插入</span>
      <div className="eh-format-row">
        <IconBtn title="任务列表" onClick={() => applyFormat('tasklist')} active={activeFormats.has('tasklist')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </IconBtn>
        <IconBtn title="增加缩进" onClick={() => applyFormat('indent')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
            <line x1="3" y1="6" x2="3" y2="18" />
            <line x1="21" y1="6" x2="21" y2="18" />
          </svg>
        </IconBtn>
        <IconBtn title="减少缩进" onClick={() => applyFormat('outdent')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
            <line x1="3" y1="6" x2="3" y2="18" />
            <line x1="21" y1="6" x2="21" y2="18" />
          </svg>
        </IconBtn>
        <IconBtn title="引用块" onClick={() => applyFormat('quote')} active={activeFormats.has('quote')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
          </svg>
        </IconBtn>
        <EditorHeaderCodeLangMenu
          open={showCodeLangMenu}
          setOpen={setShowCodeLangMenu}
          menuRef={codeLangMenuRef}
          activeFormats={activeFormats}
          applyFormat={applyFormat}
        />
        <IconBtn title="插入图片" onClick={() => applyFormat('image')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </IconBtn>
        {!hideTableAndDivider && (
          <>
            <EditorHeaderTableMenu
              open={showTableMenu}
              setOpen={setShowTableMenu}
              menuRef={tableMenuRef}
              applyFormat={applyFormat}
            />
            <IconBtn title="分割线" onClick={() => applyFormat('divider')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </IconBtn>
          </>
        )}
      </div>
    </div>
  </div>
);
