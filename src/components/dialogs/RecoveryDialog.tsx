import React, { useEffect, useRef } from 'react';

interface RecoveryDialogProps {
  timestamp: string;
  docTitle: string;
  onRecover: () => void;
  onDiscard: () => void;
  /** 仅关闭弹窗（草稿保留在 localStorage，下次启动再次提示）。Esc / 点遮罩触发 */
  onClose?: () => void;
}

/**
 * 草稿恢复弹窗（样式对应 index.css 的 .confirm-dialog-* + .recovery-*）。
 * 交互约定：
 * - 默认聚焦"恢复草稿"（安全侧操作）
 * - Esc / 点遮罩 = 仅关闭（绝不静默丢弃草稿），丢弃必须显式点击"丢弃草稿"
 */
export const RecoveryDialog: React.FC<RecoveryDialogProps> = ({
  timestamp,
  docTitle,
  onRecover,
  onDiscard,
  onClose,
}) => {
  const recoverBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    recoverBtnRef.current?.focus();

    if (!onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // capture 阶段拦截，阻断全局 useKeyboard 的 Escape（避免连带关闭背后的面板）
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="confirm-dialog-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="检测到未保存的更改"
    >
      <div className="confirm-dialog recovery-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-header">
          <span className="confirm-dialog-icon recovery-icon" aria-hidden="true">
            💾
          </span>
          <h3>检测到未保存的更改</h3>
        </div>
        <p>我们检测到您有未保存的草稿，是否恢复？</p>
        <div className="recovery-info">
          <div className="recovery-item">
            <span className="recovery-label">文档</span>
            <span className="recovery-value">{docTitle || '未命名文档'}</span>
          </div>
          <div className="recovery-item">
            <span className="recovery-label">保存时间</span>
            <span className="recovery-value">{new Date(timestamp).toLocaleString('zh-CN')}</span>
          </div>
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" onClick={onDiscard}>
            丢弃草稿
          </button>
          <button ref={recoverBtnRef} type="button" className="btn-primary" onClick={onRecover}>
            恢复草稿
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecoveryDialog;
