import React, { useRef, useCallback, useEffect, useState, memo } from 'react';
import type { NoteDoc } from '@/types';
import type { SaveStatus } from '@/store';
import { useTheme } from '@/shared/hooks';
import { modKey } from '@/utils/platform';
import type { FormatType } from '@/hooks/useEditorFormatting';
import type { PreviewMode } from './Editor';
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
import { EditorToolbarOverflow } from './EditorToolbarOverflow';
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
  /** 工具栏整体是否收起 */
  toolbarCollapsed: boolean;
  /** 收起 / 展开工具栏 */
  onToggleToolbar: () => void;
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
  toolbarCollapsed,
  onToggleToolbar,
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

  /**
   * 低频格式的溢出菜单（语雀的"下级菜单"）。
   * 它和「收起工具栏」是两件事：前者收拢低频工具，后者把整条工具栏藏起来。
   * 旧实现把两者混成一个"展开工具栏"按钮，点开却弹出格式面板，语义完全对不上。
   */
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  /**
   * 工具栏宽度测量：窄窗口下把颜色 / 对齐 / 列表 / 链接自动收进溢出菜单，
   * 让主栏保持单行（语雀的工具栏"自动收折"）。
   * 用 ResizeObserver 而不是窗口宽度：侧栏拖宽、折叠都会改变工具栏可用宽度。
   */
  const [toolbarNode, setToolbarNode] = useState<HTMLDivElement | null>(null);
  const [toolbarWidth, setToolbarWidth] = useState(0);
  useEffect(() => {
    // jsdom（单元测试）没有 ResizeObserver：守卫掉，测试环境下不启用自动收折
    if (!toolbarNode || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setToolbarWidth(entry.contentRect.width);
    });
    observer.observe(toolbarNode);
    return () => observer.disconnect();
  }, [toolbarNode]);

  const foldExtras = toolbarWidth > 0 && toolbarWidth < 760;

  useEffect(() => {
    if (!overflowOpen) return;
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (overflowRef.current?.contains(target)) return;
      // 触发按钮自己负责 toggle，这里跳过，否则会"先关再开"
      if (target.closest('.eh-overflow-btn')) return;
      setOverflowOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setOverflowOpen(false);
      // 截住 Esc：焦点仍在正文时，Editor 的"收起工具栏"不应被这次按键连带触发
      e.stopPropagation();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [overflowOpen]);

  // 工具栏收起 / 展开时同步清掉溢出菜单，展开后不残留上一次的下级菜单
  const handleToggleToolbar = useCallback(() => {
    setOverflowOpen(false);
    onToggleToolbar();
  }, [onToggleToolbar]);

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

  // 溢出菜单关闭后重置其内部的下拉菜单状态，避免下次打开时上一个子菜单还开着
  useEffect(() => {
    if (overflowOpen) return;
    setShowFontSizeMenu(false);
    setShowCodeLangMenu(false);
    setShowTableMenu(false);
  }, [overflowOpen, setShowFontSizeMenu, setShowCodeLangMenu, setShowTableMenu]);

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
        toolbarCollapsed={toolbarCollapsed}
        onToggleToolbar={handleToggleToolbar}
      />

      {/*
        ===== 第二层：格式工具栏 =====
        语雀式：这是一整条可以被「收起」的工具栏，而不是一扇格式面板。
        收起后页头只剩标题栏，正文向上占满；恢复入口在标题栏右侧（Esc 亦可）。
      */}
      {!toolbarCollapsed && (
        <div
          className="eh-toolbar"
          ref={setToolbarNode}
          /*
           * 点击工具栏按钮时阻止默认的焦点转移。
           *
           * contenteditable 的选区绑定在焦点上：点按钮如果让编辑器失焦，
           * 选区会被浏览器折叠/清除，`getSelectionRange()` 随即返回 null ——
           * 表现为"选中文字后点加粗完全没反应"（语雀/Notion 都在 mousedown 里这样处理）。
           * 右侧的视图控件（预览/专注/溢出/收起）除外：它们不是格式命令，
           * 允许焦点落在按钮上，Esc 才能正确地只关闭菜单而不会误触发工具栏折叠。
           */
          onMouseDown={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('button') && !target.closest('.eh-toolbar-right')) e.preventDefault();
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

                <IconBtn title={`重做 (${modKey}+Y)`} onClick={redo} disabled={!canRedo}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
                  </svg>
                </IconBtn>
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

              {/* 工具栏宽度不够时，这组低频但常用的控件自动移入「更多格式」 */}
              {!foldExtras && (
                <>
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
                </>
              )}
            </div>

            <div className="eh-toolbar-right">
              <EditorHeaderViewControls
                previewMode={previewMode}
                onTogglePreviewMode={onTogglePreviewMode}
                isFocusMode={isFocusMode}
                onToggleFocusMode={onToggleFocusMode}
                overflowOpen={overflowOpen}
                onToggleOverflow={() => setOverflowOpen((open) => !open)}
                onCollapseToolbar={handleToggleToolbar}
                hasHiddenItems={foldExtras}
              />
            </div>
          </div>

          {overflowOpen && (
            <div className="eh-overflow-anchor" ref={overflowRef}>
              <EditorToolbarOverflow
                applyFormat={applyFormat}
                activeFormats={activeFormats}
                fontSize={fontSize}
                setFontSize={setFontSize}
                onFontSizeSelect={onFontSizeSelect}
                showFontSizeMenu={showFontSizeMenu}
                setShowFontSizeMenu={setShowFontSizeMenu}
                fontSizeMenuRef={fontSizeMenuRef}
                onFormatPainter={onFormatPainter}
                formatPainterActive={formatPainterActive}
                onAiAction={onAiAction}
                showCodeLangMenu={showCodeLangMenu}
                setShowCodeLangMenu={setShowCodeLangMenu}
                codeLangMenuRef={codeLangMenuRef}
                showTableMenu={showTableMenu}
                setShowTableMenu={setShowTableMenu}
                tableMenuRef={tableMenuRef}
                onAction={() => setOverflowOpen(false)}
                foldedColors={foldExtras}
                foldedAlign={foldExtras}
                foldedList={foldExtras}
                foldedLink={foldExtras}
                showColorPicker={showColorPicker}
                setShowColorPicker={setShowColorPicker}
                colorPickerRef={colorPickerRef}
                registerColorTriggerRef={registerColorTriggerRef}
                showAlignMenu={showAlignMenu}
                setShowAlignMenu={setShowAlignMenu}
                alignMenuRef={alignMenuRef}
                showListMenu={showListMenu}
                setShowListMenu={setShowListMenu}
                listMenuRef={listMenuRef}
              />
            </div>
          )}
        </div>
      )}
    </header>
  );
};

/** memo 化：击键仅影响 docTitle 等少量字段，其余场景跳过组件的内部重渲染 */
export const EditorHeader = memo(EditorHeaderInner);