import React from 'react';
import type { FormatType } from '@/hooks/useEditorFormatting';
import type { ColorTab } from '@/types';
import { IconBtn } from './EditorHeaderIcon';
import { EditorHeaderCodeLangMenu } from './EditorHeaderCodeLangMenu';
import { EditorHeaderTableMenu } from './EditorHeaderTableMenu';
import { EditorHeaderFontSizeMenu } from './EditorHeaderFontSizeMenu';
import { EditorHeaderColorMenus } from './EditorHeaderColorMenus';
import { EditorHeaderAlignMenu } from './EditorHeaderAlignMenu';
import { EditorHeaderListMenu } from './EditorHeaderListMenu';

/**
 * 工具栏「更多格式」溢出菜单（语雀式下级菜单）。
 *
 * 旧实现是一个带标题栏和分组文字的"更多格式"面板：点右上角 ⋯ 会弹出一整块
 * 设置面板，看起来与工具栏是两套东西。语雀的收折是把低频工具收进一个紧凑的
 * 下级菜单，本体仍是工具栏。这里改成三行图标组，无标题、无关闭按钮，
 * 点外部或 Esc 关闭；执行动作后自动收起。
 */
interface EditorToolbarOverflowProps {
  applyFormat: (
    type: FormatType,
    options?: { color?: string; size?: string; rows?: number; cols?: number; language?: string; callout?: string },
  ) => void;
  activeFormats: Set<string>;
  fontSize: string;
  setFontSize: (size: string) => void;
  onFontSizeSelect?: (size: string) => void;
  showFontSizeMenu: boolean;
  setShowFontSizeMenu: (open: boolean) => void;
  fontSizeMenuRef: React.RefObject<HTMLDivElement | null>;
  onFormatPainter?: () => void;
  formatPainterActive?: boolean;
  onAiAction?: () => void;
  showCodeLangMenu: boolean;
  setShowCodeLangMenu: (open: boolean) => void;
  codeLangMenuRef: React.RefObject<HTMLDivElement | null>;
  showTableMenu: boolean;
  setShowTableMenu: (open: boolean) => void;
  tableMenuRef: React.RefObject<HTMLDivElement | null>;
  /** 执行任意动作后收起溢出菜单 */
  onAction?: () => void;

  /* 窄窗口下从主工具栏自动收进来的控件 */
  foldedColors: boolean;
  foldedAlign: boolean;
  foldedList: boolean;
  foldedLink: boolean;
  showColorPicker: ColorTab | null;
  setShowColorPicker: React.Dispatch<React.SetStateAction<ColorTab | null>>;
  colorPickerRef: React.RefObject<HTMLDivElement | null>;
  registerColorTriggerRef: (index: number) => (el: HTMLButtonElement | null) => void;
  showAlignMenu: boolean;
  setShowAlignMenu: (open: boolean) => void;
  alignMenuRef: React.RefObject<HTMLDivElement | null>;
  showListMenu: boolean;
  setShowListMenu: (open: boolean) => void;
  listMenuRef: React.RefObject<HTMLDivElement | null>;
}

