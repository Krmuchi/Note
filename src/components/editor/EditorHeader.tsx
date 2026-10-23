import React, { useRef, useCallback, useEffect, memo } from 'react';
import type { NoteDoc } from '@/types';
import type { SaveStatus } from '@/store';
import { useTheme } from '@/shared/hooks';
import { modKey } from '@/utils/platform';
import type { FormatType } from '@/hooks/useEditorFormatting';
import type { PreviewMode } from './Editor';
import { useResponsiveToolbar } from '@/hooks/useResponsiveToolbar';
import { useEditorHeaderMenus } from '@/hooks/useEditorHeaderMenus';
import { IconBtn } from './EditorHeaderIcon';
import { EditorHeaderAddMenu } from './EditorHeaderAddMenu';
import { EditorHeaderTitleBar } from './EditorHeaderTitleBar';
import { EditorHeaderHeadingMenu } from './EditorHeaderHeadingMenu';
import { EditorHeaderInlineFormatGroup } from './EditorHeaderInlineFormatGroup';
import { EditorHeaderColorMenus } from './EditorHeaderColorMenus';
import { EditorHeaderAlignMenu } from './EditorHeaderAlignMenu';
import { EditorHeaderListMenu } from './EditorHeaderListMenu';
import { EditorHeaderViewControls } from './EditorHeaderViewControls';
import { EditorHeaderSecondaryRow } from './EditorHeaderSecondaryRow';
import { exportCurrentDocAsHtml, exportCurrentDocAsPdf, exportCurrentDocAsMarkdown, exportCurrentNotebookAsZip, printCurrentDoc } from './editorHeaderExports';
import { useAsyncAction } from '@/hooks/useAsyncAction';

