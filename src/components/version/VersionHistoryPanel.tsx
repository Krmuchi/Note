// 导入 React hooks 和类型定义
import { useState } from 'react';
import type { JSX } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { DocVersion } from '@/types';
import { useNotesStore } from '@/store';
import { confirmAction } from '@/hooks/useConfirmAction';
import VersionListItem from './VersionListItem';
import VersionDiffView from './VersionDiffView';
import VersionContentDetail from './VersionContentDetail';
import VersionTagModal from './VersionTagModal';

/**
  * 版本历史面板属性接口
 */
interface VersionHistoryPanelProps {
  notebookId: string;  // 知识库 ID
  docId: string;       // 文档 ID
  onClose: () => void; // 关闭回调
}

/**
 * 版本历史面板组件
 */
function VersionHistoryPanel({ notebookId, docId, onClose }: VersionHistoryPanelProps): JSX.Element {
  const { notebooks, restoreVersion, updateDoc, createVersionSnapshot } = useNotesStore(useShallow((s) => ({
    notebooks: s.notebooks,
    restoreVersion: s.restoreVersion,
    updateDoc: s.updateDoc,
    createVersionSnapshot: s.createVersionSnapshot,
  })));
  
  // 获取当前知识库和文档
  const activeNotebook = notebooks.find(nb => nb.id === notebookId);
  const currentDoc = activeNotebook?.docs.find(d => d.id === docId);

  // 直接派生（getDocVersions 内部同样只是查找返回，等价且省一次 memo 依赖协调）。
  // 给版本打标签/备注通过 updateDoc 更新 versions 数组，此处随 currentDoc 引用自动刷新
  const versions = currentDoc?.versions ?? [];

  const [selectedVersion, setSelectedVersion] = useState<DocVersion | null>(null); // 当前选中的版本
  const [compareVersion, setCompareVersion] = useState<DocVersion | null>(null);   // 用于对比的版本
  const [showDiff, setShowDiff] = useState(false);                                 // 是否显示对比模式
  const [showTagModal, setShowTagModal] = useState(false);                         // 是否显示标签弹窗
  const [versionTag, setVersionTag] = useState('');                                // 版本标签
  const [versionComment, setVersionComment] = useState('');                        // 版本备注

  /**
   * 手动为当前内容存一个版本（"把这一版定住"）。
   * 自动快照是 30 秒合并的，用户想标记"改到这里为止"时没有入口，
   * 只能等到下一次自动快照，且可能被后续编辑覆盖。
   */
  const handleSaveCurrentVersion = (): void => {
    if (!currentDoc) return
    const id = createVersionSnapshot(notebookId, docId, { tag: '手动保存' })
    if (!id) return
    // 选中刚创建的版本，用户可以立刻给它加备注或做对比
    const created = useNotesStore
      .getState()
      .notebooks.find(nb => nb.id === notebookId)
      ?.docs.find(d => d.id === docId)
      ?.versions?.find(v => v.id === id)
    if (created) setSelectedVersion(created)
    setShowDiff(false)
  };

  /**
   * 处理选择版本
   */
  const handleSelectVersion = (version: DocVersion): void => {
    if (showDiff && compareVersion) {
      setSelectedVersion(version);
    } else {
      setSelectedVersion(version);
      setShowDiff(false);
    }
  };

  /**
   * 处理版本对比
   */
  const handleCompare = (): void => {
    if (selectedVersion) {
      setCompareVersion(selectedVersion);
      setSelectedVersion(null);
    }
  };

  /**
   * 处理恢复版本
   */
  const handleRestore = (): void => {
    if (!selectedVersion) return
    const versionId = selectedVersion.id
    // 统一走 App 层的全局确认弹窗，避免各组件自绘 .confirm-dialog 造成交互/样式漂移
    confirmAction({
      title: '确认恢复',
      message: '确定要恢复到此版本吗？当前内容将被替换。',
      confirmText: '确认恢复',
      variant: 'danger',
      onConfirm: () => {
        restoreVersion(notebookId, docId, versionId)
        onClose()
      },
    })
  }

  /**
   * 处理添加版本标签
   */
  const handleAddTag = (): void => {
    if (selectedVersion && versionTag.trim()) {
      updateDoc(notebookId, docId, { 
        versions: (currentDoc?.versions || []).map(v => 
          v.id === selectedVersion.id 
            ? { ...v, versionTag: versionTag.trim(), comment: versionComment.trim() }
            : v
        )
      });
      setVersionTag('');
      setVersionComment('');
      setShowTagModal(false);
    }
  };

  /**
   * 处理导出版本
   */
  const handleExportVersion = (): void => {
    if (selectedVersion) {
      const content = `# ${selectedVersion.title}\n\n${selectedVersion.content}`;
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedVersion.title}_${selectedVersion.createdAt.replace(/[:.]/g, '-')}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="version-history-overlay" onClick={onClose}>
      <div className="version-history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="version-history-header">
          <div className="version-history-title">
            <span className="version-icon">📜</span>
            <span className="title-text">历史记录</span>
          </div>
          <button className="version-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {/* 手动存版本：自动快照是 30 秒合并的，用户需要"把这一刻定住"的入口 */}
        <div className="version-save-row">
          <button
            type="button"
            className="version-save-btn"
            onClick={handleSaveCurrentVersion}
            disabled={!currentDoc}
            title="把当前内容另存为一个版本（不会被后续自动快照覆盖）"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            保存当前版本
          </button>
        </div>
        
        <div className="version-history-tabs">
          <button 
            className={`version-tab ${!showDiff ? 'active' : ''}`}
            onClick={() => setShowDiff(false)}
          >
            全部记录
          </button>
          <button 
            className={`version-tab ${showDiff ? 'active' : ''}`}
            onClick={() => {
              setShowDiff(true);
              setCompareVersion(null);
            }}
          >
            版本对比
          </button>
        </div>

        <div className="version-history-body">
          <div className="version-list">
            <div className="version-list-header">
              <label className="version-list-checkbox">
                <input type="checkbox" defaultChecked />
                <span>显示所有本地存储版本</span>
              </label>
            </div>
            {versions.length === 0 ? (
              <div className="empty-versions">
                <span className="empty-icon">📝</span>
                <span className="empty-text">暂无版本历史</span>
              </div>
            ) : (
              versions.map((version, index) => (
                <VersionListItem
                  key={version.id}
                  version={version}
                  index={index}
                  selected={selectedVersion?.id === version.id}
                  compare={compareVersion?.id === version.id}
                  onSelect={handleSelectVersion}
                />
              ))
            )}
          </div>

          <div className="version-detail">
            {showDiff ? (
              <VersionDiffView
                versions={versions}
                selectedVersion={selectedVersion}
                compareVersion={compareVersion}
                onCompareVersionChange={setCompareVersion}
                onCompare={handleCompare}
              />
            ) : (
              <VersionContentDetail
                selectedVersion={selectedVersion}
                showDiff={showDiff}
                onAddTag={() => setShowTagModal(true)}
                onExport={handleExportVersion}
                onRestore={handleRestore}
              />
            )}
          </div>
        </div>

        {/* 添加版本标签弹窗 */}
        {showTagModal && (
          <VersionTagModal
            versionTag={versionTag}
            versionComment={versionComment}
            onVersionTagChange={setVersionTag}
            onVersionCommentChange={setVersionComment}
            onClose={() => setShowTagModal(false)}
            onConfirm={handleAddTag}
          />
        )}
      </div>
    </div>
  );
}

export default VersionHistoryPanel;