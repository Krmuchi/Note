/**
 * 搜索面板：搜索输入、筛选、建议 / 历史 / 结果三种列表的编排与键盘导航。
 * 列表与筛选区域已拆到同目录子组件（SearchFilters / SearchSuggestions / SearchHistory / SearchResults）。
 */
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useNotesStore } from "@/store";
import type { SearchFilter, SearchResult, SearchSuggestion } from "@/types";
import { debounce } from "@/utils/debounce";
import {
  consumeTagSearch,
  getPrimarySearchTerm,
  SEARCH_TOP_K,
  sortSearchHistory,
} from "@/store/slices/searchSlice";
import { requestSearchJump } from "@/utils/searchJump";
import { requestDocOpen } from "@/utils/docNavigation";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { toast, toastWithUndo } from "@/components/common/Toast";
import SearchFilters from "./SearchFilters";
import SearchSuggestions from "./SearchSuggestions";
import SearchHistory from "./SearchHistory";
import SearchResults from "./SearchResults";
import { IconFilter, IconSearch } from "@/components/common/Icon";

/**
 * 搜索面板属性接口
 */
interface SearchPanelProps {
  isOpen: boolean;     // 面板是否打开
  onClose: () => void; // 关闭回调
}

/** P1-6：每页显示的结果数。结果按 top-K（SEARCH_TOP_K）取回、按这个步长展示「加载更多」 */
const RESULT_PAGE = 50;

/**
 * 是否带范围约束（标签 / 日期）。有约束时允许空关键词 —— 这正是
 * 「按标签看文档」的入口；既无关键词也无约束才不允许搜索（否则空查询命中整库）。
 */
const hasScopeFilter = (filter: SearchFilter): boolean =>
  Boolean(filter.tags?.length || filter.dateRange);

/**
 * 搜索面板组件
 */
