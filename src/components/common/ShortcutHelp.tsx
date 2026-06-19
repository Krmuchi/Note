import { useEffect, useRef } from 'react';

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts = [
  { category: '通用', items: [
    { keys: ['Ctrl', 'K'], description: '打开搜索' },
    { keys: ['Ctrl', 'S'], description: '保存' },
    { keys: ['Ctrl', 'N'], description: '新建文档' },
    { keys: ['Ctrl', 'Shift', 'N'], description: '新建知识库' },
    { keys: ['Ctrl', '\\'], description: '切换侧边栏' },
    { keys: ['Ctrl', 'Shift', 'F'], description: '收藏/取消收藏' },
    { keys: ['Esc'], description: '关闭弹窗' },
  ]},
  { category: '编辑', items: [
    { keys: ['Ctrl', 'B'], description: '粗体' },
    { keys: ['Ctrl', 'I'], description: '斜体' },
    { keys: ['Ctrl', 'Z'], description: '撤销' },
    { keys: ['Ctrl', 'Y'], description: '重做' },
  ]},
  { category: '搜索面板', items: [
    { keys: ['↑', '↓'], description: '导航搜索结果' },
    { keys: ['Enter'], description: '确认选择' },
    { keys: ['Esc'], description: '关闭搜索' },
  ]},
];

export default function ShortcutHelp({ isOpen, onClose }: ShortcutHelpProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="shortcut-help-overlay" ref={overlayRef} onClick={onClose}>
      <div className="shortcut-help-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-help-header">
          <h2 className="shortcut-help-title">⌨️ 快捷键</h2>
          <button className="shortcut-help-close" onClick={onClose}>×</button>
        </div>
        <div className="shortcut-help-body">
          {shortcuts.map(group => (
            <div key={group.category} className="shortcut-group">
              <h3 className="shortcut-group-title">{group.category}</h3>
              <div className="shortcut-list">
                {group.items.map(item => (
                  <div key={item.description} className="shortcut-item">
                    <span className="shortcut-description">{item.description}</span>
                    <span className="shortcut-keys">
                      {item.keys.map((key, i) => (
                        <span key={i}>
                          <kbd>{key}</kbd>
                          {i < item.keys.length - 1 && <span className="shortcut-plus">+</span>}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}