// 导入 React hooks 和类型定义
import { useState, useMemo } from 'react';
import type { DocVersion } from '../types';
import { useNotesStore } from '../store/notesStore';
import './VersionHistoryPanel.css';

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
  const { notebooks, getDocVersions, restoreVersion, updateDoc } = useNotesStore();
  
  // 获取文档的所有版本
  const versions = useMemo(() => {
    return getDocVersions(notebookId, docId) || [];
  }, [getDocVersions, notebookId, docId]);

  const [selectedVersion, setSelectedVersion] = useState<DocVersion | null>(null); // 当前选中的版本
  const [compareVersion, setCompareVersion] = useState<DocVersion | null>(null);   // 用于对比的版本
  const [showDiff, setShowDiff] = useState(false);                                 // 是否显示对比模式
  const [showTagModal, setShowTagModal] = useState(false);                         // 是否显示标签弹窗
  const [versionTag, setVersionTag] = useState('');                                // 版本标签
  const [versionComment, setVersionComment] = useState('');                        // 版本备注

  // 获取当前知识库和文档
  const activeNotebook = notebooks.find(nb => nb.id === notebookId);
  const currentDoc = activeNotebook?.docs.find(d => d.id === docId);

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
  const handleRestore = () => {
    if (selectedVersion && window.confirm('确定要恢复到此版本吗？')) {
      restoreVersion(notebookId, docId, selectedVersion.id);
      onClose();
    }
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
   * 获取版本类型样式类
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
  const renderDiff = () => {
    if (!selectedVersion || !compareVersion) return null;
    
    const currentContent = selectedVersion.content.split('\n');
    const compareContent = compareVersion.content.split('\n');
    
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
              {currentContent.map((line, idx) => (
                <div key={idx} className="diff-line">
                  <span className="diff-line-number">{idx + 1}</span>
                  <span className="diff-line-content">{line || ' '}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="diff-panel">
            <div className="diff-panel-header">
              <span>{new Date(compareVersion.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <div className="diff-body">
              {compareContent.map((line, idx) => (
                <div key={idx} className="diff-line">
                  <span className="diff-line-number">{idx + 1}</span>
                  <span className="diff-line-content">{line || ' '}</span>
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
          <div className="tag-modal-overlay" onClick={() => setShowTagModal(false)}>
            <div className="tag-modal" onClick={(e) => e.stopPropagation()}>
              <div className="tag-modal-header">
                <span className="tag-modal-title">添加版本标签</span>
                <button className="tag-modal-close" onClick={() => setShowTagModal(false)}>×</button>
              </div>
              <div className="tag-modal-body">
                <label className="tag-modal-label">标签名称</label>
                <input 
                  className="tag-modal-input"
                  value={versionTag}
                  onChange={(e) => setVersionTag(e.target.value)}
                  placeholder="例如: v1.0.0"
                />
                <label className="tag-modal-label">备注（可选）</label>
                <textarea 
                  className="tag-modal-textarea"
                  value={versionComment}
                  onChange={(e) => setVersionComment(e.target.value)}
                  placeholder="添加备注说明..."
                  rows={3}
                />
              </div>
              <div className="tag-modal-footer">
                <button className="tag-modal-btn secondary" onClick={() => setShowTagModal(false)}>
                  取消
                </button>
                <button className="tag-modal-btn primary" onClick={handleAddTag}>
                  确定
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VersionHistoryPanel;