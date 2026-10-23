import { useState } from 'react';
import type { NoteDoc } from '@/types';
import { useNotesStore } from '@/store';
import type { SaveStatus } from '@/store';
import { IconBtn } from './EditorHeaderIcon';
import DocBreadcrumb from './DocBreadcrumb';
import PdfExportDialog from './PdfExportDialog';
import type { PdfExportOptions } from '@/types';
import { findAdjacentDoc, flattenDocs, requestDocOpen } from '@/utils/docNavigation';
import {
  IconPlay,
  IconHistory,
  IconLink,
  IconGlobe,
  IconPrinter,
  IconDocument,
  IconArchive,
  IconLayers,
  IconComment,
  IconInfo,
  IconMaximize,
  IconSun,
  IconMoon,
  IconChevronLeft,
  IconChevronRight,
} from '@/components/common/Icon';

/**
 * EditorHeader 第一层：文档标题栏（含收藏/历史/分享/全屏/主题切换/更多菜单/演示菜单）。
 * 从 EditorHeader.tsx 纯拆分而来，逻辑不变，仅接收显式 props。
 */
interface EditorHeaderTitleBarProps {
  docTitle: string;
  saveStatus: SaveStatus;
  titleInputRef: React.RefObject<HTMLInputElement | null>;

  isFavorite: boolean;
  toggleFavorite: (notebookId: string, docId: string) => void;
  activeNotebookId: string;
  activeDocId: string;

  onShowVersionHistory?: () => void;
  setShowSharePanel: (show: boolean) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;

  /** 当前是否为暗色系主题（由 useTheme 解析，兼容「跟随系统」与暗色预设） */
  isDark: boolean;
  toggleTheme: () => void;

  showOutlinePanel?: boolean;
  showCommentsPanel?: boolean;
  onToggleOutlinePanel?: () => void;
  onToggleCommentsPanel?: () => void;
  /** 打开「文档信息」面板（字数/版本/评论/标签的集中视图） */
  onShowDocInfo?: () => void;

  /**
   * 标题是否已移入正文（富文本内核）。
   * 为 true 时顶部栏不再渲染标题输入框，避免标题重复出现。
   */
  richEditorTitleInBody?: boolean;

  showPresentationMenu: boolean;
  setShowPresentationMenu: (show: boolean) => void;
  onStartPresentation?: () => void;

  onCopyLink: () => void;
  onExportHtml: () => void;
  onExportPdf: (options?: PdfExportOptions) => void;
  /** 系统打印当前文档（C5） */
  onPrintDoc?: () => void;
  onExportMarkdown?: () => void;
  onExportNotebookZip?: () => void;

  moreMenuRef: React.RefObject<HTMLDivElement | null>;
  showMoreMenu: boolean;
  setShowMoreMenu: (show: boolean) => void;
  updateDocContent: (updates: Partial<NoteDoc>) => void;
}

const SAVE_STATUS_TEXT: Record<SaveStatus, string> = {
  saving: '正在保存...',
  error: '保存失败',
  saved: '已保存',
  idle: '',
};

