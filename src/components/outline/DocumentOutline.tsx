import React, { useMemo, useCallback, useState } from 'react';
import { IconLayers } from '@/components/common/Icon';

interface Heading {
  id: string;
  text: string;
  level: number;
  position: number;
  children?: Heading[];
}

interface DocumentOutlineProps {
  content: string;
  onHeadingClick: (position: number) => void;
  isOpen: boolean;
  onClose: () => void;
  /**
   * 当前阅读位置所属的标题 id（由 Editor 按光标/滚动推算）。
   * 语雀的大纲会跟随阅读位置高亮，长文档里才知道"现在在哪一节"。
   */
  activeHeadingId?: string | null;
}

export const DocumentOutline: React.FC<DocumentOutlineProps> = ({
  content,
  onHeadingClick,
  isOpen,
  onClose,
  activeHeadingId = null,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  // 折叠状态按「节点」记录。按 level 记录会导致折叠一个 h2 时联动折叠全文所有 h2。
  // 这里记的是"已折叠集合"而非"已展开集合"：默认全部展开，无需在内容变化时同步初始化。
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const headings = useMemo((): Heading[] => {
    // 面板未打开时跳过全文正则扫描：否则每次击键即使面板关闭也会解析全文
    if (!isOpen) return [];
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const matches: Heading[] = [];
    const seen = new Map<string, number>();
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      // 稳定 id 由「层级 + 文本」生成（而非数组序号）：编辑文档时不会因序号位移而丢失折叠态；
      // 同名同级的重复标题追加出现序号区分，保证 id 唯一
      const base = `${level}-${text}`;
      const occurrence = seen.get(base) ?? 0;
      seen.set(base, occurrence + 1);
      matches.push({
        id: occurrence === 0 ? base : `${base}~${occurrence}`,
        text,
        level,
        position: match.index,
      });
    }

    return matches;
  }, [content, isOpen]);

  // 构建树形结构
  const headingTree = useMemo(() => {
    const root: Heading[] = [];
    const stack: Heading[] = [];

    headings.forEach(heading => {
      const node = { ...heading, children: [] };

      // 找到合适的父节点
      while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        root.push(node);
      } else {
        stack[stack.length - 1].children = stack[stack.length - 1].children || [];
        stack[stack.length - 1].children!.push(node);
      }

      stack.push(node);
    });

    return root;
  }, [headings]);

  // 过滤后的标题
  const filteredHeadings = useMemo(() => {
    if (!searchQuery.trim()) return headings;
    const query = searchQuery.toLowerCase();
    return headings.filter(h => h.text.toLowerCase().includes(query));
  }, [headings, searchQuery]);

  const handleHeadingClick = useCallback((heading: Heading) => {
    onHeadingClick(heading.position);
  }, [onHeadingClick]);

  const toggleNode = useCallback((id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  /**
   * 当前高亮项若被折叠隐藏，自动展开其祖先链。
   *
   * 这里**不写回 collapsedIds**（旧实现放在 effect 里 setState，会触发级联渲染，
   * 也被 react-hooks/set-state-in-effect 规则拦下）。改为在渲染时把祖先视为展开：
   * 用户手动的折叠意图仍然留在状态里，只是"当前所在章节"必须可见 ——
   * 否则跟随高亮在折叠过的父节点下会静默失效（那一项根本不在 DOM 里）。
   */
  const activeAncestorIds = useMemo(() => {
    const set = new Set<string>();
    if (!activeHeadingId || !isOpen) return set;

    const find = (nodes: Heading[], trail: string[]): boolean => {
      for (const node of nodes) {
        const nextTrail = [...trail, node.id];
        if (node.id === activeHeadingId) {
          // 只收集"祖先"（不含自身）：自身被折叠时展开它与用户意图相反
          nextTrail.slice(0, -1).forEach((id) => set.add(id));
          return true;
        }
        if (node.children && find(node.children, nextTrail)) return true;
      }
      return false;
    };

    find(headingTree, []);
    return set;
  }, [activeHeadingId, isOpen, headingTree]);

  const renderHeadingItem = (heading: Heading, depth: number = 0): React.JSX.Element => {
    const indent = depth * 16;
    const levelClass = 'heading-level-' + heading.level;
    const hasChildren = heading.children && heading.children.length > 0;
    const isExpanded = !collapsedIds.has(heading.id) || activeAncestorIds.has(heading.id);
    const isActive = heading.id === activeHeadingId;

    return (
      <React.Fragment key={heading.id}>
        <div className="outline-item-wrapper" style={{ paddingLeft: indent + 'px' }}>
          {hasChildren && (
            <button
              className="outline-expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(heading.id);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                <polyline points={isExpanded ? '6 9 12 15 18 9' : '9 18 15 12 9 6'} />
              </svg>
            </button>
          )}
          <button
            className={'outline-item ' + levelClass + (isActive ? ' active' : '')}
            onClick={() => handleHeadingClick(heading)}
            aria-current={isActive ? 'location' : undefined}
          >
            <span className="outline-item-text">{heading.text}</span>
            <span className="outline-item-level">H{heading.level}</span>
          </button>
        </div>
        {hasChildren && isExpanded && heading.children!.map(child =>
          renderHeadingItem(child, depth + 1)
        )}
      </React.Fragment>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="outline-panel">
      <div className="outline-header">
        <h3 className="outline-title"><IconLayers size={15} /> 目录大纲</h3>
        <button className="outline-close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="outline-search">
        <input
          type="text"
          className="outline-search-input"
          placeholder="搜索标题..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="outline-search-clear"
            onClick={() => setSearchQuery('')}
          >
            ✕
          </button>
        )}
      </div>
      <div className="outline-content">
        {headings.length === 0 ? (
          <div className="empty-outline">
            <span className="empty-icon">📄</span>
            <span className="empty-text">暂无标题</span>
            <span className="empty-hint">使用 # 标记创建标题</span>
          </div>
        ) : searchQuery && filteredHeadings.length === 0 ? (
          <div className="empty-outline">
            <span className="empty-icon">🔍</span>
            <span className="empty-text">未找到匹配标题</span>
          </div>
        ) : (
          <div className="outline-list">
            {searchQuery
              ? filteredHeadings.map(heading => (
                  <button
                    key={heading.id}
                    className={'outline-item heading-level-' + heading.level}
                    style={{ paddingLeft: (heading.level - 1) * 16 + 'px' }}
                    onClick={() => handleHeadingClick(heading)}
                  >
                    <span className="outline-item-text">{heading.text}</span>
                    <span className="outline-item-level">H{heading.level}</span>
                  </button>
                ))
              : headingTree.map(heading => renderHeadingItem(heading))
            }
          </div>
        )}
      </div>
      {headings.length > 0 && (
        <div className="outline-footer">
          <span className="outline-count">{headings.length} 个标题</span>
        </div>
      )}
    </div>
  );
};
