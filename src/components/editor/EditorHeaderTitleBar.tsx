import { useState } from 'react';
import type { NoteDoc } from '@/types';
import { useNotesStore } from '@/store';
import type { SaveStatus } from '@/store';
import type { ThemeType } from '@/shared/hooks';
import { IconBtn } from './EditorHeaderIcon';

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

  theme: ThemeType;
  toggleTheme: () => void;

  showOutlinePanel?: boolean;
  showCommentsPanel?: boolean;
  onToggleOutlinePanel?: () => void;
  onToggleCommentsPanel?: () => void;

  showPresentationMenu: boolean;
  setShowPresentationMenu: (show: boolean) => void;
  onStartPresentation?: () => void;

  onCopyLink: () => void;
  onExportHtml: () => void;
  onExportPdf: () => void;

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
  theme,
  toggleTheme,
  showOutlinePanel,
  showCommentsPanel,
  onToggleOutlinePanel,
  onToggleCommentsPanel,
  showPresentationMenu,
  setShowPresentationMenu,
  onStartPresentation,
  onCopyLink,
  onExportHtml,
  onExportPdf,
  moreMenuRef,
  showMoreMenu,
  setShowMoreMenu,
  updateDocContent,
}) => {
  const [titleEditing, setTitleEditing] = useState(false);

  return (
    <div className="eh-title-bar">
      <div className="eh-title-left">
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
        <span className={`eh-sync-status ${saveStatus}`}>
          <svg className="eh-sync-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {saveStatus === 'saved' ? (
              <path d="M20 6L9 17l-5-5" />
            ) : (
              <>
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9v-2.5a2.5 2.5 0 0 1 5 0V20" />
                <path d="M5 15a4 4 0 0 1 4-4h7" />
              </>
            )}
          </svg>
          {SAVE_STATUS_TEXT[saveStatus]}
        </span>
      </div>

      <div className="eh-title-right">
        <IconBtn
          title="收藏"
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

        <IconBtn title="历史版本" onClick={() => onShowVersionHistory?.()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </IconBtn>

        <IconBtn title="分享" onClick={() => setShowSharePanel(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </IconBtn>

        <IconBtn title={isFullscreen ? '退出全屏' : '全屏'} onClick={() => onToggleFullscreen?.()} active={isFullscreen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </IconBtn>

        <IconBtn title={theme === 'light' ? '切换到夜间模式' : '切换到日间模式'} onClick={toggleTheme}>
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </IconBtn>

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
                <button className="eh-menu-item" onClick={() => { setShowPresentationMenu(true); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon">🎤</span>演示模式
                </button>
                <button className="eh-menu-item" onClick={() => { onShowVersionHistory?.(); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon">📋</span>版本历史
                </button>
                <button className="eh-menu-item" onClick={() => { onCopyLink(); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon">🔗</span>复制链接
                </button>
              </div>
              <div className="eh-menu-divider" />
              <div className="eh-menu-group">
                <div className="eh-group-label">导出</div>
                <button className="eh-menu-item" onClick={() => { onExportHtml(); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon">🌐</span>导出 HTML
                </button>
                <button className="eh-menu-item" onClick={() => { onExportPdf(); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon">📄</span>导出 PDF
                </button>
              </div>
              <div className="eh-menu-divider" />
              <div className="eh-menu-group">
                <div className="eh-group-label">视图</div>
                <button className={`eh-menu-item ${showOutlinePanel ? 'active' : ''}`} onClick={() => { onToggleOutlinePanel?.(); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon">📑</span>目录大纲
                </button>
                <button className={`eh-menu-item ${showCommentsPanel ? 'active' : ''}`} onClick={() => { onToggleCommentsPanel?.(); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon">💬</span>评论
                </button>
                <button className="eh-menu-item" onClick={() => { onToggleFullscreen?.(); setShowMoreMenu(false); }}>
                  <span className="eh-menu-icon">⛶</span>{isFullscreen ? '退出全屏' : '全屏'}
                </button>
                <button className="eh-menu-item" onClick={toggleTheme}>
                  <span className="eh-menu-icon">{theme === 'light' ? '🌙' : '☀️'}</span>{theme === 'light' ? '夜间模式' : '日间模式'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showPresentationMenu && (
        <div className="eh-presentation-menu">
          <button
            className="eh-presentation-item"
            onClick={() => {
              setShowPresentationMenu(false);
              onStartPresentation?.();
            }}
          >
            <span className="eh-menu-icon">🎤</span>开始演示
          </button>
          {/* "编辑演示分页"无对应功能实现，点击后不做任何事只会造成困惑，移除入口 */}
        </div>
      )}
    </div>
  );
};
