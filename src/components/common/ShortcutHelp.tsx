import { useEffect, useMemo, useRef } from 'react';
import type { JSX } from 'react';
import { useNotesStore } from '@/store';
import { formatKeyLabel } from '@/utils/shortcuts';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HelpItem {
  keys: string[];
  description: string;
}

interface HelpGroup {
  category: string;
  items: HelpItem[];
}

/** 面板内的导航键位不涉及可配置快捷键，单独维护 */
const PANEL_NAV_GROUPS: HelpGroup[] = [
  { category: '搜索面板', items: [
    { keys: ['↑', '↓'], description: '导航搜索结果' },
    { keys: ['Enter'], description: '确认选择' },
    { keys: ['Esc'], description: '关闭搜索' },
  ]},
  { category: '其他', items: [
    { keys: ['Esc'], description: '关闭弹窗' },
    { keys: ['Ctrl', 'Shift', 'P'], description: '切换预览模式' },
    { keys: ['Ctrl', 'Shift', 'E'], description: '专注模式' },
    { keys: ['/'], description: '唤出斜杠命令' },
    { keys: ['Tab'], description: '缩进（Shift+Tab 反缩进）' },
  ]},
];

export default function ShortcutHelp({ isOpen, onClose }: ShortcutHelpProps): JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null);
  // 焦点陷阱：Tab 在面板内循环，关闭后归还焦点（A2）
  const trapRef = useFocusTrap<HTMLDivElement>();
  // 键位单一数据源：来自 keyboardSlice（含用户自定义覆盖），避免与编辑器实现漂移
  const shortcuts = useNotesStore((s) => s.shortcuts);

  const groups = useMemo<HelpGroup[]>(() => {
    const map = new Map<string, HelpItem[]>();
    shortcuts.forEach((s) => {
      const list = map.get(s.category) ?? [];
      list.push({ keys: s.keys, description: s.name });
      map.set(s.category, list);
    });
    return [...map.entries()].map(([category, items]) => ({ category, items })).concat(PANEL_NAV_GROUPS);
  }, [shortcuts]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="shortcut-help-overlay" ref={overlayRef} onClick={onClose}>
      <div
        ref={trapRef}
        className="shortcut-help-panel"
        role="dialog"
        aria-modal="true"
        aria-label="快捷键"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcut-help-header">
          {/* CSS 在 styles/common.css（非本文件族）：标题内 svg 用最小 inline flex 保持与文字同轴 */}
          <h2
            className="shortcut-help-title"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
            </svg>
            快捷键
          </h2>
          <button className="shortcut-help-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="shortcut-help-body">
          {groups.map(group => (
            <div key={group.category} className="shortcut-group">
              <h3 className="shortcut-group-title">{group.category}</h3>
              <div className="shortcut-list">
                {group.items.map(item => (
                  <div key={item.description} className="shortcut-item">
                    <span className="shortcut-description">{item.description}</span>
                    <span className="shortcut-keys">
                      {item.keys.map((key, i) => (
                        <span key={i}>
                          <kbd>{formatKeyLabel(key)}</kbd>
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
