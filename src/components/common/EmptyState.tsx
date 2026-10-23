import React from 'react';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  /** 图标节点（传 <IconXxx /> 而非 emoji 字符） */
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

interface EmptyStateProps {
  /** 图标节点：传 SVG 图标组件（如 <IconDocument size={36} />），不要传 emoji */
  icon: React.ReactNode;
  title: string;
  description?: string;
  actions?: EmptyStateAction[];
  className?: string;
}

/**
 * 通用空状态组件
 * 用于展示列表为空时的引导信息
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actions = [],
  className = '',
}) => {
  return (
    <div className={`empty-state ${className}`}>
      <div className="empty-state-icon-wrapper">
        <span className="empty-state-icon">{icon}</span>
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && (
        <p className="empty-state-description">{description}</p>
      )}
      {actions.length > 0 && (
        <div className="empty-state-actions">
          {actions.map((action, index) => (
            <button
              key={index}
              className={`empty-state-btn ${action.variant || 'primary'}`}
              onClick={action.onClick}
            >
              {action.icon && <span className="empty-state-btn-icon">{action.icon}</span>}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
