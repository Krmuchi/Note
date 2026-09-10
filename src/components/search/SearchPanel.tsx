import { useState, useRef, useCallback, useMemo, useEffect, memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useNotesStore } from "@/store";
import { tokenizeChinese } from "@/store/slices/searchSlice";
import type { SearchFilter, SearchResult, SearchSuggestion } from "@/types";
import { escapeRegExp } from "@/utils/sanitize";
import { debounce } from "@/utils/debounce";
import { formatDateTime } from "@/utils/formatters";

/**
 * 搜索面板属性接口
 */
interface SearchPanelProps {
  isOpen: boolean;     // 面板是否打开
  onClose: () => void; // 关闭回调
}

/**
 * 高亮匹配文本（组件定义在模块层，避免每次渲染重建组件类型导致子树无法复用）
 * 分词逻辑与 searchSlice 的 tokenizeChinese 保持一致，保证中文搜索结果的高亮与命中匹配
 */
const HighlightMatch = memo(function HighlightMatch({ text, query }: { text: string; query: string }) {
  const highlightTerms = useMemo(() => {
    if (!query.trim()) return [];
    // 与搜索逻辑一致：先按空格拆词，再对每个词做中文分词
    return query.split(/\s+/).filter(Boolean).flatMap(term => {
      const tokens = tokenizeChinese(term);
      return tokens.length > 0 ? tokens : [term];
    });
  }, [query]);

  const parts = useMemo(() => {
    if (highlightTerms.length === 0) return null;
    const pattern = Array.from(new Set(highlightTerms.map(t => t.toLowerCase())))
      .map(escapeRegExp)
      .join('|');
    return text.split(new RegExp(`(${pattern})`, 'gi'));
  }, [text, highlightTerms]);

  if (!parts) return <>{text}</>;

  const lowerTerms = new Set(highlightTerms.map(t => t.toLowerCase()));
  return (
    <>
      {parts.map((part, i) =>
        lowerTerms.has(part.toLowerCase()) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>
      )}
    </>
  );
});

/**
 * 搜索面板组件
 */
