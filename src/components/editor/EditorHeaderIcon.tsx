import React from 'react';

/** 编辑器头部通用图标按钮 */
export const IconBtn: React.FC<{
  title: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ title, onClick, active, disabled, className = '', children }) => (
  <button
    type="button"
    className={`eh-icon-btn ${active ? 'active' : ''} ${disabled ? 'disabled' : ''} ${className}`}
    title={title}
    aria-label={title}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </button>
);
