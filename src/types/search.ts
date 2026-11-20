export interface SearchHistory {
  id: string
  query: string
  timestamp: string
  resultCount: number
  pinned?: boolean
  useCount?: number
}

export interface SearchSuggestion {
  text: string
  type: 'tag' | 'title' | 'content' | 'history'
  tagId?: string
  docId?: string
}

/** 结果排序方式：相关度（默认）或最近更新 */
export type SearchSort = 'relevance' | 'time'

export interface SearchFilter {
  dateRange?: { start: string; end: string }
  type?: 'all' | 'document' | 'notebook'
  tags?: string[]
  /** 结果排序（S4）；缺省按相关度 */
  sort?: SearchSort
}

export interface SearchResult {
  type: 'doc' | 'notebook'
  id: string
  notebookId?: string
  title: string
  content?: string
  tags: string[]
  updatedAt: string
  highlights?: { field: string; text: string }[]
  /** 相关度得分（S4）：仅内存计算，不持久化 */
  score?: number
}

/**
 * 搜索结果 + 命中总数。
 * search 只流式保留分数最高的前 K 条（SEARCH_TOP_K），所以 results.length 可能小于
 * 实际命中数 total —— 结果头「共 N 条结果」用 total 才不会把截断数当总数报给用户。
 */
export interface SearchResponse {
  /** top-K 截断后的结果（已按最终排序：相关度或最近更新） */
  results: SearchResult[]
  /** 未截断的命中总数；total >= results.length */
  total: number
}