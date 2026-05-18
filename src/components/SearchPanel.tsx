// 导入 React hooks 和类型定义
import { useState, useEffect, useRef } from "react";
import { useNotesStore } from "../store/notesStore";
import type { SearchFilter, SearchResult, SearchSuggestion } from "../types";

/**
 * 搜索面板属性接口
 */
interface SearchPanelProps {
  isOpen: boolean;     // 面板是否打开
  onClose: () => void; // 关闭回调
}

/**
 * 搜索面板组件
 */
export default function SearchPanel({ isOpen, onClose }: SearchPanelProps) {
  const { 
    search, 
    getSearchSuggestions, 
    addSearchHistory, 
    clearSearchHistory,
    removeSearchHistoryItem,
    notebooks,
    tags,
    searchHistory,
    setActiveNotebookId,
    setActiveDocId,
  } = useNotesStore();

  const [query, setQuery] = useState('');                    // 搜索关键词
  const [results, setResults] = useState<SearchResult[]>([]); // 搜索结果
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]); // 搜索建议
  const [showSuggestions, setShowSuggestions] = useState(false); // 是否显示建议
  const [showFilters, setShowFilters] = useState(false);     // 是否显示筛选面板
  const [filters, setFilters] = useState<SearchFilter>({    // 筛选条件
    type: 'all',
  });
  const [showResults, setShowResults] = useState(false);     // 是否显示结果
  const inputRef = useRef<HTMLInputElement>(null);           // 输入框引用

  // 面板打开时重置状态并聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSuggestions([]);
      setShowResults(false);
      setFilters({ type: 'all' });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // 根据输入实时生成搜索建议
  useEffect(() => {
    if (query.length > 0) {
      const newSuggestions = getSearchSuggestions(query);
      setSuggestions(newSuggestions);
    } else {
      setSuggestions([]);
    }
  }, [query]);

  /**
   * 执行搜索
   */
  const handleSearch = () => {
    if (!query.trim()) return;
    
    const searchResults = search(query, filters);
    setResults(searchResults);
    setShowResults(true);
    setShowSuggestions(false);
    addSearchHistory(query, searchResults.length);
  };

  /**
   * 键盘事件处理
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  /**
   * 点击搜索建议
   */
  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    setQuery(suggestion.text);
    handleSearch();
  };

  /**
   * 点击搜索结果
   */
  const handleResultClick = (result: SearchResult) => {
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
  const handleFilterChange = (key: keyof SearchFilter, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  /**
   * 高亮匹配文本
   */
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query.split(/\s+/).filter(Boolean).join('|')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  };

  /**
   * 格式化日期显示
   */
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
    return date.toLocaleDateString('zh-CN');
  };

  // 如果面板未打开，返回 null
  if (!isOpen) return null;

  return (
    <div className="search-panel-overlay" onClick={onClose}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        {/* 搜索框区域 */}
        <div className="search-panel-header">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
                setShowResults(false);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              placeholder="搜索标题、内容、标签..."
              className="search-input"
            />
            {query && (
              <button 
                className="search-clear" 
                onClick={() => setQuery('')}
              >
                ×
              </button>
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
                className="suggestion-item"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                <span className="suggestion-icon">
                  {suggestion.type === 'tag' && '🏷️'}
                  {suggestion.type === 'title' && '📄'}
                  {suggestion.type === 'history' && '🕐'}
                </span>
                <span 
                  className="suggestion-text"
                  dangerouslySetInnerHTML={{ __html: highlightText(suggestion.text, query) }}
                />
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
            {searchHistory.map(history => (
              <div key={history.id} className="history-item">
                <button 
                  className="history-text"
                  onClick={() => {
                    setQuery(history.query);
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
              <span>找到 {results.length} 条结果</span>
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
                {results.map(result => (
                  <div
                    key={`${result.type}-${result.id}`}
                    className="result-item"
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="result-icon">
                      {result.type === 'notebook' ? '📚' : '📄'}
                    </div>
                    <div className="result-content">
                      <div 
                        className="result-title"
                        dangerouslySetInnerHTML={{ __html: highlightText(result.title, query) }}
                      />
                      {result.highlights && result.highlights.length > 0 && (
                        <div className="result-preview">
                          {result.highlights[0].text.length > 100 
                            ? result.highlights[0].text.slice(0, 100) + '...'
                            : result.highlights[0].text
                          }
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
      </div>
    </div>
  );
}