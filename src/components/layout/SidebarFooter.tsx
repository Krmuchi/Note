import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { AppStore, NoteDoc, TrashDoc } from '@/types';
import type { ViewType } from '@/hooks/useUIState';
import { useNotesStore } from '@/store';
import { exportAllData, importMarkdownDocs, importBackupData } from '@/services/storage';
import { toast } from '@/components/common/Toast';

interface SidebarFooterProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  trash: TrashDoc[];
  onOpenSettings?: () => void;
  onOpenShortcutHelp?: () => void;
  collapsed: boolean;
  onShowTooltip: (text: string, e: React.MouseEvent) => void;
  onHideTooltip: () => void;
}

export const SidebarFooter: React.FC<SidebarFooterProps> = ({
  activeView,
  onViewChange,
  trash,
  onOpenSettings,
  onOpenShortcutHelp,
  collapsed,
  onShowTooltip,
  onHideTooltip,
}) => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const handleExportAll = useCallback(async () => {
    setShowMoreMenu(false);
    try {
      const { notebooks, trash, tags, searchHistory, activeNotebookId, activeDocId } = useNotesStore.getState();
      const result = await exportAllData({ notebooks, trash, tags, searchHistory, activeNotebookId, activeDocId } as AppStore);
      if (result) {
        toast.success('数据备份导出成功');
      }
    } catch (err) {
      console.error('导出失败:', err);
      toast.error(`导出失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, []);

  const handleImportMd = useCallback(async () => {
    setShowMoreMenu(false);
    try {
      const docs = await importMarkdownDocs();
      if (!docs || docs.length === 0) return;

      const state = useNotesStore.getState();
      const targetNotebookId = state.activeNotebookId || state.notebooks[0]?.id;
      if (!targetNotebookId) {
        toast.warning('没有可用的知识库，请先创建一个知识库');
        return;
      }

      docs.forEach(doc => {
        state.createDoc(targetNotebookId, null, { title: doc.title, content: doc.content });
      });
      toast.success(`成功导入 ${docs.length} 个文档`);
    } catch (err) {
      console.error('导入失败:', err);
      toast.error(`导入失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, []);

  const handleImportBackup = useCallback(async () => {
    setShowMoreMenu(false);
    try {
      const backupData = await importBackupData();
      if (!backupData) return;

      const state = useNotesStore.getState();
      let importedCount = 0;

      // 合并数据：将备份中的知识库添加到现有知识库
      if (backupData.notebooks && Array.isArray(backupData.notebooks)) {
        backupData.notebooks.forEach((backupNotebook) => {
          // 检查是否已存在同名知识库
          const existingNotebook = state.notebooks.find(nb => nb.title === backupNotebook.title);
          if (existingNotebook) {
            // 如果存在，将备份中的文档添加到现有知识库
            if (backupNotebook.docs && Array.isArray(backupNotebook.docs)) {
              backupNotebook.docs.forEach((doc: NoteDoc) => {
                // 检查文档是否已存在
                const existingDoc = existingNotebook.docs.find(d => d.title === doc.title);
                if (!existingDoc) {
                  state.createDoc(existingNotebook.id, null, {
                    title: doc.title,
                    content: doc.content,
                    tags: doc.tags || [],
                    favorite: doc.favorite || false,
                  });
                  importedCount++;
                }
              });
            }
          } else {
            // 如果不存在，创建新的知识库
            state.createNotebook(backupNotebook.title);
            const newNotebook = useNotesStore.getState().notebooks[useNotesStore.getState().notebooks.length - 1];
            if (newNotebook && backupNotebook.docs && Array.isArray(backupNotebook.docs)) {
              backupNotebook.docs.forEach((doc: NoteDoc) => {
                state.createDoc(newNotebook.id, null, {
                  title: doc.title,
                  content: doc.content,
                  tags: doc.tags || [],
                  favorite: doc.favorite || false,
                });
                importedCount++;
              });
            }
          }
        });
      }

      toast.success(`备份数据导入成功，共导入 ${importedCount} 个文档`);
    } catch (err) {
      console.error('导入备份失败:', err);
      toast.error(`导入备份失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, []);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClick = (e: MouseEvent): void => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMoreMenu]);

  return (
    <div className="sidebar-footer">
      <div className="more-menu-container" ref={moreMenuRef}>
        <button
          className="footer-item"
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          onMouseEnter={(e) => collapsed && onShowTooltip('更多', e)}
          onMouseLeave={onHideTooltip}
        >
          <span className="footer-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </span>
          <span className="footer-text">更多</span>
        </button>
        {showMoreMenu && (
          <div className="more-menu">
            <div className="more-menu-section">
              <button
                className={`more-menu-item ${activeView === 'trash' ? 'active' : ''}`}
                onClick={() => {
                  onViewChange('trash');
                  setShowMoreMenu(false);
                }}
              >
                <span className="more-menu-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </span>
                <span className="more-menu-text">回收站</span>
                {trash.length > 0 && <span className="more-menu-badge">{trash.length}</span>}
              </button>
            </div>
            <div className="more-menu-section">
              <button className="more-menu-item" onClick={handleImportMd}>
                <span className="more-menu-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </span>
                <span className="more-menu-text">导入文档</span>
              </button>
              <button className="more-menu-item" onClick={handleExportAll}>
                <span className="more-menu-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </span>
                <span className="more-menu-text">导出全部</span>
              </button>
              <button className="more-menu-item" onClick={handleImportBackup}>
                <span className="more-menu-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                </span>
                <span className="more-menu-text">恢复备份</span>
              </button>
            </div>
            <div className="more-menu-section">
              <button className="more-menu-item" onClick={() => { setShowMoreMenu(false); onOpenSettings?.(); }}>
                <span className="more-menu-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </span>
                <span className="more-menu-text">设置</span>
              </button>
              <button className="more-menu-item" onClick={() => { setShowMoreMenu(false); onOpenShortcutHelp?.(); }}>
                <span className="more-menu-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </span>
                <span className="more-menu-text">帮助中心</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SidebarFooter;
