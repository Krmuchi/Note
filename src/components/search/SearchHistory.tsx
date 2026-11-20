/**
 * 搜索历史列表：置顶优先排序的历史词，支持置顶 / 删除 / 清空 / 点击复搜。
 * 自 SearchPanel 抽出，DOM 结构、data-search-item 标记与 class 名保持不变。
 */
import type { JSX } from 'react';
import type { SearchHistory as SearchHistoryItem } from '@/types';

/**
 * 图钉图标：图标库里没有 pin，按 DocTree 的内联 svg 先例（24 viewBox / stroke 2 / currentColor）。
 * 置顶 = 实心图钉、未置顶 = 描边图钉 —— 状态本身由按钮的 title/aria-label 承担，
 * 不能只靠图形差异，否则读屏用户分辨不出这条是否已置顶。
 */
const PinIcon = ({ filled }: { filled?: boolean }): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

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
      {/* 顺序由调用方保证（store 写入路径 + SearchPanel 的 sortSearchHistory）：
          置顶在前、其余保持时间序。这里不再本地排序 —— 渲染顺序必须与
          SearchPanel 键盘 Enter 的取词下标完全一致，两处各排一次极易漂移。 */}
      {searchHistory.map((history, index) => (
        <div key={history.id} className={`history-item ${activeIndex === index ? 'active' : ''} ${history.pinned ? 'pinned' : ''}`} data-search-item>
          <button 
            className="history-pin"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(history.id);
            }}
            title={history.pinned ? '取消置顶' : '置顶'}
            aria-label={history.pinned ? '取消置顶' : '置顶'}
          >
            <PinIcon filled={history.pinned} />
          </button>
          <button 
            className="history-text"
            onClick={() => {
              // 同步输入框但不排队防抖搜索，再用显式关键词立刻搜一次：
              // 旧版 onSearch() 读的是还没提交的 query（空串 → 直接 return），
              // 点历史词要干等 400ms 防抖、也不会更新这条历史的使用计数
              onQueryChange(history.query, { skipSearch: true });
              onSearch(history.query);
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