export default function SearchPanel({ isOpen, onClose }: SearchPanelProps): React.JSX.Element | null {
  const {
    searchWithTotal,
    getSearchSuggestions,
    addSearchHistory,
    clearSearchHistory,
    restoreSearchHistory,
    removeSearchHistoryItem,
    togglePinSearchHistory,
    tags,
    searchHistory,
    setActiveNotebookId,
  } = useNotesStore(useShallow((s) => ({
    searchWithTotal: s.searchWithTotal,
    getSearchSuggestions: s.getSearchSuggestions,
    addSearchHistory: s.addSearchHistory,
    clearSearchHistory: s.clearSearchHistory,
    restoreSearchHistory: s.restoreSearchHistory,
    removeSearchHistoryItem: s.removeSearchHistoryItem,
    togglePinSearchHistory: s.togglePinSearchHistory,
    tags: s.tags,
    searchHistory: s.searchHistory,
    setActiveNotebookId: s.setActiveNotebookId,
  })));

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  /** 未截断的命中总数（可能大于 results.length —— 被 top-K 截断时），结果头计数用 */
  const [resultTotal, setResultTotal] = useState(0);
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
  /** P1-6：结果按页显示（默认 50），配合「共 N 条 / 加载更多」，不再静默截断 */
  const [visibleCount, setVisibleCount] = useState(RESULT_PAGE);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** 浮层 a11y（P1-3）：焦点陷阱 + Esc 关闭，单一实现走 useFocusTrap */
  const panelRef = useFocusTrap<HTMLDivElement>(true, onClose);

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
    // 空关键词 + 无任何范围约束时才直接清空；只按标签/日期筛允许空关键词（P1-9 按标签看文档）
    if (!searchQuery.trim() && !hasScopeFilter(searchFilters)) {
      setResults([]);
      setResultTotal(0);
      setShowResults(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    // 让 spinner 先渲染一帧再执行同步搜索，否则 isSearching 一帧内被复位，用户永远看不到加载反馈
    window.setTimeout(() => {
      /*
       * P1-6：取回 top-K（SEARCH_TOP_K）而不是全量 —— search 是流式 top-K，
       * 命中再多也只保留分数最高的前 K 条；界面用 visibleCount 在 K 条内分页显示。
       * total 是未截断的命中总数，交给结果头「共 N 条」如实报数。
       */
      const { results: searchResults, total } = searchWithTotal(searchQuery, searchFilters, SEARCH_TOP_K);
      setResults(searchResults);
      setResultTotal(total);
      setVisibleCount(RESULT_PAGE);
      setShowResults(true);
      setShowSuggestions(false);
      setIsSearching(false);
      // P1-5：出结果默认选中第 0 条，回车即打开（与 Ctrl+P 面板行为一致）
      setActiveIndex(searchResults.length > 0 ? 0 : -1);
    }, 0);
  }, [searchWithTotal])

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
      setResultTotal(0);
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

  /*
   * P1-9：标签页「查看 N 篇文档」发来的请求在这里消费 —— 打开面板即按标签筛出结果，
   * 并展开筛选面板让用户看见生效中的标签（请求取出即清空，重复执行是空操作）。
   * 与 Editor 消费 searchJump 同款写法：外部可变源在 effect 里读、读到才提交。
   */
  useEffect(() => {
    if (!isOpen) return;
    // 与 Editor 消费 searchJump 完全同款的形态（set-state-in-effect 只认 effect 体内
    // 的直接 setState）：读外部可变源 → 读到才提交。真正拿到 pending 时只提交一次，
    // filters 变化触发的重跑 consume 为空操作，不会级联。
    const applyPendingTagSearch = (): void => {
      const pending = consumeTagSearch();
      if (!pending) return;
      const nextFilters: SearchFilter = { ...filters, tags: pending.tagIds };
      setFilters(nextFilters);
      setShowFilters(true);
      performSearch('', nextFilters);
    };
    applyPendingTagSearch();
  }, [isOpen, filters, performSearch])

  /**
   * 执行搜索
   * 支持传入显式关键词：setState 是异步的，点击建议/历史后立即搜索时
   * 闭包中的 query 仍是旧值，必须显式传递才能搜到新关键词
   * 搜索计算延后一帧执行：大库遍历为同步主线程操作，延帧可让 spinner
   * 先渲染、输入不卡顿，计算结果再一次性提交
   */
  const handleSearch = (explicitQuery?: string, explicitFilters?: SearchFilter): void => {
    const q = (explicitQuery ?? query).trim();
    // 筛选条件可由调用方显式传入：事件处理器里刚 setState，闭包里的 filters 还是旧值
    const activeFilters = explicitFilters ?? filters;
    // 空关键词只有在带标签/日期这类范围约束时才允许搜索（P1-9 按标签看文档）
    if (!q && !hasScopeFilter(activeFilters)) return;

    setIsSearching(true);
    window.setTimeout(() => {
      // 同 performSearch：只取 top-K，计数取未截断的命中总数
      const { results: searchResults, total } = searchWithTotal(q, activeFilters, SEARCH_TOP_K);
      setResults(searchResults);
      setResultTotal(total);
      setVisibleCount(RESULT_PAGE);
      setShowResults(true);
      setShowSuggestions(false);
      setIsSearching(false);
      // P1-5：默认选中第 0 条，回车直接打开；没有结果时保持 -1
      setActiveIndex(searchResults.length > 0 ? 0 : -1);
      // 纯标签浏览不写搜索历史（没有关键词可记）；历史里的计数也记真实命中数
      if (q) addSearchHistory(q, total);
    }, 0);
  };

  /**
   * P2：清空搜索历史必须可撤销 —— 一次误点不该让积累的历史灰飞烟灭。
   * 快照整份（含置顶状态与顺序），撤销时原样还原。
   */
  const handleClearHistory = useCallback(() => {
    const snapshot = useNotesStore.getState().searchHistory;
    if (snapshot.length === 0) return;
    clearSearchHistory();
    toastWithUndo(`已清空 ${snapshot.length} 条搜索历史`, () => {
      restoreSearchHistory(snapshot);
      toast.success('已恢复搜索历史');
    });
  }, [clearSearchHistory, restoreSearchHistory]);

  /**
   * 键盘事件处理
   */
  // 历史列表的渲染顺序与 Enter 取词顺序必须一致：统一用置顶优先排序后的数组。
  // store 写入路径已保证置顶在前，这里再排一次以兼容旧的未排序持久化数据。
  const orderedHistory = useMemo(() => sortSearchHistory(searchHistory), [searchHistory]);
  // P1-6：键盘可达的条数与「已显示」的条数必须一致 —— 否则高亮会走到没渲染的行上
  const totalItems = showResults
    ? Math.min(results.length, visibleCount)
    : query.length === 0
      ? orderedHistory.length
      : suggestions.length;

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
      // 走到最后一条已显示的结果时把下一页拉进来：键盘浏览不该停在第 50 条
      if (showResults && next + 1 >= visibleCount && visibleCount < results.length) {
        setVisibleCount((count) => count + RESULT_PAGE);
      }
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
        } else if (!showResults && query.length === 0 && orderedHistory[activeIndex]) {
          const historyQuery = orderedHistory[activeIndex].query;
          // skipSearch：handleSearch 已经带显式关键词立刻搜一次，再排队一次防抖就是双搜闪烁
          handleQueryChange(historyQuery, { skipSearch: true });
          handleSearch(historyQuery);
        } else if (!showResults && suggestions[activeIndex]) {
          handleSuggestionClick(suggestions[activeIndex]);
        }
      } else {
        handleSearch();
      }
    } else if (e.key === 'Escape') {
      // 阻断冒泡：面板自关后不再交给全局 Escape 链，
      // 否则 App 的 onEscape 读到已关闭的开关，会顺手关掉下一层面板（一次 Esc 关两层）
      e.stopPropagation();
      onClose();
    }
  };

  /**
   * 点击搜索建议：只更新输入框并立即执行一次搜索。
   * handleQueryChange 内部有防抖搜索 effect，此处再手动调 handleSearch 是同一关键词搜两遍，结果会闪烁
   */
  /*
   * P1-7：建议里的「文档」「标签」都带 id，旧实现却一律退化成"再搜一次" ——
   * 分组明明写着「文档」，回车拿到的还是结果列表，得再点一次才进正文。
   * 现在：文档直达、标签直接套筛选、历史词照旧复搜。
   */
  const handleSuggestionClick = (suggestion: SearchSuggestion): void => {
    if (suggestion.type === 'title' && suggestion.docId) {
      const state = useNotesStore.getState();
      const notebook = state.notebooks.find((nb) =>
        nb.docs.some((doc) => doc.id === suggestion.docId),
      );
      if (notebook) {
        requestDocOpen({ notebookId: notebook.id, docId: suggestion.docId });
        onClose();
        return;
      }
      // 文档刚被删：落到按文字搜索，而不是点了毫无反应
    }

    if (suggestion.type === 'tag' && suggestion.tagId) {
      const nextFilters: SearchFilter = { ...filters, tags: [suggestion.tagId] };
      setFilters(nextFilters);
      setShowFilters(true);
      // 保留输入框里的关键词：标签是在它之上再收窄一层，而不是替换掉用户在打的字
      handleSearch(query, nextFilters);
      return;
    }

    handleQueryChange(suggestion.text, { skipSearch: true });
    handleSearch(suggestion.text);
  };

  /**
   * 点击搜索结果
   *
   * 必须走 requestDocOpen 通道（与 QuickOpen 一致）：App 的 handleViewDoc 订阅该通道，
   * 负责记录最近浏览并切回文档视图。旧实现只改 store 的 active id，
   * 在开始/小记/标签/最近/回收站页点结果后视图不切换 —— 面板关了却"什么都没打开"。
   */
  const handleResultClick = (result: SearchResult): void => {
    if (result.type === 'notebook') {
      setActiveNotebookId(result.id);
      // 按需读取而不是订阅：notebooks 的引用每次击键都会变，
      // 订阅它会让整个搜索面板跟着编辑重渲染（面板里还有建议/结果列表要维护）
      const notebook = useNotesStore.getState().notebooks.find(nb => nb.id === result.id);
      if (notebook && notebook.docs.length > 0) {
        requestDocOpen({ notebookId: notebook.id, docId: notebook.docs[0].id });
      }
    } else {
      if (result.notebookId) {
        requestDocOpen({ notebookId: result.notebookId, docId: result.id });
        // S1：跳转后由编辑器打开查找栏并定位到首个命中 —— 否则"搜得到、打开后找不到"，
        // 用户还得自己再想一遍刚才搜的是什么词
        const term = getPrimarySearchTerm(query);
        if (term) {
          requestSearchJump({ docId: result.id, notebookId: result.notebookId, query: term });
        }
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
   * 加载更多 / 滚到底续载：先翻一页（+RESULT_PAGE）；若已显示的都来自已取回结果、
   * 而命中还没取完（已达 top-K 上限），就从 store 再取下一批 —— offset = 已取回条数，
   * 同一排序接着取 SEARCH_TOP_K 条。批内就是全量排序的下一段名次，追加后天然连续。
   */
  const handleLoadMore = useCallback((): void => {
    if (visibleCount >= results.length && results.length < resultTotal) {
      const batch = searchWithTotal(query, filters, SEARCH_TOP_K, results.length);
      // 非函数式 setState：滚动事件连发导致重复触发时，同一 offset 的批次幂等覆盖，不会重复追加
      setResults([...results, ...batch.results]);
    }
    setVisibleCount((count) => count + RESULT_PAGE);
  }, [visibleCount, results, resultTotal, query, filters, searchWithTotal]);

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
    <div
      className="search-panel-overlay"
      onClick={onClose}
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="搜索"
    >
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
            <IconFilter size={14} /> 筛选
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
        {showSuggestions && query.length === 0 && !showResults && orderedHistory.length > 0 && (
          <SearchHistory
            searchHistory={orderedHistory}
            activeIndex={activeIndex}
            onQueryChange={handleQueryChange}
            onSearch={handleSearch}
            onClearHistory={handleClearHistory}
            onRemoveHistory={removeSearchHistoryItem}
            onTogglePin={togglePinSearchHistory}
          />
        )}

        {/* 搜索结果 */}
        {showResults && (
          <SearchResults
            results={results}
            total={resultTotal}
            query={query}
            tags={tags}
            activeIndex={activeIndex}
            visibleCount={visibleCount}
            onLoadMore={handleLoadMore}
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