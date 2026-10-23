/**
 * 搜索结果列表：结果条数头部、返回按钮、空态与结果条目（标题 / 摘要高亮、标签、时间）。
 * 自 SearchPanel 抽出，DOM 结构、data-search-item 标记与 class 名保持不变。
 */
import type { JSX } from 'react';
import type { SearchResult, Tag } from '@/types';
import { formatDateTime } from '@/utils/formatters';
import { HighlightMatch } from './HighlightMatch';

interface SearchResultsProps {
  results: SearchResult[];                          // 结果列表
  query: string;                                    // 当前关键词（用于高亮）
  tags: Tag[];                                      // 可选标签（用于渲染结果标签）
  activeIndex: number;                              // 键盘高亮下标
  onResultClick: (result: SearchResult) => void;    // 点击结果跳转
  onBack: () => void;                               // 返回建议列表
}

/**
 * 格式化日期显示（统一使用 utils/formatters）
 */
const formatDate = (dateStr: string): string =>
  formatDateTime(dateStr, { prefixToday: true, prefixYesterday: true });

/**
 * 搜索结果列表组件
 */
export default function SearchResults({
  results,
  query,
  tags,
  activeIndex,
  onResultClick,
  onBack,
}: SearchResultsProps): JSX.Element {
  return (
    <div className="search-results">
      <div className="results-header">
        <span aria-live="polite">找到 {results.length} 条结果</span>
        <button 
          className="back-btn"
          onClick={onBack}
        >
          ← 返回
        </button>
      </div>
      
      {results.length === 0 ? (
        <div className="no-results">
          <span className="no-results-icon">🔍</span>
          <p>没有找到相关结果</p>
          <p className="no-results-hint">试试其他关键词或调整筛选条件</p>
        </div>
      ) : (
        <div className="results-list">
          {results.map((result, index) => (
            <div
              key={`${result.type}-${result.id}`}
              className={`result-item ${activeIndex === index ? 'active' : ''}`}
              data-search-item
              onClick={() => onResultClick(result)}
            >
              <div className="result-icon">
                {result.type === 'notebook' ? '📚' : '📄'}
              </div>
              <div className="result-content">
                <div className="result-title">
                  <HighlightMatch text={result.title} query={query} />
                </div>
                {result.highlights && result.highlights.length > 0 && (
                  <div className="result-preview">
                    <HighlightMatch 
                      text={
                        result.highlights[0].text.length > 100 
                          ? result.highlights[0].text.slice(0, 100) + '...'
                          : result.highlights[0].text
                      } 
                      query={query} 
                    />
                  </div>
                )}
                <div className="result-meta">
                  {result.tags.length > 0 && (
                    <div className="result-tags">
                      {result.tags.slice(0, 3).map(tagId => {
                        const tag = tags.find(t => t.id === tagId);
                        return tag ? (
                          <span 
                            key={tag.id} 
                            className="result-tag"
                            style={{ backgroundColor: tag.color + '30', color: tag.color }}
                          >
                            {tag.icon} {tag.name}
                          </span>
                        ) : null;
                      })}
                      {result.tags.length > 3 && (
                        <span className="result-tag-more">+{result.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                  <span className="result-date">{formatDate(result.updatedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}