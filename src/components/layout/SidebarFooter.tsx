import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { AppStore, NoteDoc, TrashDoc } from '@/types';
import type { ViewType } from '@/hooks/useUIState';
import { useNotesStore } from '@/store';
import {
  exportAllData,
  importFiles,
  importMarkdownDocs,
  importBackupData,
} from '@/services/storage';
import type { ImportKind } from '@/types';
import BackupPanel from '@/components/settings/BackupPanel';
import { SaveIndicator } from './SaveIndicator';
import { toast } from '@/components/common/Toast';
import { ButtonLoader } from '@/components/common/Loading';
import { IconFolder, IconArchive } from '@/components/common/Icon';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { formatBackupTime, readLastBackupAt, watchLastBackupAt } from '@/utils/backupInfo';

interface SidebarFooterProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  trash: TrashDoc[];
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  collapsed: boolean;
  onShowTooltip: (text: string, e: React.MouseEvent) => void;
  onHideTooltip: () => void;
}

export const SidebarFooter: React.FC<SidebarFooterProps> = ({
  activeView,
  onViewChange,
  trash,
  onOpenSettings,
  onOpenHelp,
  collapsed,
  onShowTooltip,
  onHideTooltip,
}) => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [showBackupList, setShowBackupList] = useState(false);
  // 导入/导出均为菜单触发的长操作：统一挂忙碌态（触发按钮 spinner + "进行中"提示）
  const { run: runAsync, loading: actionLoading } = useAsyncAction();
  // 上次自动备份时间：与设置页共用同一份读写逻辑（utils/backupInfo）
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => readLastBackupAt());

  // 订阅主进程"备份完成"通知（低调更新状态，不弹 toast 打扰）
  useEffect(() => watchLastBackupAt(setLastBackupAt), []);

  // Esc 关闭备份面板（全局 ConfirmDialog 用 capture 阶段拦截，两者不冲突）
  useEffect(() => {
    if (!showBackupList) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setShowBackupList(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showBackupList]);

  const handleOpenBackupList = useCallback(() => {
    setShowMoreMenu(false);
    setShowBackupList(true);
  }, []);

  const handleExportAll = useCallback(async () => {
    setShowMoreMenu(false);
    try {
      const state = useNotesStore.getState();
      const { notebooks, trash, tags, searchHistory, activeNotebookId, activeDocId, templateUsage } = state;
      // 便签平时不在 notes-data.json 里，但导出必须带上（否则换机恢复会丢全部便签）
      const payload = state.withQuickNotesForExport({
        notebooks, trash, tags, searchHistory, activeNotebookId, activeDocId, templateUsage,
      });
      const result = await exportAllData(payload as AppStore);
      if (result) {
        const noteCount = state.quickNotes.length;
        toast.success(noteCount > 0 ? `数据备份导出成功（含 ${noteCount} 条便签）` : '数据备份导出成功');
      }
    } catch (err) {
      console.error('导出失败:', err);
      toast.error(`导出失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, []);

  /** 把导入结果落到当前知识库（文件 / 文件夹 / zip 三条路径共用） */
  const insertImportedDocs = useCallback((docs: { title: string; content: string }[]) => {
    if (docs.length === 0) return 0;
    const state = useNotesStore.getState();
    const targetNotebookId = state.activeNotebookId || state.notebooks[0]?.id;
    if (!targetNotebookId) {
      toast.warning('没有可用的知识库，请先创建一个知识库');
      return -1;
    }
    docs.forEach((doc) => {
      state.createDoc(targetNotebookId, null, { title: doc.title, content: doc.content });
    });
    return docs.length;
  }, []);

  /** 批量导入（O4）：文件夹 / zip 包 */
  const handleImportBatch = useCallback(async (kind: ImportKind) => {
    setShowMoreMenu(false);
    try {
      const result = await importFiles(kind);
      if (!result.ok) {
        // 用户取消不是错误
        if (!result.canceled && result.error) toast.error(result.error);
        return;
      }
      const inserted = insertImportedDocs(result.docs);
      if (inserted <= 0) {
        toast.warning(result.docs.length === 0 ? '没有找到可导入的 Markdown 文件' : '导入失败');
        return;
      }
      const extras = [
        result.skipped > 0 ? `跳过 ${result.skipped} 个` : '',
        result.imageCount > 0 ? `附带 ${result.imageCount} 张图片` : '',
      ].filter(Boolean).join('，');
      toast.success(`已导入 ${inserted} 个文档${extras ? '（' + extras + '）' : ''}`);
    } catch (err) {
      console.error('批量导入失败:', err);
      toast.error(`导入失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, [insertImportedDocs]);

  const handleImportFolder = useCallback(() => handleImportBatch('folder'), [handleImportBatch]);
  const handleImportZip = useCallback(() => handleImportBatch('zip'), [handleImportBatch]);

  const handleImportMd = useCallback(async () => {
    setShowMoreMenu(false);
    try {
      const docs = await importMarkdownDocs();
      if (!docs || docs.length === 0) return;

      const inserted = insertImportedDocs(docs);
      if (inserted > 0) toast.success(`成功导入 ${inserted} 个文档`);
    } catch (err) {
      console.error('导入失败:', err);
      toast.error(`导入失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, [insertImportedDocs]);

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
            // 如果不存在，创建新的知识库；createNotebook 返回新 id，避免按数组末尾位置推断
            const newNotebookId = state.createNotebook(backupNotebook.title);
            const newNotebook = useNotesStore.getState().notebooks.find(nb => nb.id === newNotebookId);
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

      // 便签也要恢复：导出时写进了备份，导入时不合并等于白导
      state.importQuickNotes(backupData.quickNotes);
      const noteCount = Array.isArray(backupData.quickNotes) ? backupData.quickNotes.length : 0;

      toast.success(
        noteCount > 0
          ? `备份数据导入成功，共导入 ${importedCount} 个文档、${noteCount} 条便签`
          : `备份数据导入成功，共导入 ${importedCount} 个文档`,
      );
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
      {/* 全局保存状态：停留在开始页/标签页/回收站时也能确认数据已经落盘 */}
      <SaveIndicator collapsed={collapsed} />
      <div className="more-menu-container" ref={moreMenuRef}>
        <button
          className="footer-item"
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          onMouseEnter={(e) => collapsed && onShowTooltip('更多', e)}
          onMouseLeave={onHideTooltip}
        >
          <ButtonLoader loading={actionLoading}>
            <span className="footer-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </span>
            <span className="footer-text">更多</span>
          </ButtonLoader>
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
              <button className="more-menu-item" onClick={() => void runAsync(handleImportMd, { pendingMsg: '正在导入 Markdown 文件…' })}>
                <span className="more-menu-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </span>
                <span className="more-menu-text">导入 Markdown 文件</span>
              </button>
              <button className="more-menu-item" onClick={() => void runAsync(handleImportFolder, { pendingMsg: '正在导入文件夹…' })}>
                <span className="more-menu-icon" aria-hidden="true"><IconFolder size={16} /></span>
                <span className="more-menu-text">导入文件夹</span>
              </button>
              <button className="more-menu-item" onClick={() => void runAsync(handleImportZip, { pendingMsg: '正在导入 ZIP 包…' })}>
                <span className="more-menu-icon" aria-hidden="true"><IconArchive size={16} /></span>
                <span className="more-menu-text">导入 ZIP 包</span>
              </button>
              <button className="more-menu-item" onClick={() => void runAsync(handleExportAll, { pendingMsg: '正在导出全部数据…' })}>
                <span className="more-menu-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </span>
                <span className="more-menu-text">导出全部</span>
              </button>
              <button className="more-menu-item" onClick={() => void runAsync(handleImportBackup, { pendingMsg: '正在导入备份文件…' })}>
                <span className="more-menu-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                </span>
                <span className="more-menu-text">导入备份文件</span>
              </button>
              <button className="more-menu-item" onClick={handleOpenBackupList}>
                <span className="more-menu-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 3-6.7" />
                    <polyline points="3 4 3 9 8 9" />
                    <polyline points="12 8 12 12 15 14" />
                  </svg>
                </span>
                <span className="more-menu-text">从备份恢复</span>
                {lastBackupAt && (
                  <span className="more-menu-hint">上次 {formatBackupTime(lastBackupAt)}</span>
                )}
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
              <button className="more-menu-item" onClick={() => { setShowMoreMenu(false); onOpenHelp?.(); }}>
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

      {/* 备份恢复面板：列出主进程 userData/backups 下的本地备份 */}
      {showBackupList && (
        <div className="backup-panel-overlay" onClick={() => setShowBackupList(false)}>
          <div className="backup-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="从备份恢复">
            <div className="backup-panel-header">
              <h4 className="backup-panel-title">从备份恢复</h4>
              <button className="backup-panel-close" onClick={() => setShowBackupList(false)} aria-label="关闭">×</button>
            </div>
            {/* 与「设置 → 数据与备份」共用同一个组件：覆盖式恢复的逻辑只能有一份 */}
            <BackupPanel />
          </div>
        </div>
      )}
    </div>
  );
};

export default SidebarFooter;