export const EditorToolbarOverflow: React.FC<EditorToolbarOverflowProps> = ({
  applyFormat,
  activeFormats,
  fontSize,
  setFontSize,
  onFontSizeSelect,
  showFontSizeMenu,
  setShowFontSizeMenu,
  fontSizeMenuRef,
  onFormatPainter,
  formatPainterActive = false,
  onAiAction,
  showCodeLangMenu,
  setShowCodeLangMenu,
  codeLangMenuRef,
  showTableMenu,
  setShowTableMenu,
  tableMenuRef,
  onAction,
  foldedColors,
  foldedAlign,
  foldedList,
  foldedLink,
  showColorPicker,
  setShowColorPicker,
  colorPickerRef,
  registerColorTriggerRef,
  showAlignMenu,
  setShowAlignMenu,
  alignMenuRef,
  showListMenu,
  setShowListMenu,
  listMenuRef,
}) => {
  /** 一次性动作：先收起菜单，再执行（选中文字的操作需要菜单先让位） */
  const run = (
    type: FormatType,
    options?: { color?: string; size?: string; rows?: number; cols?: number; language?: string; callout?: string },
  ): void => {
    onAction?.();
    applyFormat(type, options);
  };
  const runPainter = (): void => {
    onAction?.();
    onFormatPainter?.();
  };
  const runAi = (): void => {
    onAction?.();
    onAiAction?.();
  };
  const runFontSize = (size: string): void => {
    onAction?.();
    setFontSize(size);
  };
  const runFontSizeSelect = (size: string): void => {
    onAction?.();
    onFontSizeSelect?.(size);
  };

  return (
    <div className="eh-overflow-popover" role="menu" aria-label="更多格式">
      {(foldedColors || foldedAlign || foldedList || foldedLink) && (
        <>
          <div className="eh-overflow-group">
            {foldedColors && (
              <EditorHeaderColorMenus
                applyFormat={run}
                showColorPicker={showColorPicker}
                setShowColorPicker={setShowColorPicker}
                colorPickerRef={colorPickerRef}
                registerTriggerRef={registerColorTriggerRef}
              />
            )}
            {foldedAlign && (
              <EditorHeaderAlignMenu
                open={showAlignMenu}
                setOpen={setShowAlignMenu}
                menuRef={alignMenuRef}
                applyFormat={run}
              />
            )}
            {foldedList && (
              <EditorHeaderListMenu
                open={showListMenu}
                setOpen={setShowListMenu}
                menuRef={listMenuRef}
                activeFormats={activeFormats}
                applyFormat={run}
              />
            )}
            {foldedLink && (
              <IconBtn title="插入链接" onClick={() => run('link')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </IconBtn>
            )}
          </div>
          <div className="eh-overflow-sep" />
        </>
      )}

      <div className="eh-overflow-group">
        <EditorHeaderFontSizeMenu
          open={showFontSizeMenu}
          setOpen={setShowFontSizeMenu}
          menuRef={fontSizeMenuRef}
          fontSize={fontSize}
          setFontSize={runFontSize}
          onFontSizeSelect={runFontSizeSelect}
        />
        {onFormatPainter && (
          <IconBtn
            title={formatPainterActive ? '格式刷已就绪：选中目标文本后再次点击应用' : '格式刷：复制当前行内格式'}
            onClick={runPainter}
            active={formatPainterActive}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 4l2 2-9.5 9.5a2.12 2.12 0 0 1-3-3z" />
              <path d="M6 14c-1.5 1.5-1 4-1 4s2.5.5 4-1" />
            </svg>
          </IconBtn>
        )}
        {onAiAction && (
          <IconBtn title="AI 处理选中文本（润色 / 改写 / 扩写 / 总结 / 风格转换）" onClick={runAi}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" />
              <path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" />
            </svg>
          </IconBtn>
        )}
        <IconBtn title="清除格式" onClick={() => run('clearFormat')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21l9-9" />
            <path d="M12 12l4-4a2 2 0 0 1 3 3l-4 4" />
            <path d="M16 16l4 4" />
            <line x1="5" y1="5" x2="19" y2="19" />
          </svg>
        </IconBtn>
      </div>

      <div className="eh-overflow-sep" />

      <div className="eh-overflow-group">
        <IconBtn title="任务列表" onClick={() => run('tasklist')} active={activeFormats.has('tasklist')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </IconBtn>
        <IconBtn title="增加缩进" onClick={() => run('indent')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
            <line x1="3" y1="6" x2="3" y2="18" />
            <line x1="21" y1="6" x2="21" y2="18" />
          </svg>
        </IconBtn>
        <IconBtn title="减少缩进" onClick={() => run('outdent')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
            <line x1="3" y1="6" x2="3" y2="18" />
            <line x1="21" y1="6" x2="21" y2="18" />
          </svg>
        </IconBtn>
        <IconBtn title="引用块" onClick={() => run('quote')} active={activeFormats.has('quote')}>
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
          applyFormat={run}
        />
        <IconBtn title="插入图片" onClick={() => run('image')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </IconBtn>
      </div>

      <div className="eh-overflow-sep" />

      <div className="eh-overflow-group">
        <EditorHeaderTableMenu
          open={showTableMenu}
          setOpen={setShowTableMenu}
          menuRef={tableMenuRef}
          applyFormat={run}
        />
        <IconBtn title="分割线" onClick={() => run('divider')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </IconBtn>
      </div>
    </div>
  );
};
