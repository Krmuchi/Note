/**
 * 搜索历史列表：置顶优先排序的历史词，支持置顶 / 删除 / 清空 / 点击复搜。
 * 自 SearchPanel 抽出，DOM 结构、data-search-item 标记与 class 名保持不变。
 */
import type { JSX } from 'react';
import type { SearchHistory as SearchHistoryItem } from '@/types';

interface SearchHistoryProps {
  searchHistory: SearchHistoryItem[];                                          // 历史记录
  activeIndex: number;                                                         // 键盘高亮下标
  onQueryChange: (value: string, options?: { skipSearch?: boolean }) => void;  // 同步输入框
  onSearch: (explicitQuery?: string) => void;                                  // 执行搜索
  onClearHistory: () => void;                                                  // 清空历史
  onRemoveHistory: (id: string) => void;                                       // 删除单条
  onTogglePin: (id: string) => void;                                           // 置顶 / 取消置顶
}

/**
 * 搜索历史列表组件
 */
export default function SearchHistory({
  searchHistory,
  activeIndex,
  onQueryChange,
  onSearch,
  onClearHistory,
  onRemoveHistory,
  onTogglePin,
}: SearchHistoryProps): JSX.Element {
  return (
    <div className="search-history">
      <div className="history-header">
        <span>搜索历史</span>
        <button className="clear-history" onClick={onClearHistory}>
          清空
        </button>
      </div>
      {[...searchHistory]
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return 0
        })
        .map((history, index) => (
        <div key={history.id} className={`history-item ${activeIndex === index ? 'active' : ''} ${history.pinned ? 'pinned' : ''}`} data-search-item>
          <button 
            className="history-pin"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(history.id);
            }}
            title={history.pinned ? '取消置顶' : '置顶'}
          >
            {history.pinned ? '📌' : '📍'}
          </button>
          <button 
            className="history-text"
            onClick={() => {
              onQueryChange(history.query);
              onSearch();
            }}
          >
            {history.query}
          </button>
          <span className="history-count">{history.resultCount} 条结果</span>
          <button 
            className="history-remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveHistory(history.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}