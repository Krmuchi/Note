import React, { useMemo, useCallback, useState } from 'react';

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
}

export const DocumentOutline: React.FC<DocumentOutlineProps> = ({
  content,
  onHeadingClick,
  isOpen,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set([1, 2, 3]));

  const headings = useMemo((): Heading[] => {
    // 面板未打开时跳过全文正则扫描：否则每次击键即使面板关闭也会解析全文
    if (!isOpen) return [];
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const matches: Heading[] = [];
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      matches.push({
        id: 'heading-' + matches.length,
        text: match[2].trim(),
        level: match[1].length,
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

  const toggleLevel = useCallback((level: number) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  const renderHeadingItem = (heading: Heading, depth: number = 0): import('react').ReactElement => {
    const indent = depth * 16;
    const levelClass = 'heading-level-' + heading.level;
    const hasChildren = heading.children && heading.children.length > 0;
    const isExpanded = expandedLevels.has(heading.level);

    return (
      <React.Fragment key={heading.id}>
        <div className="outline-item-wrapper" style={{ paddingLeft: indent + 'px' }}>
          {hasChildren && (
            <button
              className="outline-expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleLevel(heading.level);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                <polyline points={isExpanded ? '6 9 12 15 18 9' : '9 18 15 12 9 6'} />
              </svg>
            </button>
          )}
          <button
            className={'outline-item ' + levelClass}
            onClick={() => handleHeadingClick(heading)}
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
        <h3 className="outline-title">📋 目录大纲</h3>
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
