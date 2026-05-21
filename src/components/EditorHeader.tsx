import React from 'react';
import type { NoteDoc } from '../types';
import DocTagSelector from './DocTagSelector';
import type { SaveStatus } from '../store/notesStore';

interface EditorHeaderProps {
  activeDoc: NoteDoc;
  activeNotebookId: string;
  activeDocId: string;
  saveStatus: SaveStatus;
  fontSize: string;
  showPresentationMenu: boolean;
  updateDocContent: (updates: Partial<NoteDoc>) => void;
  toggleFavorite: (notebookId: string, docId: string) => void;
  handleCopyLink: () => void;
  handleOpenInNewWindow: () => void;
  setShowSharePanel: (show: boolean) => void;
  setShowPresentationMenu: (show: boolean) => void;
  setFontSize: (size: string) => void;
  showMoreOptions: boolean;
  setShowMoreOptions: (show: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({
  activeDoc,
  activeNotebookId,
  activeDocId,
  saveStatus,
  fontSize,
  showPresentationMenu,
  updateDocContent,
  toggleFavorite,
  handleCopyLink,
  handleOpenInNewWindow,
  setShowSharePanel,
  setShowPresentationMenu,
  setFontSize,
  showMoreOptions,
  setShowMoreOptions,
  undo,
  redo,
  canUndo,
  canRedo,
}) => {
  return (
    <header className="editor-header">
      <div className="editor-title-row">
        <input
          className="editor-title-input"
          value={activeDoc.title}
          onChange={(e) => updateDocContent({ title: e.target.value })}
          placeholder="无标题"
        />
        <span className={`save-status-indicator ${saveStatus}`}>
          {saveStatus === 'saving' && <span className="save-spinner" />}
          {saveStatus === 'saving' && '正在保存...'}
          {saveStatus === 'saved' && '✓已保存'}
          {saveStatus === 'error' && '✗保存失败'}
          {saveStatus === 'idle' && '已保存'}
        </span>
        <DocTagSelector
          notebookId={activeNotebookId}
          docId={activeDocId}
          currentTags={activeDoc.tags || []}
          docContent={activeDoc.content || ''}
          onTagsChange={() => {}}
        />
        <div className="title-toolbar">
          <button 
            className={`title-toolbar-btn ${activeDoc.favorite ? "favorited" : ""}`} 
            title="收藏"
            onClick={() => toggleFavorite(activeNotebookId, activeDocId)}
          >
            ⭐
          </button>
          <button 
            className="title-toolbar-btn presentation-btn" 
            title="演示"
            onClick={() => setShowPresentationMenu(!showPresentationMenu)}
          >
            🎤
          </button>
          <button className="title-toolbar-btn" title="复制链接" onClick={handleCopyLink}>
            🔗
          </button>
          <button className="title-toolbar-btn" title="在新窗口打开" onClick={handleOpenInNewWindow}>
            ↗
          </button>
          <button className="title-toolbar-btn" title="更多操作">
            ⋯
          </button>
          <button className="title-toolbar-btn share-btn" title="分享" onClick={() => setShowSharePanel(true)}>
            分享
          </button>
          <button className="title-toolbar-btn" title="视图切换">
            □□
          </button>
          <button className="title-toolbar-btn" title="全屏">
            ⛶
          </button>
        </div>
        {showPresentationMenu && (
          <div className="presentation-menu">
            <button className="presentation-menu-item" onClick={() => {
              setShowPresentationMenu(false);
            }}>
              <span className="presentation-menu-icon">🎤</span>
              <span className="presentation-menu-text">开始演示</span>
            </button>
            <button className="presentation-menu-item" onClick={() => {
              setShowPresentationMenu(false);
            }}>
              <span className="presentation-menu-icon">📝</span>
              <span className="presentation-menu-text">编辑演示分页</span>
            </button>
          </div>
        )}
      </div>
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <button className="toolbar-btn" onClick={undo} disabled={!canUndo} title="撤销">
            ↩
          </button>
          <button className="toolbar-btn" onClick={redo} disabled={!canRedo} title="重做">
            ↪
          </button>
          <span className="toolbar-divider" />
          <select className="toolbar-select" value={fontSize} onChange={(e) => setFontSize(e.target.value)} title="字号">
            <option value="12px">12px</option>
            <option value="13px">13px</option>
            <option value="14px">14px</option>
            <option value="15px">15px</option>
            <option value="16px">16px</option>
            <option value="18px">18px</option>
            <option value="20px">20px</option>
          </select>
          <span className="toolbar-divider" />
          <button className="toolbar-btn" onClick={() => updateDocContent({ content: `**${activeDoc.content || ''}**` })} title="加粗">
            <strong>B</strong>
          </button>
          <button className="toolbar-btn" onClick={() => updateDocContent({ content: `*${activeDoc.content || ''}*` })} title="斜体">
            <em>I</em>
          </button>
          <button className="toolbar-btn" onClick={() => updateDocContent({ content: `<u>${activeDoc.content || ''}</u>` })} title="下划线">
            <u>U</u>
          </button>
          <button className="toolbar-btn" onClick={() => updateDocContent({ content: `~~${activeDoc.content || ''}~~` })} title="删除线">
            <s>S</s>
          </button>
          <span className="toolbar-divider" />
          <button 
            className={`toolbar-btn more-options-btn ${showMoreOptions ? "active" : ""}`} 
            title="更多选项"
            onClick={() => setShowMoreOptions(!showMoreOptions)}
          >
            ⋯
          </button>
        </div>
      </div>
      {showMoreOptions && (
        <div className="editor-toolbar expanded-toolbar">
          <div className="toolbar-left">
            <span className="toolbar-section-label">标题</span>
            <button className="toolbar-btn" onClick={() => updateDocContent({ content: `# ${activeDoc.content || ''}` })} title="标题1">
              H1
            </button>
            <button className="toolbar-btn" onClick={() => updateDocContent({ content: `## ${activeDoc.content || ''}` })} title="标题2">
              H2
            </button>
            <button className="toolbar-btn" onClick={() => updateDocContent({ content: `### ${activeDoc.content || ''}` })} title="标题3">
              H3
            </button>
            <span className="toolbar-divider" />
            <span className="toolbar-section-label">列表</span>
            <button className="toolbar-btn" onClick={() => updateDocContent({ content: `- ${activeDoc.content || ''}` })} title="无序列表">
              •
            </button>
            <button className="toolbar-btn" onClick={() => updateDocContent({ content: `1. ${activeDoc.content || ''}` })} title="有序列表">
              1.
            </button>
            <span className="toolbar-divider" />
            <span className="toolbar-section-label">插入</span>
            <button className="toolbar-btn" onClick={() => updateDocContent({ content: `> ${activeDoc.content || ''}` })} title="引用">
              "
            </button>
            <button className="toolbar-btn" onClick={() => updateDocContent({ content: `\`\`\`\n${activeDoc.content || ''}\n\`\`\`` })} title="代码块">
              &lt;/&gt;
            </button>
            <button className="toolbar-btn" onClick={() => updateDocContent({ content: `[链接](${activeDoc.content || ''})` })} title="链接">
              🔗
            </button>
            <button className="toolbar-btn" title="插入图片" onClick={() => {}}>
              🖼
            </button>
          </div>
        </div>
      )}
    </header>
  );
};