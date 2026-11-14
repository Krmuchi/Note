import React from 'react';

/**
 * 除 title / onClick / disabled / className / type 之外的按钮属性（data-*、aria-*、
 * role 等）全部原样透传。
 *
 * 旧实现只渲染固定 props：调用方传入的 data-eh-menu-trigger 被静默丢弃
 * （EditorHeaderCodeLangMenu / EditorHeaderTableMenu 就踩了这个坑），
 * 「点击外部关闭」的判定因此永远看不到这两个触发按钮。
 */
type IconBtnBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'title' | 'onClick' | 'disabled' | 'className' | 'type'
>;

export interface IconBtnProps extends IconBtnBaseProps {
  title: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** 编辑器头部通用图标按钮 */
export const IconBtn: React.FC<IconBtnProps> = ({
  title,
  onClick,
  active,
  disabled,
  className = '',
  children,
  ...rest
}) => (
  <button
    {...rest}
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
