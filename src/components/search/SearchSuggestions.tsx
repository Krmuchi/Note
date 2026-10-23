/**
 * 搜索建议列表：按"历史 / 文档 / 标签"分组展示联想词，支持键盘高亮。
 *
 * 分组只改变**视觉呈现**，不改变数据顺序与下标：
 * `activeIndex` 始终是 `suggestions` 数组里的原始下标，因此键盘 ↑↓ 与回车
 * 的逻辑完全不受影响（这里刻意不做排序，只按类型插入组标题）。
 */
import type { JSX } from 'react';
import type { SearchSuggestion } from '@/types';
import { HighlightMatch } from './HighlightMatch';

interface SearchSuggestionsProps {
  suggestions: SearchSuggestion[];                     // 建议列表
  query: string;                                       // 当前关键词（用于高亮）
  activeIndex: number;                                 // 键盘高亮下标（suggestions 原始下标）
  onSuggestionClick: (suggestion: SearchSuggestion) => void; // 点击建议
}

const GROUP_ORDER: { type: SearchSuggestion['type']; label: string }[] = [
  { type: 'history', label: '最近搜索' },
  { type: 'title', label: '文档' },
  { type: 'tag', label: '标签' },
  // 正文命中（type: 'content'）由搜索结果页展示，建议列表不出现；
  // 但类型联合里有它，分组表必须覆盖，否则新增类型会被静默漏掉
  { type: 'content', label: '正文' },
];

const ICON: Record<SearchSuggestion['type'], string> = {
  history: '🕐',
  title: '📄',
  tag: '🏷️',
  content: '📝',
};

/**
 * 搜索建议列表组件
 */
export default function SearchSuggestions({
  suggestions,
  query,
  activeIndex,
  onSuggestionClick,
}: SearchSuggestionsProps): JSX.Element {
  return (
    <div className="search-suggestions">
      {GROUP_ORDER.map((group) => {
        // 收集该类型的所有建议，**保留其原始下标**用于键盘高亮
        const items: { suggestion: SearchSuggestion; index: number }[] = [];
        suggestions.forEach((suggestion, index) => {
          if (suggestion.type === group.type) items.push({ suggestion, index });
        });
        if (items.length === 0) return null;

        return (
          <div key={group.type} className="suggestion-group">
            <div className="suggestion-group-label" aria-hidden="true">{group.label}</div>
            {items.map(({ suggestion, index }) => (
              <div
                key={`${suggestion.text}-${index}`}
                className={`suggestion-item ${activeIndex === index ? 'active' : ''}`}
                data-search-item
                onClick={() => onSuggestionClick(suggestion)}
              >
                <span className="suggestion-icon">{ICON[suggestion.type]}</span>
                <span className="suggestion-text">
                  <HighlightMatch text={suggestion.text} query={query} />
                </span>
                <span className="suggestion-type">
                  {suggestion.type === 'tag' && '标签'}
                  {suggestion.type === 'title' && '文档'}
                  {suggestion.type === 'history' && '历史'}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
