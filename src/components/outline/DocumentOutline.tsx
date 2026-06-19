import React, { useMemo, useCallback } from 'react';

interface Heading {
  id: string;
  text: string;
  level: number;
  position: number;
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
  const headings = useMemo((): Heading[] => {
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const matches = [];
    let match;
    
    while ((match = headingRegex.exec(content)) !== null) {
      matches.push({
        id: `heading-${matches.length}`,
        text: match[2].trim(),
        level: match[1].length,
        position: match.index,
      });
    }
    
    return matches;
  }, [content]);

  const handleHeadingClick = useCallback((heading: Heading) => {
    onHeadingClick(heading.position);
  }, [onHeadingClick]);

  const renderHeading = (heading: Heading) => {
    const indent = (heading.level - 1) * 16;
    const levelClass = `heading-level-${heading.level}`;
    
    return (
      <button
        key={heading.id}
        className={`outline-item ${levelClass}`}
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => handleHeadingClick(heading)}
      >
        {heading.text}
      </button>
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
      <div className="outline-content">
        {headings.length === 0 ? (
          <div className="empty-outline">
            <span className="empty-icon">📄</span>
            <span className="empty-text">暂无标题</span>
          </div>
        ) : (
          <div className="outline-list">
            {headings.map(renderHeading)}
          </div>
        )}
      </div>
    </div>
  );
};