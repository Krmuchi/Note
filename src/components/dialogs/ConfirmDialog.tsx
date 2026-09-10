import React, { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 通用确认弹窗（样式对应 index.css 的 .confirm-dialog-*）。
 * danger 变体用于不可撤销操作（永久删除/清空回收站）：
 * - 红色警示图标 + 左侧红条
 * - 默认聚焦"取消"按钮，防止连按 Enter 误删
 * - Esc 关闭等同取消
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  variant = 'default',
  onConfirm,
  onCancel,
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const isDanger = variant === 'danger';

  useEffect(() => {
    // 默认聚焦"取消"：危险操作的键盘路径应落在安全侧
    cancelBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // capture 阶段拦截并阻断全局 useKeyboard 的 Escape（避免一次 Esc 同时关掉背后的面板）
      e.stopImmediatePropagation();
      e.preventDefault();
      onCancel();
    };
    // capture：先于 window 上的 bubble 监听器（useKeyboard）执行
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  return (
    <div
      className="confirm-dialog-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`confirm-dialog ${isDanger ? 'confirm-dialog-danger' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-dialog-header">
          {isDanger && (
            <span className="confirm-dialog-icon" aria-hidden="true">
              ⚠️
            </span>
          )}
          <h3>{title}</h3>
        </div>
        <p>{message}</p>
        <div className="confirm-dialog-actions">
          <button ref={cancelBtnRef} type="button" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className={isDanger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
