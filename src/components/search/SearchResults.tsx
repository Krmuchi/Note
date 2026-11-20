/**
 * 搜索结果列表：结果条数头部（P1-6 计数 + 加载更多）、返回按钮、空态与
 * 结果条目（标题 / 摘要高亮、所属路径、标签、时间）。
 * 自 SearchPanel 抽出，DOM 结构、data-search-item 标记与 class 名保持不变。
 */
import { useMemo } from 'react';
import type { JSX, UIEvent } from 'react';
import type { SearchResult, Tag } from '@/types';
import { useNotesStore } from '@/store';
import { formatDateTime } from '@/utils/formatters';
import { HighlightMatch } from './HighlightMatch';
import { IconBook, IconDocument, IconSearch } from '@/components/common/Icon';

interface SearchResultsProps {
  results: SearchResult[];                          // 取回的结果（top-K，按页显示）
  /** 未截断的命中总数；被 top-K 截断时大于 results.length。缺省按 results.length 处理 */
  total?: number;
  query: string;                                    // 当前关键词（用于高亮）
  tags: Tag[];                                      // 可选标签（用于渲染结果标签）
  activeIndex: number;                              // 键盘高亮下标
  /** P1-6：已显示多少条；其余收在「加载更多」后面，不再被静默截断 */
  visibleCount?: number;
  /** P1-6：再显示一页 */
  onLoadMore?: () => void;
  onResultClick: (result: SearchResult) => void;    // 点击结果跳转
  onBack: () => void;                               // 返回建议列表
}

/**
 * 格式化日期显示（统一使用 utils/formatters）
 */
const formatDate = (dateStr: string): string =>
  formatDateTime(dateStr, { prefixToday: true, prefixYesterday: true });

/** 路径最多展示到这个深度，再长就开始吞掉标题本身了 */
const MAX_PATH_DEPTH = 3;

export default function SearchResults({
  results,
  total,
  query,
  tags,
  activeIndex,
  visibleCount = results.length,
  onLoadMore,
  onResultClick,
  onBack,
}: SearchResultsProps): JSX.Element {
  const notebooks = useNotesStore((s) => s.notebooks);

  /**
   * P1-6：结果行必须带上「知识库 › 父文档」—— 同名文档散在不同库里时，
   * 只有标题 + 时间根本分不清点开的是哪一篇（数据里本来就有 notebookId，
   * 只是从来没渲染出来）。按需读取、不复制正文，建表成本只在面板打开时付一次。
   */
  const meta = useMemo(() => {
    const parentOf = new Map<string, string | null>();
    const titleOf = new Map<string, string>();
    const notebookOf = new Map<string, string>();
    for (const notebook of notebooks) {
      for (const doc of notebook.docs) {
        parentOf.set(doc.id, doc.parentId ?? null);
        titleOf.set(doc.id, doc.title || '未命名文档');
        notebookOf.set(doc.id, notebook.title);
      }
    }
    return { parentOf, titleOf, notebookOf };
  }, [notebooks]);

  const buildPath = (docId: string): string => {
    const chain: string[] = [];
    let current = meta.parentOf.get(docId) ?? null;
    const guard = new Set<string>();
    while (current && !guard.has(current) && chain.length < MAX_PATH_DEPTH) {
      guard.add(current);
      chain.unshift(meta.titleOf.get(current) ?? '');
      current = meta.parentOf.get(current) ?? null;
    }
    const notebookTitle = meta.notebookOf.get(docId);
    return [notebookTitle, ...chain].filter(Boolean).join(' › ');
  };

  const shown = results.slice(0, Math.max(0, visibleCount));
  // 计数用未截断的命中总数：top-K 分批取回时 results.length 只是「已取回多少」
  const totalCount = total ?? results.length;
  // 还有多少条没显示（含尚未取回的下一批）：按钮可见性与「还有 N 条」都以真实总数为准
  const remainingTotal = totalCount - shown.length;

  /**
   * 滚到底部附近时自动续载（与「加载更多」同一条路径：需要时先取下一批再翻页）。
   * 滚动容器就是本组件的根 .search-results。
   */
  const handleScroll = (e: UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget;
    if (remainingTotal > 0 && el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
      onLoadMore?.();
    }
  };

  return (
    <div className="search-results" onScroll={handleScroll}>
      <div className="results-header">
        <span aria-live="polite">
          {/* P1-6：截断时说实话（旧版写死「找到 N 条」，而 N 其实是被截断的 50）。
              分页未显示完、或被 top-K 截断（totalCount > results.length）时，
              都走「共 N 条结果，已显示前 M 条」—— N 是真实命中总数 */}
          {shown.length < totalCount
            ? `共 ${totalCount} 条结果，已显示前 ${shown.length} 条`
            : `找到 ${totalCount} 条结果`}
        </span>
        <button
          className="back-btn"
          onClick={onBack}
        >
          ← 返回
        </button>
      </div>

      {results.length === 0 ? (
        <div className="no-results">
          <span className="no-results-icon"><IconSearch size={32} /></span>
          {/* 搜索无结果文案全局统一为一种写法：标题「没有匹配的X」+ 提示「试试其他关键词或调整筛选条件」 */}
          <p>没有匹配的结果</p>
          <p className="no-results-hint">试试其他关键词或调整筛选条件</p>
        </div>
      ) : (
        <div className="results-list">
          {shown.map((result, index) => (
            <div
              key={`${result.type}-${result.id}`}
              className={`result-item ${activeIndex === index ? 'active' : ''}`}
              data-search-item
              onClick={() => onResultClick(result)}
            >
              <div className="result-icon" aria-hidden="true">
                {result.type === 'notebook' ? <IconBook size={16} /> : <IconDocument size={16} />}
              </div>
              <div className="result-content">
                <div className="result-title">
                  <HighlightMatch text={result.title} query={query} />
                </div>
                {result.type === 'doc' && (
                  <div className="result-path" title={buildPath(result.id)}>
                    {buildPath(result.id)}
                  </div>
                )}
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
          {remainingTotal > 0 && onLoadMore && (
            <button type="button" className="load-more-btn" onClick={onLoadMore}>
              加载更多（还有 {remainingTotal} 条）
            </button>
          )}
        </div>
      )}
    </div>
  );
}
