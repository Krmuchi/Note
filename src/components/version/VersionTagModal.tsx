/**
 * 添加版本标签弹窗：填写标签名称与备注。
 * 自 VersionHistoryPanel 抽出，DOM 结构与 class 名保持不变。
 */

import type { JSX } from 'react';

interface VersionTagModalProps {
  versionTag: string;                                  // 标签名称
  versionComment: string;                              // 版本备注
  onVersionTagChange: (value: string) => void;         // 标签名称变更
  onVersionCommentChange: (value: string) => void;     // 备注变更
  onClose: () => void;                                 // 关闭弹窗
  onConfirm: () => void;                               // 确定
}

/**
 * 添加版本标签弹窗组件
 */
export default function VersionTagModal({
  versionTag,
  versionComment,
  onVersionTagChange,
  onVersionCommentChange,
  onClose,
  onConfirm,
}: VersionTagModalProps): JSX.Element {
  return (
    <div className="vh-tag-modal-overlay" onClick={onClose}>
      <div className="vh-tag-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vh-tag-modal-header">
          <span className="vh-tag-modal-title">添加版本标签</span>
          <button className="vh-tag-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="vh-tag-modal-body">
          <label className="vh-tag-modal-label">标签名称</label>
          <input
            className="vh-tag-modal-input"
            value={versionTag}
            onChange={(e) => onVersionTagChange(e.target.value)}
            placeholder="例如: v1.0.0"
          />
          <label className="vh-tag-modal-label">备注（可选）</label>
          <textarea
            className="vh-tag-modal-textarea"
            value={versionComment}
            onChange={(e) => onVersionCommentChange(e.target.value)}
            placeholder="添加备注说明..."
            rows={3}
          />
        </div>
        <div className="vh-tag-modal-footer">
          <button className="vh-tag-modal-btn secondary" onClick={onClose}>
            取消
          </button>
          <button className="vh-tag-modal-btn primary" onClick={onConfirm}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}