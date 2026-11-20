// 导入 React hooks 和类型定义
import { useState } from 'react';
import type { JSX } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { DocVersion } from '@/types';
import { useNotesStore } from '@/store';
import { confirmAction } from '@/hooks/useConfirmAction';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { exportDoc } from '@/services/storage';
import { toast } from '@/services/toast';
import VersionListItem from './VersionListItem';
import VersionDiffView from './VersionDiffView';
import VersionContentDetail from './VersionContentDetail';
import VersionTagModal from './VersionTagModal';
import { IconEdit, IconHistory } from '@/components/common/Icon';

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
  // 弹窗焦点陷阱：Tab 在面板内循环，关闭后归还焦点（A2）
  const trapRef = useFocusTrap<HTMLDivElement>();
  /*
   * 恢复版本的忙碌态：恢复是覆盖式操作，确认后必须挡住重复触发，
   * 完成给成功回执、失败给错误提示（useAsyncAction 统一负责）。
   */
  const { run: runRestore, loading: restoring } = useAsyncAction();
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
  // 「显示所有本地存储版本」：取消勾选 = 仅看手动保存的版本（受控，真正参与过滤）
  const [showAllVersions, setShowAllVersions] = useState(true);

  // 列表按开关过滤；对比下拉仍可用全部版本（对比不该被列表过滤人为限制）
  const visibleVersions = showAllVersions ? versions : versions.filter(v => v.type === 'manual');

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
   * 处理选择版本。
   * 对比模式下点列表项只更新「当前版本」（左侧），绝不退出对比模式 ——
   * 旧实现在 compareVersion 为空时会 setShowDiff(false)，把用户弹回「全部记录」。
   */
  const handleSelectVersion = (version: DocVersion): void => {
    setSelectedVersion(version);
  };

  /**
   * 把当前选中的版本固定为「对比基准」（右侧），随后在列表另选一个版本作为左侧即可看 diff。
   * 没有选中版本时按钮禁用（见 VersionDiffView），不会清空已有选择。
   */
  const handleCompare = (): void => {
    if (selectedVersion) {
      setCompareVersion(selectedVersion);
      setSelectedVersion(null);
    }
  };

  /**
   * 处理恢复版本
   *
   * 确认后进入恢复中：期间再次触发直接 no-op（runRestore 的 runningRef + 本函数的
   * restoring 双保险），落地才关面板 —— 失败时面板留在原地并弹错误提示。
   */
  const handleRestore = (): void => {
    if (!selectedVersion || restoring) return
    const versionId = selectedVersion.id
    // 统一走 App 层的全局确认弹窗，避免各组件自绘 .confirm-dialog 造成交互/样式漂移
    confirmAction({
      title: '确认恢复',
      message: '确定要恢复到此版本吗？当前内容将被替换（恢复前会自动留存一份当前内容的快照，可再恢复回来）。',
      confirmText: '确认恢复',
      variant: 'danger',
      // 返回 Promise 供调用方/测试等待完成（ConfirmConfig 签名是 () => void，返回值被忽略）
      onConfirm: () =>
        runRestore(async () => {
          /*
           * 让出一次事件循环：store 写入是同步的，不让出这一拍「恢复中」
           * 只是个来不及落地的中间态，挡不住重复触发（同侧栏移动对话框的处理）。
           */
          await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
          restoreVersion(notebookId, docId, versionId)
          onClose()
        }, { successMsg: '已恢复到该版本', errorMsg: '恢复版本失败' }),
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
   * 处理导出版本：走统一的 IPC 导出通道（主进程弹保存对话框落盘），
   * 不再用 blob + a.click（打包 Electron 下下载行为不可控，且成功/失败都无提示）。
   * 用户取消保存对话框时 exportDoc 返回 false，不弹提示。
   */
  const handleExportVersion = async (): Promise<void> => {
    if (!selectedVersion) return
    try {
      const ok = await exportDoc({ title: selectedVersion.title, content: selectedVersion.content })
      if (ok) toast.success('已导出版本为 Markdown 文件')
    } catch (err) {
      toast.error('导出失败：' + (err instanceof Error ? err.message : '未知错误'))
    }
  };

  return (
    <div className="version-history-overlay" onClick={onClose}>
      <div
        ref={trapRef}
        className="version-history-panel"
        role="dialog"
        aria-modal="true"
        aria-label="历史记录"
        // 恢复进行中：辅助技术据此播报"忙"，同区域动作一并禁用
        aria-busy={restoring}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="version-history-header">
          <div className="version-history-title">
            <span className="version-icon"><IconHistory size={16} /></span>
            <span className="title-text">历史记录</span>
          </div>
          <button className="version-close-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        {/* 手动存版本：自动快照是 30 秒合并的，用户需要"把这一刻定住"的入口 */}
        <div className="version-save-row">
          <button
            type="button"
            className="version-save-btn"
            onClick={handleSaveCurrentVersion}
            disabled={!currentDoc || restoring}
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
              <label
                className="version-list-checkbox"
                title="勾选显示全部版本（含自动快照）；取消勾选只显示手动保存的版本"
              >
                <input
                  type="checkbox"
                  checked={showAllVersions}
                  onChange={(e) => setShowAllVersions(e.target.checked)}
                />
                <span>显示所有本地存储版本</span>
              </label>
            </div>
            {visibleVersions.length === 0 ? (
              <div className="empty-versions">
                <span className="empty-icon"><IconEdit size={32} /></span>
                <span className="empty-text">
                  {versions.length === 0
                    ? '暂无版本历史'
                    : '暂无手动保存的版本（勾选上方「显示所有」查看自动快照）'}
                </span>
              </div>
            ) : (
              visibleVersions.map((version) => (
                <VersionListItem
                  key={version.id}
                  version={version}
                  // 下标按完整列表计算：过滤后「最新」徽标仍只属于真正最新的版本
                  index={versions.findIndex(v => v.id === version.id)}
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
                onExport={() => void handleExportVersion()}
                onRestore={handleRestore}
                restoring={restoring}
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
