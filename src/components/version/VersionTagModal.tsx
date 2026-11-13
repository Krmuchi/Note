/**
 * 添加版本标签弹窗：填写标签名称与备注。
 * 自 VersionHistoryPanel 抽出，DOM 结构与 class 名保持不变。
 */

import { useEffect } from 'react';
import type { JSX } from 'react';

interface VersionTagModalProps {
  versionTag: string;                                  // 标签名称
  versionComment: string;                              // 备注
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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // capture 阶段拦截并阻断全局 useKeyboard 的 Escape：
      // 只关本弹窗，不能连带关掉背后的版本历史面板（填了一半的标签/备注会丢）
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  return (
    <div className="vh-tag-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="添加版本标签">
      <div className="vh-tag-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vh-tag-modal-header">
          <span className="vh-tag-modal-title">添加版本标签</span>
          <button className="vh-tag-modal-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="vh-tag-modal-body">
          <label className="vh-tag-modal-label">标签名称</label>
          <input
            className="vh-tag-modal-input"
            value={versionTag}
            onChange={(e) => onVersionTagChange(e.target.value)}
            placeholder="例如: v1.0.0"
            autoFocus
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
          {/* 空名时禁用并说明原因：父组件对空名是静默忽略，按钮看起来能点却没反应 */}
          <button
            className="vh-tag-modal-btn primary"
            onClick={onConfirm}
            disabled={!versionTag.trim()}
            title={!versionTag.trim() ? '请先填写标签名称' : undefined}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
