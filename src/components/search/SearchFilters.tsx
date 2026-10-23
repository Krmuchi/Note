/**
 * 搜索筛选面板：类型 / 日期范围 / 标签筛选项。
 * 自 SearchPanel 抽出，DOM 结构与 class 名保持不变。
 */
import type { JSX } from 'react';
import type { SearchFilter, Tag } from '@/types';
import { QUICK_RANGE_DAYS, QUICK_RANGE_LABELS, buildQuickRange, isQuickRangeActive } from '@/utils/dateRange';

interface SearchFiltersProps {
  filters: SearchFilter;                                       // 当前筛选条件
  tags: Tag[];                                                 // 可选标签
  onFilterChange: (
    key: keyof SearchFilter,
    value: string | string[] | { start?: string; end?: string } | undefined
  ) => void;                                                   // 筛选条件变更
}

/**
 * 搜索筛选面板组件
 */
export default function SearchFilters({ filters, tags, onFilterChange }: SearchFiltersProps): JSX.Element {
  return (
    <div className="search-filter-panel">
      <div className="filter-row">
        <label>类型</label>
        <select 
          value={filters.type || 'all'}
          onChange={(e) => onFilterChange('type', e.target.value)}
        >
          <option value="all">全部</option>
          <option value="document">文档</option>
          <option value="notebook">知识库</option>
        </select>
      </div>
      
      <div className="filter-row">
        <label>排序</label>
        <select
          value={filters.sort || 'relevance'}
          onChange={(e) => onFilterChange('sort', e.target.value)}
        >
          <option value="relevance">相关度优先</option>
          <option value="time">最近更新</option>
        </select>
      </div>

      <div className="filter-row">
        <label>快捷时间</label>
        <div className="quick-ranges">
          {QUICK_RANGE_DAYS.map(days => (
            <button
              key={days}
              className={`quick-range-btn ${isQuickRangeActive(filters.dateRange, days) ? 'active' : ''}`}
              onClick={() => onFilterChange('dateRange', buildQuickRange(days))}
            >
              {QUICK_RANGE_LABELS[days]}
            </button>
          ))}
          <button
            className={`quick-range-btn ${filters.dateRange ? '' : 'active'}`}
            onClick={() => onFilterChange('dateRange', undefined)}
          >
            不限
          </button>
        </div>
      </div>

      <div className="filter-row">
        <label>日期范围</label>
        <div className="date-range">
          <input 
            type="date" 
            value={filters.dateRange?.start || ''}
            onChange={(e) => onFilterChange('dateRange', {
              ...filters.dateRange,
              start: e.target.value
            })}
          />
          <span>至</span>
          <input 
            type="date" 
            value={filters.dateRange?.end || ''}
            onChange={(e) => onFilterChange('dateRange', {
              ...filters.dateRange,
              end: e.target.value
            })}
          />
        </div>
      </div>
      
      <div className="filter-row">
        <label>标签</label>
        <div className="tag-filter">
          {tags.slice(0, 5).map(tag => (
            <button
              key={tag.id}
              className={`filter-tag ${filters.tags?.includes(tag.id) ? 'selected' : ''}`}
              onClick={() => {
                const currentTags = filters.tags || [];
                const newTags = currentTags.includes(tag.id)
                  ? currentTags.filter(id => id !== tag.id)
                  : [...currentTags, tag.id];
                onFilterChange('tags', newTags);
              }}
              style={{ backgroundColor: tag.color + '30', borderColor: tag.color }}
            >
              {tag.icon} {tag.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}