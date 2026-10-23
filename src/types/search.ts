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