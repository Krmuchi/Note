import React, { useEffect, useRef } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * 知识库图标选择器。
 *
 * 用 emoji 而不是图片：无需管理图片资源、落盘路径与导入流程，
 * 与项目"零新增运行时依赖、不引入图片资产"的取向一致。
 * 分组是为了让用户在几十个候选里更快找到语义（文档/学习/工作/生活）。
 */

const ICON_GROUPS: { label: string; icons: string[] }[] = [
  { label: '常用', icons: ['📁', '📚', '📝', '📄', '📖', '🗂️', '📓', '📔'] },
  { label: '学习', icons: ['🎓', '🧠', '💡', '🔬', '🧪', '📐', '🗒️', '✏️'] },
  { label: '工作', icons: ['💼', '📊', '📈', '🗓️', '✅', '⚙️', '🏢', '📌'] },
  { label: '生活', icons: ['🏠', '🌱', '🍀', '☕', '🎵', '🎨', '✈️', '🧳'] },
  { label: '其它', icons: ['⭐', '🔥', '❤️', '🌙', '☀️', '⚡', '🎯', '🔖'] },
];

interface NotebookIconPickerProps {
  /** 当前图标；空串表示使用默认图标 */
  current: string;
  /** 选中图标；传空串表示恢复默认 */
  onPick: (icon: string) => void;
  onClose: () => void;
}

export const NotebookIconPicker: React.FC<NotebookIconPickerProps> = ({
  current,
  onPick,
  onClose,
}) => {
  // 焦点陷阱 + 关闭后归还焦点，与项目其它弹窗保持一致（A2）。
  // 必须显式给出元素类型：默认推断为 HTMLElement，与 div 的 ref 类型不兼容
  const trapRef = useFocusTrap<HTMLDivElement>();
  const firstBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div className="notebook-icon-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="选择知识库图标">
      <div
        ref={trapRef}
        className="notebook-icon-picker"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notebook-icon-header">
          <h3 className="notebook-icon-title">选择图标</h3>
          <button type="button" className="notebook-icon-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="notebook-icon-body">
          {ICON_GROUPS.map((group) => (
            <div key={group.label} className="notebook-icon-group">
              <div className="notebook-icon-group-label">{group.label}</div>
              <div className="notebook-icon-grid">
                {group.icons.map((icon, index) => (
                  <button
                    key={icon}
                    ref={group.label === '常用' && index === 0 ? firstBtnRef : undefined}
                    type="button"
                    className={`notebook-icon-option ${current === icon ? 'active' : ''}`}
                    onClick={() => onPick(icon)}
                    aria-label={`使用图标 ${icon}`}
                    aria-pressed={current === icon}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="notebook-icon-footer">
          {/* 恢复默认必须是显式动作：用户可能只是想把图标清掉，而不是再选一个 */}
          <button
            type="button"
            className="notebook-icon-reset"
            onClick={() => onPick('')}
            disabled={!current}
          >
            恢复默认图标
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotebookIconPicker;
