import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import type { NoteDoc } from '@/types';
import type { SaveStatus } from '@/store';
import { useTheme } from '@/shared/hooks';
import { modKey } from '@/utils/platform';
import type { FormatType } from '@/hooks/useEditorFormatting';
import type { PreviewMode } from './Editor';
import { IconBtn } from './EditorHeaderIcon';
import { EditorHeaderColorPicker, type ColorTab } from './EditorHeaderColorPicker';
import { EditorHeaderTitleBar } from './EditorHeaderTitleBar';
import { exportCurrentDocAsHtml, exportCurrentDocAsPdf, exportCurrentDocAsMarkdown, exportCurrentNotebookAsZip } from './editorHeaderExports';

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
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  previewMode?: PreviewMode;
  onTogglePreviewMode?: () => void;
}

type HeadingLevel = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

const HEADING_LEVELS = [
  { level: 'h1', format: 'heading1', label: '标题 1', className: 'eh-heading-h1' },
  { level: 'h2', format: 'heading2', label: '标题 2', className: 'eh-heading-h2' },
  { level: 'h3', format: 'heading3', label: '标题 3', className: 'eh-heading-h3' },
  { level: 'h4', format: 'heading4', label: '标题 4', className: 'eh-heading-h3' },
  { level: 'h5', format: 'heading5', label: '标题 5', className: 'eh-heading-h3' },
  { level: 'h6', format: 'heading6', label: '标题 6', className: 'eh-heading-h3' },
] as const;

const FONT_SIZE_OPTIONS = ['12px', '13px', '14px', '15px', '16px', '18px', '20px'];

const STORAGE_KEY = 'toolbarExpanded';

/** 表格尺寸选择器上限 */
const TABLE_MAX_ROWS = 8;
const TABLE_MAX_COLS = 10;

