/**
 * 版本内容详情：展示选中版本的标题、元信息（时间/标签/备注）、操作按钮与正文。
 * 自 VersionHistoryPanel 抽出，DOM 结构与 class 名保持不变。
 */
import type { JSX } from 'react'
import type { DocVersion } from '@/types'

interface VersionContentDetailProps {
  selectedVersion: DocVersion | null; // 当前选中的版本
  showDiff: boolean;                  // 是否处于对比模式（对比模式下隐藏恢复按钮）
  onAddTag: () => void;               // 打开添加标签弹窗
  onExport: () => void;               // 导出版本
  onRestore: () => void;              // 恢复此版本
}

/**
 * 版本内容详情组件
 */
export default function VersionContentDetail({
  selectedVersion,
  showDiff,
  onAddTag,
  onExport,
  onRestore,
}: VersionContentDetailProps): JSX.Element {
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
            onClick={onAddTag}
            title="添加标签"
          >
            🏷️ 添加标签
          </button>
          <button
            className="version-action-btn"
            onClick={onExport}
            title="导出版本"
          >
            📥 导出
          </button>
          {!showDiff && (
            <button
              className="version-action-btn primary"
              onClick={onRestore}
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
}