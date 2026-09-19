// 导入 React hooks 和类型定义
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { DocVersion } from '@/types';
import { useNotesStore } from '@/store';

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
function VersionHistoryPanel({ notebookId, docId, onClose }: VersionHistoryPanelProps) {
  const { notebooks, restoreVersion, updateDoc } = useNotesStore(useShallow((s) => ({
    notebooks: s.notebooks,
    restoreVersion: s.restoreVersion,
    updateDoc: s.updateDoc,
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
   * 处理选择版本
   */
  const handleSelectVersion = (version: DocVersion) => {
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
  const handleCompare = () => {
    if (selectedVersion) {
      setCompareVersion(selectedVersion);
      setSelectedVersion(null);
    }
  };

  /**
   * 处理恢复版本
   */
  const [confirmRestore, setConfirmRestore] = useState(false)

  const handleRestore = () => {
    if (selectedVersion) {
      setConfirmRestore(true)
    }
  }

  const handleConfirmRestore = () => {
    if (selectedVersion) {
      restoreVersion(notebookId, docId, selectedVersion.id)
      setConfirmRestore(false)
      onClose()
    }
  }

  const handleCancelRestore = () => {
    setConfirmRestore(false)
  };

  /**
   * 处理添加版本标签
   */
  const handleAddTag = () => {
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
  const handleExportVersion = () => {
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

  /**
   * 获取版本类型标签
   */
  const getVersionTypeLabel = (type: string) => {
    switch (type) {
      case 'manual': return '手动保存';
      case 'published': return '已发布';
      default: return '自动保存';
    }
  };

  /**
   * 获取版本类型样式类名
   */
  const getVersionTypeClass = (type: string) => {
    switch (type) {
      case 'manual': return 'version-type-manual';
      case 'published': return 'version-type-published';
      default: return 'version-type-auto';
    }
  };

  /**
   * 渲染版本对比视图
   */
  /** 基于 LCS 的行级 diff 算法 */
  const computeDiff = (currentLines: string[], compareLines: string[]) => {
    const m = currentLines.length
    const n = compareLines.length
    // 构建 LCS 矩阵
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = currentLines[i - 1] === compareLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }

    // 回溯生成 diff 操作序列
    type DiffOp = { type: 'unchanged' | 'added' | 'removed' | 'modified'; current?: string; compare?: string }
    const ops: DiffOp[] = []
    let i = m, j = n
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && currentLines[i - 1] === compareLines[j - 1]) {
        ops.unshift({ type: 'unchanged', current: currentLines[i - 1], compare: compareLines[j - 1] })
        i--; j--
      } else if (i > 0 && j > 0 && dp[i - 1][j - 1] >= dp[i - 1][j] && dp[i - 1][j - 1] >= dp[i][j - 1]) {
        // 相邻行不同，视为"修改"
        ops.unshift({ type: 'modified', current: currentLines[i - 1], compare: compareLines[j - 1] })
        i--; j--
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.unshift({ type: 'removed', compare: compareLines[j - 1] })
        j--
      } else {
        ops.unshift({ type: 'added', current: currentLines[i - 1] })
        i--
      }
    }

    // 分别生成两侧显示行
    const current = ops
      .filter(op => op.type !== 'removed')
      .map(op => ({
        text: op.current!,
        type: (op.type === 'modified' ? 'added' : op.type) as 'unchanged' | 'added',
      }))
    const compare = ops
      .filter(op => op.type !== 'added')
      .map(op => ({
        text: op.compare!,
        type: (op.type === 'modified' ? 'removed' : op.type) as 'unchanged' | 'removed',
      }))

    return { current, compare }
  }

  const renderDiff = () => {
    if (!selectedVersion || !compareVersion) return null;
    
    const currentContent = selectedVersion.content.split('\n');
    const compareContent = compareVersion.content.split('\n');
    const diff = computeDiff(currentContent, compareContent);
    
    return (
      <div className="diff-view">
        <div className="diff-header">
          <span className="diff-label">当前版本:</span>
          <span className="diff-time">{new Date(selectedVersion.createdAt).toLocaleString('zh-CN')}</span>
          <span className="diff-separator">vs</span>
          <span className="diff-label">对比版本:</span>
          <span className="diff-time">{new Date(compareVersion.createdAt).toLocaleString('zh-CN')}</span>
        </div>
        <div className="diff-content">
          <div className="diff-panel">
            <div className="diff-panel-header">
              <span>{new Date(selectedVersion.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <div className="diff-body">
              {diff.current.map((line, idx) => (
                <div key={idx} className={`diff-line diff-line-${line.type}`}>
                  <span className="diff-line-number">{idx + 1}</span>
                  <span className="diff-line-prefix">{line.type === 'added' ? '+' : ' '}</span>
                  <span className="diff-line-content">{line.text || ' '}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="diff-panel">
            <div className="diff-panel-header">
              <span>{new Date(compareVersion.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <div className="diff-body">
              {diff.compare.map((line, idx) => (
                <div key={idx} className={`diff-line diff-line-${line.type}`}>
                  <span className="diff-line-number">{idx + 1}</span>
                  <span className="diff-line-prefix">{line.type === 'removed' ? '-' : ' '}</span>
                  <span className="diff-line-content">{line.text || ' '}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /**
   * 渲染版本内容详情
   */
  const renderVersionContent = () => {
    if (!selectedVersion) {
      return (
        <div className="version-empty">
          <span className="version-empty-icon">📋</span>
          <span className="version-empty-text">选择一个版本查看详情</span>
        </div>
      );
    }

    return (
      <div className="version-content">
        <div className="version-content-header">
          <input
            className="version-title-input"
            value={selectedVersion.title}
            readOnly
          />
          <div className="version-actions">
            <button 
              className="version-action-btn" 
              onClick={() => setShowTagModal(true)}
              title="添加标签"
            >
              🏷️ 添加标签
            </button>
            <button 
              className="version-action-btn" 
              onClick={handleExportVersion}
              title="导出版本"
            >
              📥 导出
            </button>
            {!showDiff && (
              <button 
                className="version-action-btn primary" 
                onClick={handleRestore}
              >
                ↩ 恢复此版本
              </button>
            )}
          </div>
        </div>
        <div className="version-meta">
          <span className="version-meta-item">
            <span className="meta-label">创建时间:</span>
            <span className="meta-value">{new Date(selectedVersion.createdAt).toLocaleString('zh-CN')}</span>
          </span>
          {selectedVersion.versionTag && (
            <span className="version-meta-item">
              <span className="meta-label">标签:</span>
              <span className="meta-value version-tag">{selectedVersion.versionTag}</span>
            </span>
          )}
          {selectedVersion.comment && (
            <span className="version-meta-item">
              <span className="meta-label">备注:</span>
              <span className="meta-value">{selectedVersion.comment}</span>
            </span>
          )}
        </div>
        <div className="version-body">
          <pre className="version-content-text">{selectedVersion.content}</pre>
        </div>
      </div>
    );
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
                <div
                  key={version.id}
                  className={`version-item ${selectedVersion?.id === version.id ? 'selected' : ''} ${compareVersion?.id === version.id ? 'compare' : ''}`}
                  onClick={() => handleSelectVersion(version)}
                >
                  <div className="version-item-header">
                    <span className="version-date">
                      {new Date(version.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                    <span className="version-time">
                      {new Date(version.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`version-type ${getVersionTypeClass(version.type)}`}>
                      {getVersionTypeLabel(version.type)}
                    </span>
                  </div>
                  {version.versionTag && (
                    <div className="version-tag">{version.versionTag}</div>
                  )}
                  {index === 0 && (
                    <span className="version-latest">最新</span>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="version-detail">
            {showDiff ? (
              <>
                <div className="compare-header">
                  <span className="compare-label">与</span>
                  <select 
                    className="compare-select"
                    value={compareVersion?.id || ''}
                    onChange={(e) => {
                      const v = versions.find(v => v.id === e.target.value);
                      setCompareVersion(v || null);
                    }}
                  >
                    <option value="">请选择历史版本</option>
                    {versions.map(v => (
                      <option key={v.id} value={v.id}>
                        {new Date(v.createdAt).toLocaleString('zh-CN')}
                      </option>
                    ))}
                  </select>
                  <button className="compare-btn" onClick={handleCompare}>
                    对比
                  </button>
                </div>
                {renderDiff()}
              </>
            ) : (
              renderVersionContent()
            )}
          </div>
        </div>

        {/* 添加版本标签弹窗 */}
        {showTagModal && (
          <div className="vh-tag-modal-overlay" onClick={() => setShowTagModal(false)}>
            <div className="vh-tag-modal" onClick={(e) => e.stopPropagation()}>
              <div className="vh-tag-modal-header">
                <span className="vh-tag-modal-title">添加版本标签</span>
                <button className="vh-tag-modal-close" onClick={() => setShowTagModal(false)}>×</button>
              </div>
              <div className="vh-tag-modal-body">
                <label className="vh-tag-modal-label">标签名称</label>
                <input 
                  className="vh-tag-modal-input"
                  value={versionTag}
                  onChange={(e) => setVersionTag(e.target.value)}
                  placeholder="例如: v1.0.0"
                />
                <label className="vh-tag-modal-label">备注（可选）</label>
                <textarea 
                  className="vh-tag-modal-textarea"
                  value={versionComment}
                  onChange={(e) => setVersionComment(e.target.value)}
                  placeholder="添加备注说明..."
                  rows={3}
                />
              </div>
              <div className="vh-tag-modal-footer">
                <button className="vh-tag-modal-btn secondary" onClick={() => setShowTagModal(false)}>
                  取消
                </button>
                <button className="vh-tag-modal-btn primary" onClick={handleAddTag}>
                  确定
                </button>
              </div>
            </div>
          </div>
        )}
        {confirmRestore && (
          <div className="confirm-dialog-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog confirm-dialog-warning" onClick={(e) => e.stopPropagation()}>
              <h3>确认恢复</h3>
              <p>确定要恢复到此版本吗？当前内容将被替换。</p>
              <div className="confirm-dialog-actions">
                <button onClick={handleCancelRestore}>取消</button>
                <button onClick={handleConfirmRestore} className="btn-primary">确认恢复</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VersionHistoryPanel;