interface EditorHeaderProps {
  /** 仅传必要的展示字段而非整个 activeDoc，配合 React.memo 避免击键链路全量重渲染 */
  docTitle: string;
  isFavorite: boolean;
  activeNotebookId: string;
  activeDocId: string;
  saveStatus: SaveStatus;
  fontSize: string;
  showPresentationMenu: boolean;
  updateDocContent: (updates: Partial<NoteDoc>) => void;
  toggleFavorite: (notebookId: string, docId: string) => void;
  handleCopyLink: () => void;
  setShowSharePanel: (show: boolean) => void;
  setShowPresentationMenu: (show: boolean) => void;
  setFontSize: (size: string) => void;
  /** 字号菜单选择：有选区时作用于选中文本，无选区时回退 setFontSize 调整基础字号 */
  onFontSizeSelect?: (size: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onStartPresentation?: () => void;
  onShowVersionHistory?: () => void;
  applyFormat: (
    type: FormatType,
    options?: { color?: string; size?: string; rows?: number; cols?: number; language?: string },
  ) => void;
  /** 格式刷：null 表示未激活；激活态由父级持有（首次点击复制格式，再次点击应用） */
  onFormatPainter?: () => void;
  formatPainterActive?: boolean;
  /** 选区 AI 操作：父级捕获当前选区并弹出浮层 */
  onAiAction?: () => void;
  activeFormats?: Set<string>;
  showOutlinePanel?: boolean;
  onToggleOutlinePanel?: () => void;
  showCommentsPanel?: boolean;
  onToggleCommentsPanel?: () => void;
  /** 打开「文档信息」面板 */
  onShowDocInfo?: () => void;
  /** 标题是否已移入正文（富文本内核）：顶部栏不再渲染标题输入框 */
  richEditorTitleInBody?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  previewMode?: PreviewMode;
  onTogglePreviewMode?: () => void;
}

const EditorHeaderInner: React.FC<EditorHeaderProps> = ({
  docTitle,
  isFavorite,
  activeNotebookId,
  activeDocId,
  saveStatus,
  fontSize,
  showPresentationMenu,
  updateDocContent,
  toggleFavorite,
  handleCopyLink,
  setShowSharePanel,
  setShowPresentationMenu,
  setFontSize,
  onFontSizeSelect,
  undo,
  redo,
  canUndo,
  canRedo,
  onStartPresentation,
  onShowVersionHistory,
  applyFormat,
  onFormatPainter,
  formatPainterActive = false,
  onAiAction,
  activeFormats = new Set(),
  showOutlinePanel,
  onToggleOutlinePanel,
  showCommentsPanel,
  onToggleCommentsPanel,
  onShowDocInfo,
  richEditorTitleInBody,
  isFullscreen,
  onToggleFullscreen,
  isFocusMode = false,
  onToggleFocusMode,
  previewMode = 'edit',
  onTogglePreviewMode,
}) => {
  // 用解析后的 isDark 而不是原始 theme：选择「跟随系统」或暗夜紫/暗夜绿时，
  // 直接比较 theme === 'light' 会把暗色主题显示成日间模式
  const { isDark, toggleTheme } = useTheme();

  // 颜色选择器的触发按钮：不在 outside-click 判定范围内，
  // 否则点击按钮会先"外点关闭"再触发按钮自身的 toggle，导致永远无法关闭
  const colorTriggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** 供子组件注册触发按钮元素（等价于原先的内联 ref 回调，挂载/卸载时机一致） */
  const registerColorTriggerRef = useCallback(
    (index: number) => (el: HTMLButtonElement | null) => {
      colorTriggerRefs.current[index] = el;
    },
    [],
  );

  // 响应式宽度 / 展开收缩状态（rAF 节流 + localStorage 持久化）
  const {
    toolbarExpanded,
    setToolbarExpanded,
    isMobile,
    effectiveExpanded,
    hideRedo,
    hideTableAndDivider,
  } = useResponsiveToolbar();

  /**
   * 「更多格式」浮层：点击外部 / 按 Esc 关闭。
   * 浮层是 absolute 定位的，不参与页头高度 —— 这是它与旧"常驻第二行"的核心区别。
   */
  const formatPopoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!effectiveExpanded) return;
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (formatPopoverRef.current?.contains(target)) return;
      // 触发按钮自己负责 toggle，这里跳过，否则会"先关再开"
      if (target.closest('.eh-expand-btn')) return;
      setToolbarExpanded(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setToolbarExpanded(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [effectiveExpanded, setToolbarExpanded]);


  // 各下拉菜单开关状态 / ref / 点击外部关闭
  const {
    showHeadingMenu,
    setShowHeadingMenu,
    showFontSizeMenu,
    setShowFontSizeMenu,
    showAlignMenu,
    setShowAlignMenu,
    showListMenu,
    setShowListMenu,
    showColorPicker,
    setShowColorPicker,
    showMoreMenu,
    setShowMoreMenu,
    showAddMenu,
    setShowAddMenu,
    showTableMenu,
    setShowTableMenu,
    showCodeLangMenu,
    setShowCodeLangMenu,
    moreMenuRef,
    headingMenuRef,
    fontSizeMenuRef,
    alignMenuRef,
    listMenuRef,
    colorPickerRef,
    addMenuRef,
    tableMenuRef,
    codeLangMenuRef,
  } = useEditorHeaderMenus(colorTriggerRefs);

  const titleInputRef = useRef<HTMLInputElement>(null);

  // 导出逻辑已拆分至 editorHeaderExports.ts（从 store 读取最新内容）。
  // 菜单点击后即收起，没有常驻按钮可显示忙碌态，故用"进行中"提示承接长操作反馈；
  // 结果提示由导出函数自身负责（printCurrentDoc 有"取消"语义，不能统一报成功）
  const { run: runAsync } = useAsyncAction();
  const handleExportHtml = useCallback(() => {
    void runAsync(exportCurrentDocAsHtml, { pendingMsg: '正在导出 HTML…' });
  }, [runAsync]);
  const handleExportPdf = useCallback((options?: Parameters<typeof exportCurrentDocAsPdf>[0]) => {
    void runAsync(() => exportCurrentDocAsPdf(options), { pendingMsg: '正在导出 PDF…' });
  }, [runAsync]);
  const handlePrintDoc = useCallback(() => {
    void runAsync(printCurrentDoc, { pendingMsg: '正在准备打印…' });
  }, [runAsync]);
  const handleExportMarkdown = useCallback(() => {
    void runAsync(exportCurrentDocAsMarkdown, { pendingMsg: '正在导出 Markdown…' });
  }, [runAsync]);
  const handleExportNotebookZip = useCallback(() => {
    void runAsync(exportCurrentNotebookAsZip, { pendingMsg: '正在打包知识库 ZIP…' });
  }, [runAsync]);

  return (
    <header className="eh-header">
      {/* ===== 第一层：文档标题栏（已拆分为 EditorHeaderTitleBar） ===== */}
      <EditorHeaderTitleBar
        docTitle={docTitle}
        saveStatus={saveStatus}
        titleInputRef={titleInputRef}
        isFavorite={isFavorite}
        toggleFavorite={toggleFavorite}
        activeNotebookId={activeNotebookId}
        activeDocId={activeDocId}
        onShowVersionHistory={onShowVersionHistory}
        setShowSharePanel={setShowSharePanel}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        isDark={isDark}
        toggleTheme={toggleTheme}
        showOutlinePanel={showOutlinePanel}
        showCommentsPanel={showCommentsPanel}
        onToggleOutlinePanel={onToggleOutlinePanel}
        onToggleCommentsPanel={onToggleCommentsPanel}
        onShowDocInfo={onShowDocInfo}
        richEditorTitleInBody={richEditorTitleInBody}
        showPresentationMenu={showPresentationMenu}
        setShowPresentationMenu={setShowPresentationMenu}
        onStartPresentation={onStartPresentation}
        onCopyLink={handleCopyLink}
        onExportHtml={handleExportHtml}
        onExportPdf={handleExportPdf}
        onPrintDoc={handlePrintDoc}
        onExportMarkdown={handleExportMarkdown}
        onExportNotebookZip={handleExportNotebookZip}
        moreMenuRef={moreMenuRef}
        showMoreMenu={showMoreMenu}
        setShowMoreMenu={setShowMoreMenu}
        updateDocContent={updateDocContent}
      />

      {/* ===== 第二层：可展开/收缩的格式工具栏 ===== */}
      <div
        className={`eh-toolbar ${effectiveExpanded ? 'expanded' : ''}`}
        /*
         * 点击工具栏按钮时阻止默认的焦点转移。
         *
         * contenteditable 的选区绑定在焦点上：点按钮如果让编辑器失焦，
         * 选区会被浏览器折叠/清除，`getSelectionRange()` 随即返回 null ——
         * 表现为"选中文字后点加粗完全没反应"（语雀/Notion 都在 mousedown 里这样处理）。
         */
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) e.preventDefault();
        }}
      >
        <div className="eh-toolbar-row eh-toolbar-row-primary">
          <div className="eh-toolbar-left">
            {/* 添加内容按钮 */}
            <EditorHeaderAddMenu
              open={showAddMenu}
              setOpen={setShowAddMenu}
              menuRef={addMenuRef}
              applyFormat={applyFormat}
            />

            {/* 分组1：历史操作 */}
            <div className="eh-toolbar-group">
              <IconBtn title={`撤销 (${modKey}+Z)`} onClick={undo} disabled={!canUndo}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </IconBtn>

              {!hideRedo && (
                <IconBtn title={`重做 (${modKey}+Y)`} onClick={redo} disabled={!canRedo}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
                  </svg>
                </IconBtn>
              )}
            </div>

            <div className="eh-group-divider" />

            <EditorHeaderHeadingMenu
              open={showHeadingMenu}
              setOpen={setShowHeadingMenu}
              menuRef={headingMenuRef}
              activeFormats={activeFormats}
              applyFormat={applyFormat}
            />

            <EditorHeaderInlineFormatGroup activeFormats={activeFormats} applyFormat={applyFormat} />

            <EditorHeaderColorMenus
              applyFormat={applyFormat}
              showColorPicker={showColorPicker}
              setShowColorPicker={setShowColorPicker}
              colorPickerRef={colorPickerRef}
              registerTriggerRef={registerColorTriggerRef}
            />

            <span className="eh-divider" />

            <EditorHeaderAlignMenu
              open={showAlignMenu}
              setOpen={setShowAlignMenu}
              menuRef={alignMenuRef}
              applyFormat={applyFormat}
            />

            <EditorHeaderListMenu
              open={showListMenu}
              setOpen={setShowListMenu}
              menuRef={listMenuRef}
              activeFormats={activeFormats}
              applyFormat={applyFormat}
            />

            <span className="eh-divider" />

            <IconBtn title="插入链接" onClick={() => applyFormat('link')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </IconBtn>
          </div>

          <div className="eh-toolbar-right">
            <EditorHeaderViewControls
              previewMode={previewMode}
              onTogglePreviewMode={onTogglePreviewMode}
              isFocusMode={isFocusMode}
              onToggleFocusMode={onToggleFocusMode}
              isMobile={isMobile}
              toolbarExpanded={toolbarExpanded}
              effectiveExpanded={effectiveExpanded}
              setToolbarExpanded={setToolbarExpanded}
            />
          </div>
        </div>

        {effectiveExpanded && (
          <div className="eh-format-popover-anchor" ref={formatPopoverRef}>
            <EditorHeaderSecondaryRow
              applyFormat={applyFormat}
              activeFormats={activeFormats}
              hideTableAndDivider={hideTableAndDivider}
              fontSize={fontSize}
              setFontSize={setFontSize}
              onFontSizeSelect={onFontSizeSelect}
              showFontSizeMenu={showFontSizeMenu}
              setShowFontSizeMenu={setShowFontSizeMenu}
              fontSizeMenuRef={fontSizeMenuRef}
              onFormatPainter={onFormatPainter}
              formatPainterActive={formatPainterActive}
              onAiAction={onAiAction}
              onClose={() => setToolbarExpanded(false)}
              showCodeLangMenu={showCodeLangMenu}
              setShowCodeLangMenu={setShowCodeLangMenu}
              codeLangMenuRef={codeLangMenuRef}
              showTableMenu={showTableMenu}
              setShowTableMenu={setShowTableMenu}
              tableMenuRef={tableMenuRef}
            />
          </div>
        )}
      </div>
    </header>
  );
};

/** memo 化：击键仅影响 docTitle 等少量字段，其余场景跳过组件的内部重渲染 */
export const EditorHeader = memo(EditorHeaderInner);