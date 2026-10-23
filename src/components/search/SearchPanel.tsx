/**
 * 搜索面板：搜索输入、筛选、建议 / 历史 / 结果三种列表的编排与键盘导航。
 * 列表与筛选区域已拆到同目录子组件（SearchFilters / SearchSuggestions / SearchHistory / SearchResults）。
 */
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useNotesStore } from "@/store";
import type { SearchFilter, SearchResult, SearchSuggestion } from "@/types";
import { debounce } from "@/utils/debounce";
import { getPrimarySearchTerm } from "@/store/slices/searchSlice";
import { requestSearchJump } from "@/utils/searchJump";
import SearchFilters from "./SearchFilters";
import SearchSuggestions from "./SearchSuggestions";
import SearchHistory from "./SearchHistory";
import SearchResults from "./SearchResults";
import { IconSearch } from "@/components/common/Icon";

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
export default function SearchPanel({ isOpen, onClose }: SearchPanelProps): React.JSX.Element | null {
  const {
    search,
    getSearchSuggestions,
    addSearchHistory,
    clearSearchHistory,
    removeSearchHistoryItem,
    togglePinSearchHistory,
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
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);
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

  /**
   * 关键词或筛选变化后启动防抖搜索。
   * 防抖等待期也计入"搜索中"，否则 400ms 内 spinner 不出现，用户看不到任何加载反馈。
   *
   * 这里放在事件处理器里而不是 useEffect 里：effect 的唯一触发源就是
   * handleQueryChange / handleFilterChange 两个处理器，在 effect 体内同步
   * setState 会触发级联渲染（react-hooks/set-state-in-effect）。
   *
   * 不再有"至少两个字"的门槛：中文单字（"税"、"库"）本身就是常见查询，
   * 旧实现在输入第一个字时既不搜索也不给任何提示，界面看起来像卡住了。
   * 单字搜索的成本已经由 searchSlice 的文本缓存与分词前置承担。
   */
  const scheduleSearch = useCallback((nextQuery: string, nextFilters: SearchFilter) => {
    if (nextQuery.trim().length === 0) return
    setIsSearching(true)
    debouncedSearch(nextQuery, nextFilters)
  }, [debouncedSearch])

  const handleQueryChange = useCallback((value: string, options?: { skipSearch?: boolean }) => {
    setQuery(value);
    setActiveIndex(-1);
    debouncedUpdateSuggestions(value);
    if (options?.skipSearch) {
      debouncedSearch.cancel?.();
      setIsSearching(false);
      return;
    }
    if (value.trim().length === 0) {
      // 取消挂起的防抖搜索，否则清空输入后旧关键词的结果仍会弹出来
      debouncedSearch.cancel?.();
      setResults([]);
      setShowResults(false);
      setIsSearching(false);
      setShowSuggestions(false);
    } else {
      setShowSuggestions(true);
      setShowResults(false);
      scheduleSearch(value, filters);
    }
  }, [debouncedUpdateSuggestions, debouncedSearch, scheduleSearch, filters])

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
      // 按需读取而不是订阅：notebooks 的引用每次击键都会变，
      // 订阅它会让整个搜索面板跟着编辑重渲染（面板里还有建议/结果列表要维护）
      const notebook = useNotesStore.getState().notebooks.find(nb => nb.id === result.id);
      if (notebook && notebook.docs.length > 0) {
        setActiveDocId(notebook.docs[0].id);
      }
    } else {
      if (result.notebookId) {
        setActiveNotebookId(result.notebookId);
      }
      setActiveDocId(result.id);
      // S1：跳转后由编辑器打开查找栏并定位到首个命中 —— 否则"搜得到、打开后找不到"，
      // 用户还得自己再想一遍刚才搜的是什么词
      const term = getPrimarySearchTerm(query);
      if (term) {
        requestSearchJump({ docId: result.id, notebookId: result.notebookId, query: term });
      }
    }
    onClose();
  };

  /**
   * 更新筛选条件
   */
  const handleFilterChange = (key: keyof SearchFilter, value: string | string[] | { start?: string; end?: string } | undefined): void => {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    // 筛选变化同样要重新搜索（原先靠 effect 的 filters 依赖触发）
    scheduleSearch(query, nextFilters);
  };

  /**
   * 从搜索结果返回建议列表并重新聚焦输入框
   */
  const handleBackToSuggestions = (): void => {
    setShowResults(false);
    setShowSuggestions(true);
    inputRef.current?.focus();
  };

  // 如果面板未打开，返回 null
  if (!isOpen) return null;

  return (
    <div className="search-panel-overlay" onClick={onClose}>
      <div className="search-panel" ref={listRef} onClick={(e) => e.stopPropagation()}>
        {/* 搜索框区域 */}
        <div className="search-panel-header">
          <div className="search-input-wrapper">
            <span className="search-icon"><IconSearch size={16} /></span>
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
            className={`search-filter-btn search-syntax-btn ${showSyntaxHelp ? 'active' : ''}`}
            onClick={() => setShowSyntaxHelp(!showSyntaxHelp)}
            title="搜索语法说明"
            aria-expanded={showSyntaxHelp}
          >
            ？语法
          </button>

          <button 
            className="search-filter-btn"
            onClick={() => setShowFilters(!showFilters)}
          >
            ⚙️ 筛选
          </button>
          
          <button className="search-close" onClick={onClose}>×</button>
        </div>

        {/* 搜索语法说明（S5）：语法早就实现（-排除 / "精确" / 多词与），但此前界面零提示，
            等于只有读过源码的人会用 */}
        {showSyntaxHelp && (
          <div className="search-syntax-help">
            <div className="syntax-help-title">搜索语法</div>
            <ul className="syntax-help-list">
              <li>
                <code>关键词 关键词</code>
                <span>空格分隔＝需同时包含（中文按单字匹配）</span>
              </li>
              <li>
                <code>-排除词</code>
                <span>排除包含该词的文档</span>
              </li>
              <li>
                <code>"精确短语"</code>
                <span>整段匹配，不做中文分词</span>
              </li>
            </ul>
            <div className="syntax-help-tip">
              标题命中的结果会排在前面；可在「筛选 → 排序」切换为最近更新。
            </div>
          </div>
        )}

        {/* 筛选面板 */}
        {showFilters && (
          <SearchFilters
            filters={filters}
            tags={tags}
            onFilterChange={handleFilterChange}
          />
        )}

        {/* 搜索建议 */}
        {showSuggestions && suggestions.length > 0 && !showResults && (
          <SearchSuggestions
            suggestions={suggestions}
            query={query}
            activeIndex={activeIndex}
            onSuggestionClick={handleSuggestionClick}
          />
        )}

        {/* 搜索历史 */}
        {showSuggestions && query.length === 0 && !showResults && searchHistory.length > 0 && (
          <SearchHistory
            searchHistory={searchHistory}
            activeIndex={activeIndex}
            onQueryChange={handleQueryChange}
            onSearch={handleSearch}
            onClearHistory={clearSearchHistory}
            onRemoveHistory={removeSearchHistoryItem}
            onTogglePin={togglePinSearchHistory}
          />
        )}

        {/* 搜索结果 */}
        {showResults && (
          <SearchResults
            results={results}
            query={query}
            tags={tags}
            activeIndex={activeIndex}
            onResultClick={handleResultClick}
            onBack={handleBackToSuggestions}
          />
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