export interface SearchHistory {
  id: string
  query: string
  timestamp: string
  resultCount: number
}

export interface SearchSuggestion {
  text: string
  type: 'tag' | 'title' | 'content' | 'history'
  tagId?: string
  docId?: string
}

export interface SearchFilter {
  dateRange?: { start: string; end: string }
  type?: 'all' | 'document' | 'notebook'
  author?: string
  tags?: string[]
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
}