export default function SearchPanel({ isOpen, onClose }: SearchPanelProps): import('react').ReactElement | null {
  const {
    search,
    getSearchSuggestions,
    addSearchHistory,
    clearSearchHistory,
    removeSearchHistoryItem,
    togglePinSearchHistory,
    notebooks,
    tags,
    searchHistory,
    setActiveNotebookId,
    setActiveDocId,
  } = useNotesStore(useShallow((s) => ({
    search: s.search,
    getSearchSuggestions: s.getSearchSuggestions,
    addSearchHistory: s.addSearchHistory,
    clearSearchHistory: s.clearSearchHistory,
    removeSearchHistoryItem: s.removeSearchHistoryItem,
    togglePinSearchHistory: s.togglePinSearchHistory,
    notebooks: s.notebooks,
    tags: s.tags,
    searchHistory: s.searchHistory,
    setActiveNotebookId: s.setActiveNotebookId,
    setActiveDocId: s.setActiveDocId,
  })));

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilter>({
    type: 'all',
  });
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * 更新搜索建议
   */
  const updateSuggestions = useCallback((searchQuery: string) => {
    if (searchQuery.length > 0) {
      const newSuggestions = getSearchSuggestions(searchQuery);
      setSuggestions(newSuggestions);
    } else {
      setSuggestions([]);
    }
  }, [getSearchSuggestions])

  const debouncedUpdateSuggestions = useMemo(
    () => debounce((value: string) => updateSuggestions(value), 300),
    [updateSuggestions]
  )

  const performSearch = useCallback((searchQuery: string, searchFilters: SearchFilter) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setShowResults(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    // 让 spinner 先渲染一帧再执行同步搜索，否则 isSearching 一帧内被复位，用户永远看不到加载反馈
    window.setTimeout(() => {
      const searchResults = search(searchQuery, searchFilters);
      setResults(searchResults);
      setShowResults(true);
      setShowSuggestions(false);
      setIsSearching(false);
      setActiveIndex(-1);
    }, 0);
  }, [search])

  const debouncedSearch = useMemo(
    () => debounce((q: string, f: SearchFilter) => performSearch(q, f), 400),
    [performSearch]
  )

  const handleQueryChange = useCallback((value: string, options?: { skipSearch?: boolean }) => {
    setQuery(value);
    setActiveIndex(-1);
    debouncedUpdateSuggestions(value);
    if (options?.skipSearch) {
      debouncedSearch.cancel?.();
      return;
    }
    if (value.trim().length === 0) {
      setResults([]);
      setShowResults(false);
      setIsSearching(false);
      setShowSuggestions(false);
    } else {
      setShowSuggestions(true);
      setShowResults(false);
    }
  }, [debouncedUpdateSuggestions, debouncedSearch])

  useEffect(() => {
    if (query.trim().length >= 2) {
      debouncedSearch(query, filters);
    }
  }, [query, filters, debouncedSearch])

  // 打开面板时聚焦输入框：Ctrl+K 唤起后应可直接键盘输入，无需先用鼠标点击
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen])

  /**
   * 执行搜索
   * 支持传入显式关键词：setState 是异步的，点击建议/历史后立即搜索时
   * 闭包中的 query 仍是旧值，必须显式传递才能搜到新关键词
   * 搜索计算延后一帧执行：大库遍历为同步主线程操作，延帧可让 spinner
   * 先渲染、输入不卡顿，计算结果再一次性提交
   */
  const handleSearch = (explicitQuery?: string): void => {
    const q = (explicitQuery ?? query).trim();
    if (!q) return;

    setIsSearching(true);
    window.setTimeout(() => {
      const searchResults = search(q, filters);
      setResults(searchResults);
      setShowResults(true);
      setShowSuggestions(false);
      setIsSearching(false);
      setActiveIndex(-1);
      addSearchHistory(q, searchResults.length);
    }, 0);
  };

  /**
   * 键盘事件处理
   */
  const totalItems = showResults ? results.length : (query.length === 0 ? searchHistory.length : suggestions.length);

  const scrollActiveIntoView = useCallback((index: number) => {
    if (!listRef.current || index < 0) return;
    const items = listRef.current.querySelectorAll('[data-search-item]');
    if (items[index]) {
      items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = activeIndex < totalItems - 1 ? activeIndex + 1 : 0;
      setActiveIndex(next);
      scrollActiveIntoView(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = activeIndex > 0 ? activeIndex - 1 : totalItems - 1;
      setActiveIndex(prev);
      scrollActiveIntoView(prev);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0) {
        if (showResults && results[activeIndex]) {
          handleResultClick(results[activeIndex]);
        } else if (!showResults && query.length === 0 && searchHistory[activeIndex]) {
          const historyQuery = searchHistory[activeIndex].query;
          handleQueryChange(historyQuery);
          handleSearch(historyQuery);
        } else if (!showResults && suggestions[activeIndex]) {
          handleSuggestionClick(suggestions[activeIndex]);
        }
      } else {
        handleSearch();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  /**
   * 点击搜索建议：只更新输入框并立即执行一次搜索。
   * handleQueryChange 内部有防抖搜索 effect，此处再手动调 handleSearch 是同一关键词搜两遍，结果会闪烁
   */
  const handleSuggestionClick = (suggestion: SearchSuggestion): void => {
    handleQueryChange(suggestion.text, { skipSearch: true });
    handleSearch(suggestion.text);
  };

  /**
   * 点击搜索结果
   */
  const handleResultClick = (result: SearchResult): void => {
    if (result.type === 'notebook') {
      setActiveNotebookId(result.id);
      const notebook = notebooks.find(nb => nb.id === result.id);
      if (notebook && notebook.docs.length > 0) {
        setActiveDocId(notebook.docs[0].id);
      }
    } else {
      if (result.notebookId) {
        setActiveNotebookId(result.notebookId);
      }
      setActiveDocId(result.id);
    }
    onClose();
  };

  /**
   * 更新筛选条件
   */
  const handleFilterChange = (key: keyof SearchFilter, value: string | string[] | { start?: string; end?: string } | undefined): void => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  /**
   * 格式化日期显示（统一使用 utils/formatters）
   */
  const formatDate = (dateStr: string): string =>
    formatDateTime(dateStr, { prefixToday: true, prefixYesterday: true });

  // 如果面板未打开，返回 null
  if (!isOpen) return null;

  return (
    <div className="search-panel-overlay" onClick={onClose}>
      <div className="search-panel" ref={listRef} onClick={(e) => e.stopPropagation()}>
        {/* 搜索框区域 */}
        <div className="search-panel-header">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              placeholder="搜索标题、内容、标签..."
              className="search-input"
            />
            {query && (
              <>
                {isSearching && <span className="search-spinner" />}
                <button 
                  className="search-clear" 
                  onClick={() => handleQueryChange('')}
                >
                  ×
                </button>
              </>
            )}
          </div>
          
          <button 
            className="search-filter-btn"
            onClick={() => setShowFilters(!showFilters)}
          >
            ⚙️ 筛选
          </button>
          
          <button className="search-close" onClick={onClose}>×</button>
        </div>

        {/* 筛选面板 */}
        {showFilters && (
          <div className="search-filter-panel">
            <div className="filter-row">
              <label>类型</label>
              <select 
                value={filters.type || 'all'}
                onChange={(e) => handleFilterChange('type', e.target.value)}
              >
                <option value="all">全部</option>
                <option value="document">文档</option>
                <option value="notebook">知识库</option>
              </select>
            </div>
            
            <div className="filter-row">
              <label>日期范围</label>
              <div className="date-range">
                <input 
                  type="date" 
                  value={filters.dateRange?.start || ''}
                  onChange={(e) => handleFilterChange('dateRange', {
                    ...filters.dateRange,
                    start: e.target.value
                  })}
                />
                <span>至</span>
                <input 
                  type="date" 
                  value={filters.dateRange?.end || ''}
                  onChange={(e) => handleFilterChange('dateRange', {
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
                      handleFilterChange('tags', newTags);
                    }}
                    style={{ backgroundColor: tag.color + '30', borderColor: tag.color }}
                  >
                    {tag.icon} {tag.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 搜索建议 */}
        {showSuggestions && suggestions.length > 0 && !showResults && (
          <div className="search-suggestions">
            {suggestions.map((suggestion, index) => (
              <div
                key={`${suggestion.text}-${index}`}
                className={`suggestion-item ${activeIndex === index ? 'active' : ''}`}
                data-search-item
                onClick={() => handleSuggestionClick(suggestion)}
              >
                <span className="suggestion-icon">
                  {suggestion.type === 'tag' && '🏷️'}
                  {suggestion.type === 'title' && '📄'}
                  {suggestion.type === 'history' && '🕐'}
                </span>
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
        )}

        {/* 搜索历史 */}
        {showSuggestions && query.length === 0 && !showResults && searchHistory.length > 0 && (
          <div className="search-history">
            <div className="history-header">
              <span>搜索历史</span>
              <button className="clear-history" onClick={clearSearchHistory}>
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
                    togglePinSearchHistory(history.id);
                  }}
                  title={history.pinned ? '取消置顶' : '置顶'}
                >
                  {history.pinned ? '📌' : '📍'}
                </button>
                <button 
                  className="history-text"
                  onClick={() => {
                    handleQueryChange(history.query);
                    handleSearch();
                  }}
                >
                  {history.query}
                </button>
                <span className="history-count">{history.resultCount} 条结果</span>
                <button 
                  className="history-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSearchHistoryItem(history.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 搜索结果 */}
        {showResults && (
          <div className="search-results">
            <div className="results-header">
              <span aria-live="polite">找到 {results.length} 条结果</span>
              <button 
                className="back-btn"
                onClick={() => {
                  setShowResults(false);
                  setShowSuggestions(true);
                  inputRef.current?.focus();
                }}
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
                    onClick={() => handleResultClick(result)}
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
        )}

        <div className="search-keyboard-hints">
          <span className="hint-item"><kbd>↑</kbd><kbd>↓</kbd> 导航</span>
          <span className="hint-item"><kbd>Enter</kbd> 确认</span>
          <span className="hint-item"><kbd>Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
}