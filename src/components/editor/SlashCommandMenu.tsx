import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** 斜杠命令项定义 */
export interface SlashCommandItem {
  id: string;
  title: string;
  /** 模糊搜索关键词（含英文别名，如 table / code / date） */
  keywords: string[];
  group: 'block' | 'media' | 'advanced';
  /** 图标：复用工具栏的字符/符号方案，避免引入图标库 */
  icon: string;
  /** 右侧键位提示（可选） */
  hint?: string;
}

export interface SlashCaretPosition {
  top: number;
  left: number;
}

interface SlashCommandMenuProps {
  query: string;
  items: SlashCommandItem[];
  position: SlashCaretPosition;
  onRun: (item: SlashCommandItem) => void;
  onClose: () => void;
}

const GROUP_LABELS: Record<SlashCommandItem['group'], string> = {
  block: '基础块',
  media: '媒体',
  advanced: '高级',
};
const GROUP_ORDER: SlashCommandItem['group'][] = ['block', 'media', 'advanced'];

/** 简易模糊匹配：标题前缀 > 标题包含 > 关键词匹配 */
function matchScore(item: SlashCommandItem, q: string): number {
  if (!q) return 1;
  const lower = q.toLowerCase();
  const title = item.title.toLowerCase();
  if (title.startsWith(lower)) return 3;
  if (title.includes(lower)) return 2;
  if (item.keywords.some((k) => k.toLowerCase().includes(lower))) return 1;
  return 0;
}

/**
 * 斜杠命令浮层。
 * - 自身持有键盘导航（↑↓/Enter/Tab/Esc），在 window 捕获阶段拦截，焦点不脱离 textarea
 * - 仅挂载期间监听，卸载即解绑
 */
export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  query,
  items,
  position,
  onRun,
  onClose,
}) => {
  const matched = useMemo(() => {
    const scored = items
      .map((item) => ({ item, score: matchScore(item, query.trim()) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return GROUP_ORDER.flatMap((g) => scored.filter((s) => s.item.group === g).map((s) => s.item));
  }, [items, query]);

  // 分组渲染结构：预计算扁平索引，避免渲染期变量自增
  const sections = useMemo(() => {
    const arr: { group: SlashCommandItem['group']; items: { item: SlashCommandItem; flatIndex: number }[] }[] = [];
    let flat = 0;
    GROUP_ORDER.forEach((group) => {
      const groupItems = matched
        .filter((i) => i.group === group)
        .map((item) => ({ item, flatIndex: flat++ }));
      if (groupItems.length > 0) arr.push({ group, items: groupItems });
    });
    return arr;
  }, [matched]);

  // 查询词变化后高亮项回到首位：以 {query, index} 一体化存储，避免在 effect 中同步 setState
  const [nav, setNav] = useState<{ query: string; index: number }>({ query, index: 0 });
  const activeIndex = nav.query === query ? nav.index : 0;
  const setActiveIndex = useCallback((index: number) => setNav({ query, index }), [query]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex(matched.length === 0 ? 0 : (activeIndex + 1) % matched.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex(matched.length === 0 ? 0 : (activeIndex - 1 + matched.length) % matched.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const target = matched[activeIndex];
        if (target) {
          e.preventDefault();
          e.stopPropagation();
          onRun(target);
        } else {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // 捕获阶段拦截：早于 textarea 与全局快捷键处理
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [matched, activeIndex, onRun, onClose, setActiveIndex]);

  // 高亮项滚动进可视区
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (matched.length === 0) {
    return (
      <div className="slash-menu" style={{ top: position.top, left: position.left }} role="listbox">
        <div className="slash-empty">无匹配命令</div>
      </div>
    );
  }

  return (
    <div
      className="slash-menu"
      style={{ top: position.top, left: position.left }}
      role="listbox"
      // 浮层内禁止抢焦点：点击时保持 textarea 选区
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="slash-list" ref={listRef}>
        {sections.map(({ group, items: groupItems }) => (
          <div className="slash-group" key={group}>
            <div className="slash-group-label">{GROUP_LABELS[group]}</div>
            {groupItems.map(({ item, flatIndex }) => {
              const isActive = flatIndex === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`slash-item ${isActive ? 'active' : ''}`}
                  data-active={isActive}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActiveIndex(flatIndex)}
                  onClick={() => onRun(item)}
                >
                  <span className="slash-icon">{item.icon}</span>
                  <span className="slash-title">{item.title}</span>
                  {item.hint && <span className="slash-hint">{item.hint}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SlashCommandMenu;