/** 代码块语言（value 为空表示无语言围栏） */
const CODE_LANGUAGES: { value: string; label: string }[] = [
  { value: '', label: '纯文本' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'json', label: 'JSON' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'yaml', label: 'YAML' },
  { value: 'mermaid', label: 'Mermaid 图表' },
];

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
  isFullscreen,
  onToggleFullscreen,
  isFocusMode = false,
  onToggleFocusMode,
  previewMode = 'edit',
  onTogglePreviewMode,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [toolbarExpanded, setToolbarExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showFontSizeMenu, setShowFontSizeMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showListMenu, setShowListMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState<ColorTab | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showCodeLangMenu, setShowCodeLangMenu] = useState(false);
  const [tableHover, setTableHover] = useState({ rows: 3, cols: 3 });
  const [winWidth, setWinWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const fontSizeMenuRef = useRef<HTMLDivElement>(null);
  const alignMenuRef = useRef<HTMLDivElement>(null);
  const listMenuRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  // 颜色选择器的触发按钮：不在 outside-click 判定范围内，
  // 否则点击按钮会先"外点关闭"再触发按钮自身的 toggle，导致永远无法关闭
  const colorTriggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const tableMenuRef = useRef<HTMLDivElement>(null);
  const codeLangMenuRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(toolbarExpanded));
    } catch {
      /* ignore */
    }
  }, [toolbarExpanded]);

  useEffect(() => {
    // rAF 节流：resize 高频触发时避免每帧多次 setState
    let rafId: number | null = null;
    const onResize = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setWinWidth(window.innerWidth);
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // 与 useResizableLayout 的 MOBILE_BREAKPOINT(768) 保持一致，避免中间宽度行为不一致
  const isMobile = winWidth < 768;
  const effectiveExpanded = !isMobile && toolbarExpanded;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideColorTrigger = colorTriggerRefs.current.some(el => el && el.contains(target));
      if (headingMenuRef.current && !headingMenuRef.current.contains(target)) setShowHeadingMenu(false);
      if (fontSizeMenuRef.current && !fontSizeMenuRef.current.contains(target)) setShowFontSizeMenu(false);
      if (alignMenuRef.current && !alignMenuRef.current.contains(target)) setShowAlignMenu(false);
      if (listMenuRef.current && !listMenuRef.current.contains(target)) setShowListMenu(false);
      if (colorPickerRef.current && !colorPickerRef.current.contains(target) && !insideColorTrigger) setShowColorPicker(null);
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) setShowMoreMenu(false);
      if (addMenuRef.current && !addMenuRef.current.contains(target)) setShowAddMenu(false);
      if (tableMenuRef.current && !tableMenuRef.current.contains(target)) setShowTableMenu(false);
      if (codeLangMenuRef.current && !codeLangMenuRef.current.contains(target)) setShowCodeLangMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentHeading = (): HeadingLevel => {
    for (const { level, format } of HEADING_LEVELS) {
      if (activeFormats.has(format)) return level;
    }
    return 'paragraph';
  };

  const handleHeadingSelect = (level: HeadingLevel) => {
    // 先清除现有标题标记（applyFormat 对标题是切换语义），paragraph 则仅清除
    HEADING_LEVELS.forEach(({ format }) => {
      if (activeFormats.has(format)) applyFormat(format);
    });
    if (level !== 'paragraph') {
      const target = `heading${level[1]}` as 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6';
      if (!activeFormats.has(target)) applyFormat(target);
    }
    setShowHeadingMenu(false);
  };

  const headingLabel = (): string => {
    const h = currentHeading();
    return h === 'paragraph' ? '正文' : h.toUpperCase();
  };

  const handleAddAction = useCallback((action: () => void) => {
    action();
    setShowAddMenu(false);
  }, []);

  // 导出逻辑已拆分至 editorHeaderExports.ts（从 store 读取最新内容）
  const handleExportHtml = exportCurrentDocAsHtml;
  const handleExportPdf = exportCurrentDocAsPdf;
  const handleExportMarkdown = exportCurrentDocAsMarkdown;
  const handleExportNotebookZip = exportCurrentNotebookAsZip;

  const hideRedo = winWidth < 1000;
  const hideTableAndDivider = winWidth < 800;

  const renderColorPicker = () => (
    <EditorHeaderColorPicker
      tab={showColorPicker}
      onTabChange={setShowColorPicker}
      onPick={(type, color) => applyFormat(type, { color })}
      onClose={() => setShowColorPicker(null)}
      pickerRef={colorPickerRef}
    />
  );

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
        theme={theme}
        toggleTheme={toggleTheme}
        showOutlinePanel={showOutlinePanel}
        showCommentsPanel={showCommentsPanel}
        onToggleOutlinePanel={onToggleOutlinePanel}
        onToggleCommentsPanel={onToggleCommentsPanel}
        showPresentationMenu={showPresentationMenu}
        setShowPresentationMenu={setShowPresentationMenu}
        onStartPresentation={onStartPresentation}
        onCopyLink={handleCopyLink}
        onExportHtml={handleExportHtml}
        onExportPdf={handleExportPdf}
        onExportMarkdown={handleExportMarkdown}
        onExportNotebookZip={handleExportNotebookZip}
        moreMenuRef={moreMenuRef}
        showMoreMenu={showMoreMenu}
        setShowMoreMenu={setShowMoreMenu}
        updateDocContent={updateDocContent}
      />

      {/* ===== 第二层：可展开/收缩的格式工具栏 ===== */}
      <div className={`eh-toolbar ${effectiveExpanded ? 'expanded' : ''}`}>
        <div className="eh-toolbar-row eh-toolbar-row-primary">
          <div className="eh-toolbar-left">
            {/* 添加内容按钮 */}
            <div className="eh-dropdown" ref={addMenuRef}>
              <button
                className="eh-add-btn"
                title="添加内容"
                onClick={() => setShowAddMenu(!showAddMenu)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              {showAddMenu && (
                <div className="eh-dropdown-menu eh-add-menu">
                  <div className="eh-menu-group">
                    <div className="eh-group-label">快速插入</div>
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
                </div>
              )}
            </div>

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

            {/* 分组2：插入功能 */}
            <div className="eh-toolbar-group">
              <IconBtn title="插入链接" onClick={() => applyFormat('link')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </IconBtn>
            </div>

            <div className="eh-group-divider" />

            <div className="eh-dropdown" ref={headingMenuRef}>
              <button
                className={`eh-icon-btn eh-btn-text ${currentHeading() !== 'paragraph' ? 'active' : ''}`}
                onClick={() => setShowHeadingMenu(!showHeadingMenu)}
                title="段落样式"
              >
                {headingLabel()}
                <svg className="eh-arrow" viewBox="0 0 12 12" fill="currentColor"><path d="M3 5l3 3 3-3" /></svg>
              </button>
              {showHeadingMenu && (
                <div className="eh-dropdown-menu eh-heading-menu">
                  <button className={`eh-menu-item ${currentHeading() === 'paragraph' ? 'active' : ''}`} onClick={() => handleHeadingSelect('paragraph')}>
                    <span className="eh-heading-p">正文</span>
                  </button>
                  <button className={`eh-menu-item ${currentHeading() === 'h1' ? 'active' : ''}`} onClick={() => handleHeadingSelect('h1')}>
                    <span className="eh-heading-h1">标题 1</span>
                  </button>
                  <button className={`eh-menu-item ${currentHeading() === 'h2' ? 'active' : ''}`} onClick={() => handleHeadingSelect('h2')}>
                    <span className="eh-heading-h2">标题 2</span>
                  </button>
                  <button className={`eh-menu-item ${currentHeading() === 'h3' ? 'active' : ''}`} onClick={() => handleHeadingSelect('h3')}>
                    <span className="eh-heading-h3">标题 3</span>
                  </button>
                  {HEADING_LEVELS.filter((h) => h.level === 'h4' || h.level === 'h5' || h.level === 'h6').map((h) => (
                    <button
                      key={h.level}
                      className={`eh-menu-item ${currentHeading() === h.level ? 'active' : ''}`}
                      onClick={() => handleHeadingSelect(h.level)}
                    >
                      <span className="eh-heading-h3">{h.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="eh-dropdown" ref={fontSizeMenuRef}>
              <button
                className="eh-icon-btn eh-btn-text"
                onClick={() => setShowFontSizeMenu(!showFontSizeMenu)}
                title="字号"
              >
                {fontSize.replace('px', '')}
                <svg className="eh-arrow" viewBox="0 0 12 12" fill="currentColor"><path d="M3 5l3 3 3-3" /></svg>
              </button>
              {showFontSizeMenu && (
                <div className="eh-dropdown-menu eh-fontsize-menu">
                  {FONT_SIZE_OPTIONS.map((val) => (
                    <button
                      key={val}
                      className={`eh-menu-item ${fontSize === val ? 'active' : ''}`}
                      onClick={() => {
                        if (onFontSizeSelect) {
                          onFontSizeSelect(val);
                        } else {
                          setFontSize(val);
                        }
                        setShowFontSizeMenu(false);
                      }}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="eh-divider" />

            <IconBtn title={`粗体 (${modKey}+B)`} onClick={() => applyFormat('bold')} active={activeFormats.has('bold')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
                <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
              </svg>
            </IconBtn>
            <IconBtn title={`斜体 (${modKey}+I)`} onClick={() => applyFormat('italic')} active={activeFormats.has('italic')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="4" x2="10" y2="4" />
                <line x1="14" y1="20" x2="5" y2="20" />
                <line x1="15" y1="4" x2="9" y2="20" />
              </svg>
            </IconBtn>
            <IconBtn title={`删除线 (${modKey}+Shift+X)`} onClick={() => applyFormat('strike')} active={activeFormats.has('strike')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4H9a3 3 0 0 0-3 3 3 3 0 0 0 3 3h6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <path d="M15 12a3 3 0 1 1 0 6H8" />
              </svg>
            </IconBtn>
            <IconBtn title={`下划线 (${modKey}+U)`} onClick={() => applyFormat('underline')} active={activeFormats.has('underline')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3v7a6 6 0 0 0 12 0V3" />
                <line x1="4" y1="21" x2="20" y2="21" />
              </svg>
            </IconBtn>
            <IconBtn title={`行内代码 (${modKey}+E)`} onClick={() => applyFormat('code')} active={activeFormats.has('code')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </IconBtn>

            <div className="eh-dropdown">
              <button
                ref={(el) => { colorTriggerRefs.current[0] = el; }}
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
                ref={(el) => { colorTriggerRefs.current[1] = el; }}
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

            <span className="eh-divider" />

            <div className="eh-dropdown" ref={alignMenuRef}>
              <button
                className="eh-icon-btn eh-btn-text"
                onClick={() => setShowAlignMenu(!showAlignMenu)}
                title="对齐方式"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="15" y2="12" />
                  <line x1="3" y1="18" x2="18" y2="18" />
                </svg>
                <svg className="eh-arrow" viewBox="0 0 12 12" fill="currentColor"><path d="M3 5l3 3 3-3" /></svg>
              </button>
              {showAlignMenu && (
                <div className="eh-dropdown-menu eh-align-menu">
                  <button className="eh-menu-item" onClick={() => { applyFormat('alignLeft'); setShowAlignMenu(false); }}>
                    <svg className="eh-menu-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" /></svg>
                    左对齐
                  </button>
                  <button className="eh-menu-item" onClick={() => { applyFormat('alignCenter'); setShowAlignMenu(false); }}>
                    <svg className="eh-menu-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
                    居中
                  </button>
                  <button className="eh-menu-item" onClick={() => { applyFormat('alignRight'); setShowAlignMenu(false); }}>
                    <svg className="eh-menu-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" /></svg>
                    右对齐
                  </button>
                </div>
              )}
            </div>

            <div className="eh-dropdown" ref={listMenuRef}>
              <button
                className={`eh-icon-btn ${activeFormats.has('ulist') || activeFormats.has('olist') ? 'active' : ''}`}
                onClick={() => setShowListMenu(!showListMenu)}
                title="列表"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <circle cx="4" cy="6" r="1" fill="currentColor" />
                  <circle cx="4" cy="12" r="1" fill="currentColor" />
                  <circle cx="4" cy="18" r="1" fill="currentColor" />
                </svg>
                <svg className="eh-arrow" viewBox="0 0 12 12" fill="currentColor"><path d="M3 5l3 3 3-3" /></svg>
              </button>
              {showListMenu && (
                <div className="eh-dropdown-menu eh-list-menu">
                  <button className={`eh-menu-item ${activeFormats.has('ulist') ? 'active' : ''}`} onClick={() => { applyFormat('ulist'); setShowListMenu(false); }}>
                    <svg className="eh-menu-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>
                    无序列表
                  </button>
                  <button className={`eh-menu-item ${activeFormats.has('olist') ? 'active' : ''}`} onClick={() => { applyFormat('olist'); setShowListMenu(false); }}>
                    <svg className="eh-menu-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none">1</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none">2</text><text x="2" y="20" fontSize="8" fill="currentColor" stroke="none">3</text></svg>
                    有序列表
                  </button>
                  <button className="eh-menu-item" onClick={() => { applyFormat('tasklist'); setShowListMenu(false); }}>
                    <svg className="eh-menu-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                    任务列表
                  </button>
                </div>
              )}
            </div>

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

          <div className="eh-toolbar-right">
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
          </div>
        </div>

        <div className="eh-toolbar-row eh-toolbar-row-secondary">
          <div className="eh-toolbar-left">
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
            <div className="eh-dropdown" ref={codeLangMenuRef}>
              <IconBtn
                title="代码块（可选择语言）"
                onClick={() => setShowCodeLangMenu(!showCodeLangMenu)}
                active={activeFormats.has('codeblock') || showCodeLangMenu}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <polyline points="9 8 5 12 9 16" />
                  <polyline points="15 8 19 12 15 16" />
                </svg>
              </IconBtn>
              {showCodeLangMenu && (
                <div className="eh-dropdown-menu eh-codelang-menu">
                  <div className="eh-group-label">代码块语言</div>
                  {CODE_LANGUAGES.map(lang => (
                    <button
                      key={lang.value || 'plain'}
                      className="eh-menu-item"
                      onClick={() => {
                        applyFormat('codeblock', { language: lang.value });
                        setShowCodeLangMenu(false);
                      }}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <IconBtn title="插入图片" onClick={() => applyFormat('image')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </IconBtn>
            {!hideTableAndDivider && (
              <>
                <div className="eh-dropdown" ref={tableMenuRef}>
                  <IconBtn title="表格（可选择行列数）" onClick={() => setShowTableMenu(!showTableMenu)} active={showTableMenu}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="3" y1="15" x2="21" y2="15" />
                      <line x1="9" y1="3" x2="9" y2="21" />
                      <line x1="15" y1="3" x2="15" y2="21" />
                    </svg>
                  </IconBtn>
                  {showTableMenu && (
                    <div className="eh-dropdown-menu eh-table-menu">
                      <div className="eh-table-grid" onMouseLeave={() => setTableHover({ rows: 3, cols: 3 })}>
                        {Array.from({ length: TABLE_MAX_ROWS }).map((_, rowIdx) => (
                          <div className="eh-table-grid-row" key={rowIdx}>
                            {Array.from({ length: TABLE_MAX_COLS }).map((__, colIdx) => (
                              <button
                                key={colIdx}
                                type="button"
                                className={`eh-table-cell ${
                                  rowIdx < tableHover.rows && colIdx < tableHover.cols ? 'active' : ''
                                }`}
                                onMouseEnter={() => setTableHover({ rows: rowIdx + 1, cols: colIdx + 1 })}
                                onClick={() => {
                                  applyFormat('table', { rows: rowIdx + 1, cols: colIdx + 1 });
                                  setShowTableMenu(false);
                                }}
                                aria-label={`插入 ${rowIdx + 1} 行 ${colIdx + 1} 列表格`}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="eh-table-hint">
                        {tableHover.rows} × {tableHover.cols} 表格
                      </div>
                    </div>
                  )}
                </div>
                <IconBtn title="分割线" onClick={() => applyFormat('divider')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </IconBtn>
              </>
            )}
          </div>
          <div className="eh-toolbar-right">
            <button
              className="eh-icon-btn eh-collapse-btn"
              onClick={() => setToolbarExpanded(false)}
              title="收起工具栏"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

/** memo 化：击键仅影响 docTitle 等少量字段，其余场景跳过组件的内部重渲染 */
export const EditorHeader = memo(EditorHeaderInner);