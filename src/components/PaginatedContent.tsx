import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 分页内容组件属性
 */
interface PaginatedContentProps {
  content: string;                                    // 完整内容
  pageSize?: number;                                  // 每页大小（字符数）
  className?: string;                                 // 自定义类名
  style?: React.CSSProperties;                        // 自定义样式
  renderContent?: (content: string) => React.ReactNode; // 自定义渲染函数
  onLoadMore?: (currentPage: number) => void;         // 加载更多回调
}

/**
 * 分页内容组件
 * 用于长文本内容的懒加载，支持自动和手动加载更多
 */
export const PaginatedContent: React.FC<PaginatedContentProps> = ({
  content,
  pageSize = 1000,
  className,
  style,
  renderContent,
  onLoadMore,
}) => {
  const [currentPage, setCurrentPage] = useState(1);       // 当前页码
  const [displayedContent, setDisplayedContent] = useState(''); // 已显示内容
  const [hasMore, setHasMore] = useState(true);           // 是否还有更多内容
  const [isLoading, setIsLoading] = useState(false);       // 是否正在加载
  const sentinelRef = useRef<HTMLDivElement>(null);        // 哨兵元素引用（用于 IntersectionObserver）

  const totalPages = Math.ceil(content.length / pageSize); // 总页数

  /**
   * 加载更多内容
   */
  const loadMoreContent = useCallback(() => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    
    // 模拟异步加载
    setTimeout(() => {
      const nextPage = currentPage + 1;
      const endIndex = nextPage * pageSize;
      const newContent = content.slice(0, endIndex);
      
      setDisplayedContent(newContent);
      setCurrentPage(nextPage);
      setHasMore(endIndex < content.length);
      setIsLoading(false);
      
      onLoadMore?.(nextPage);
    }, 100);
  }, [currentPage, content, pageSize, isLoading, hasMore, onLoadMore]);

  // 初始化内容
  useEffect(() => {
    const initialContent = content.slice(0, pageSize);
    setDisplayedContent(initialContent);
    setHasMore(content.length > pageSize);
    setCurrentPage(1);
  }, [content, pageSize]);

  // 使用 IntersectionObserver 自动加载更多
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMoreContent();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const sentinel = sentinelRef.current;
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => {
      if (sentinel) {
        observer.unobserve(sentinel);
      }
    };
  }, [hasMore, isLoading, loadMoreContent]);

  /**
   * 手动加载更多按钮点击处理
   */
  const handleLoadMore = () => {
    loadMoreContent();
  };

  // 渲染内容
  const renderedContent = renderContent ? renderContent(displayedContent) : displayedContent;

  return (
    <div className={className} style={style}>
      {renderedContent}
      
      {hasMore && (
        <div ref={sentinelRef} style={{ padding: '20px', textAlign: 'center' }}>
          {isLoading ? (
            <div style={{ color: '#999', fontSize: '14px' }}>
              加载中...
            </div>
          ) : (
            <button
              onClick={handleLoadMore}
              style={{
                padding: '8px 16px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                background: '#fff',
                color: '#333',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              加载更多 ({currentPage}/{totalPages})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PaginatedContent;