export const EditorHeaderTitleBar: React.FC<EditorHeaderTitleBarProps> = ({
  docTitle,
  saveStatus,
  titleInputRef,
  isFavorite,
  toggleFavorite,
  activeNotebookId,
  activeDocId,
  onShowVersionHistory,
  setShowSharePanel,
  isFullscreen,
  onToggleFullscreen,
  isDark,
  toggleTheme,
  showOutlinePanel,
  showCommentsPanel,
  onToggleOutlinePanel,
  onToggleCommentsPanel,
  onShowDocInfo,
  richEditorTitleInBody = false,
  showPresentationMenu,
  setShowPresentationMenu,
  onStartPresentation,
  onCopyLink,
  onExportHtml,
  onExportPdf,
  onPrintDoc,
  onExportMarkdown,
  onExportNotebookZip,
  moreMenuRef,
  showMoreMenu,
  setShowMoreMenu,
  updateDocContent,
}) => {
  const [titleEditing, setTitleEditing] = useState(false);
  /** 导出 PDF / 打印共用的选项弹窗（C4 / C5） */
  const [showPdfDialog, setShowPdfDialog] = useState(false);

  // 相邻文档按需计算（点击时才读 store）：不在渲染期订阅文档列表，
  // 否则每次击键都会触发一次全库展平
  const navigateAdjacent = (direction: 'prev' | 'next'): void => {
    const state = useNotesStore.getState();
    const target = findAdjacentDoc(
      flattenDocs(state.notebooks),
      state.activeNotebookId,
      state.activeDocId,
      direction,
    );
    if (target) requestDocOpen({ notebookId: target.notebookId, docId: target.docId });
  };

  return (
    <div className="eh-title-bar">
      <div className="eh-title-left">
        <DocBreadcrumb />
        {/*
          富文本内核：标题已移入正文（语雀式），这里**不再重复渲染标题输入框**。
          否则同一个标题会在顶部栏和正文里各出现一次 —— 用户会以为是两个不同的东西，
          也不知道该改哪一个（实测截图确认过这个重复）。
          顶部栏只留面包屑与保存状态，高度也随之收窄，更接近语雀的单行工具条。
        */}
        {!richEditorTitleInBody && (
          <input
            ref={titleInputRef}
            className={`eh-title-input ${titleEditing ? 'editing' : ''}`}
            value={docTitle}
            onChange={(e) => updateDocContent({ title: e.target.value })}
            onFocus={() => setTitleEditing(true)}
            onBlur={() => setTitleEditing(false)}
            onKeyDown={(e) => {
              // Enter 提交（失焦），Escape 还原为当前已保存标题
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                const doc = useNotesStore.getState().notebooks
                  .find(nb => nb.id === activeNotebookId)?.docs.find(d => d.id === activeDocId);
                if (doc) updateDocContent({ title: doc.title });
                e.currentTarget.blur();
              }
            }}
            placeholder="无标题"
          />
        )}
        {saveStatus === 'error' ? (
          /* 保存失败必须给出可执行动作：toast 会自动消失，用户之后无处点击重试（R5） */
          <button
            type="button"
            className="eh-sync-status error eh-sync-retry"
            title="保存失败，点击重试"
            onClick={() => {
              void useNotesStore.getState().saveNotes()
            }}
          >
            <svg className="eh-sync-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9v-2.5a2.5 2.5 0 0 1 5 0V20" />
              <path d="M5 15a4 4 0 0 1 4-4h7" />
            </svg>
            {SAVE_STATUS_TEXT[saveStatus]} · 重试
          </button>
        ) : saveStatus === 'saving' ? (
          /* 「已保存」不再常驻：侧栏底部已有全局保存状态，标题栏只提示进行中的状态 */
          <span className={`eh-sync-status ${saveStatus}`}>
            <svg className="eh-sync-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9v-2.5a2.5 2.5 0 0 1 5 0V20" />
              <path d="M5 15a4 4 0 0 1 4-4h7" />
            </svg>
            {SAVE_STATUS_TEXT[saveStatus]}
          </span>
        ) : null}
      </div>

      <div className="eh-title-right">
        {/*
          语雀式顶栏：只保留「收藏 / 分享 / 更多」三个入口。
          上一篇/下一篇/历史版本/全屏/主题都属于低频操作，原先平铺成 8 个图标，
          视觉噪音盖过了文档本身；现在统一收进「更多」菜单（菜单内已有对应项）。
        */}
        <IconBtn
          title={isFavorite ? '取消收藏' : '收藏'}
          onClick={() => toggleFavorite(activeNotebookId, activeDocId)}
          active={isFavorite}
        >
          {isFavorite ? (
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          )}
        </IconBtn>

        <button
          type="button"
          className="eh-share-btn"
          onClick={() => setShowSharePanel(true)}
          title="分享此文档"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          <span>分享</span>
        </button>

        <div className="eh-dropdown" ref={moreMenuRef}>
          <IconBtn title="更多" onClick={() => setShowMoreMenu(!showMoreMenu)} active={showMoreMenu}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </IconBtn>
          {showMoreMenu && (
            <div className="eh-dropdown-menu">
              <div className="eh-menu-group">
                <div className="eh-group-label">操作</div>
                <button className="eh-menu-item" onClick={() => { navigateAdjacent('prev'); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon"><IconChevronLeft size={16} /></span>上一篇
                  <span className="eh-menu-hint">Ctrl+Alt+←</span>
                </button>
                <button className="eh-menu-item" onClick={() => { navigateAdjacent('next'); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon"><IconChevronRight size={16} /></span>下一篇
                  <span className="eh-menu-hint">Ctrl+Alt+→</span>
                </button>
                <button className="eh-menu-item" onClick={() => { setShowPresentationMenu(true); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon"><IconPlay size={16} /></span>演示模式
                </button>
                <button className="eh-menu-item" onClick={() => { onShowVersionHistory?.(); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon"><IconHistory size={16} /></span>版本历史
                </button>
                <button className="eh-menu-item" onClick={() => { onCopyLink(); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon"><IconLink size={16} /></span>复制链接
                </button>
              </div>
              <div className="eh-menu-divider" />
              <div className="eh-menu-group">
                <div className="eh-group-label">导出</div>
                <button className="eh-menu-item" onClick={() => { onExportHtml(); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon"><IconGlobe size={16} /></span>导出 HTML
                </button>
                <button className="eh-menu-item" onClick={() => { setShowPdfDialog(true); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon"><IconPrinter size={16} /></span>导出 PDF / 打印…
                </button>
                {onExportMarkdown && (
                  <button className="eh-menu-item" onClick={() => { onExportMarkdown(); setShowMoreMenu(false); }}>
                    <span className="eh-menu-icon"><IconDocument size={16} /></span>导出 Markdown
                  </button>
                )}
                {onExportNotebookZip && (
                  <button className="eh-menu-item" onClick={() => { onExportNotebookZip(); setShowMoreMenu(false); }}>
                    <span className="eh-menu-icon"><IconArchive size={16} /></span>导出知识库 ZIP
                  </button>
                )}
              </div>
              <div className="eh-menu-divider" />
              <div className="eh-menu-group">
                <div className="eh-group-label">视图</div>
                <button className={`eh-menu-item ${showOutlinePanel ? 'active' : ''}`} onClick={() => { onToggleOutlinePanel?.(); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon"><IconLayers size={16} /></span>目录大纲
                </button>
                <button className={`eh-menu-item ${showCommentsPanel ? 'active' : ''}`} onClick={() => { onToggleCommentsPanel?.(); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon"><IconComment size={16} /></span>评论
                </button>
                {onShowDocInfo && (
                  <button className="eh-menu-item" onClick={() => { onShowDocInfo(); setShowMoreMenu(false); }}>
                    <span className="eh-menu-icon"><IconInfo size={16} /></span>文档信息
                  </button>
                )}
                <button className="eh-menu-item" onClick={() => { onToggleFullscreen?.(); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon"><IconMaximize size={16} /></span>{isFullscreen ? '退出全屏' : '全屏'}
                </button>
                <button className="eh-menu-item" onClick={toggleTheme}>
                  <span className="eh-menu-icon">{isDark ? <IconSun size={16} /> : <IconMoon size={16} />}</span>{isDark ? '日间模式' : '夜间模式'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 导出 PDF 与打印共用同一个选项弹窗（C4 / C5） */}
      <PdfExportDialog
        isOpen={showPdfDialog}
        onClose={() => setShowPdfDialog(false)}
        onExport={(options) => onExportPdf(options)}
        onPrint={() => onPrintDoc?.()}
      />

      {showPresentationMenu && (
        <div className="eh-presentation-menu">
          <button
            className="eh-presentation-item"
            onClick={() => {
              setShowPresentationMenu(false);
              onStartPresentation?.();
            }}
          >
            <span className="eh-menu-icon"><IconPlay size={16} /></span>开始演示
          </button>
          {/* "编辑演示分页"无对应功能实现，点击后不做任何事只会造成困惑，移除入口 */}
        </div>
      )}
    </div>
  );
};
