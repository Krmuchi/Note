import type { StateCreator } from 'zustand'
import type { SearchHistory, SearchSuggestion, SearchFilter, SearchResult, NoteDoc } from '@/types'
import type { NotesStore } from '@/store/types'
import { newId } from '@/store/storeUtils'

export const tokenizeChinese = (text: string): string[] => {
  const tokens: string[] = []
  let currentToken = ''

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (/[\u4e00-\u9fff]/.test(char)) {
      if (currentToken) {
        tokens.push(currentToken)
        currentToken = ''
      }
      tokens.push(char)
    } else if (/[a-zA-Z0-9]/.test(char)) {
      currentToken += char
    } else {
      if (currentToken) {
        tokens.push(currentToken)
        currentToken = ''
      }
    }
  }

  if (currentToken) {
    tokens.push(currentToken)
  }

  return tokens.filter(token => token.trim() !== '')
}

export interface SearchSlice {
  searchHistory: SearchHistory[]
  search: (query: string, filters?: SearchFilter, limit?: number) => SearchResult[]
  getSearchSuggestions: (query: string) => SearchSuggestion[]
  addSearchHistory: (query: string, resultCount: number) => void
  clearSearchHistory: () => void
  removeSearchHistoryItem: (id: string) => void
  togglePinSearchHistory: (id: string) => void
  getPopularSearches: (limit?: number) => SearchHistory[]
}

type SearchSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  SearchSlice
>

/**
 * 文档可搜索文本缓存（小写形式）。
 * 全文搜索原实现对每个文档每次查询都重复做整篇 content 的 toLowerCase（多次大字符串分配，
 * 复杂度 O(文档数 × 内容大小 × 词条数)）。以文档对象为键 + updatedAt 失效缓存小写文本，
 * 文档未变更时搜索零拷贝。
 */
interface CachedSearchText {
  updatedAt: string
  title: string
  content: string
}

const searchTextCache = new WeakMap<NoteDoc, CachedSearchText>()

const getSearchableText = (doc: NoteDoc): CachedSearchText => {
  const cached = searchTextCache.get(doc)
  if (cached && cached.updatedAt === doc.updatedAt) {
    return cached
  }
  const next: CachedSearchText = {
    updatedAt: doc.updatedAt,
    title: doc.title.toLowerCase(),
    content: (doc.content || '').toLowerCase(),
  }
  searchTextCache.set(doc, next)
  return next
}

export const createSearchSlice: SearchSliceCreator = (set, get) => ({
  searchHistory: [],

  search: (query, filters, limit = 50) => {
    const { notebooks, tags } = get()
    const results: SearchResult[] = []

    const parseQuery = (q: string): { term: string; isNot: boolean; isExact: boolean }[] => {
      const terms: { term: string; isNot: boolean; isExact: boolean }[] = []
      const parts = q.split(/\s+/)

      parts.forEach(part => {
        let isNot = false
        let isExact = false
        let term = part

        if (term.startsWith('-')) {
          isNot = true
          term = term.slice(1)
        }

        if (term.startsWith('"') && term.endsWith('"')) {
          isExact = true
          term = term.slice(1, -1)
        }

        terms.push({ term: term.toLowerCase(), isNot, isExact })
      })

      return terms
    }

    const terms = parseQuery(query)

    // 接收已小写的文本，避免每次匹配重复 toLowerCase 整篇内容
    const matchesQuery = (lowerText: string | undefined): boolean => {
      if (!lowerText) return false

      return terms.every(({ term, isNot, isExact }) => {
        let found: boolean
        if (isExact) {
          found = lowerText.includes(term)
        } else {
          const searchTokens = tokenizeChinese(term)
          if (searchTokens.length === 0) {
            found = lowerText.includes(term)
          } else {
            found = searchTokens.every(token => lowerText.includes(token))
          }
        }

        return isNot ? !found : found
      })
    }

    const matchesTagFilter = (docTags: string[]): boolean => {
      if (!filters?.tags || filters.tags.length === 0) return true
      return filters.tags.some(tagId => docTags.includes(tagId))
    }

    const matchesDateFilter = (updatedAt: string): boolean => {
      if (!filters?.dateRange) return true
      const docDate = new Date(updatedAt)
      if (Number.isNaN(docDate.getTime())) return false
      // 起止日期可能只填一边，缺失的一侧不做限制，避免 Invalid Date 把所有结果过滤掉
      const startDate = filters.dateRange.start ? new Date(filters.dateRange.start) : null
      const endDate = filters.dateRange.end ? new Date(filters.dateRange.end) : null
      if (startDate && !Number.isNaN(startDate.getTime()) && docDate < startDate) return false
      if (endDate && !Number.isNaN(endDate.getTime())) {
        // 结束日期按当天 23:59:59 处理，确保当天的文档能被搜到
        const endOfDay = new Date(endDate)
        endOfDay.setHours(23, 59, 59, 999)
        if (docDate > endOfDay) return false
      }
      return true
    }

    // 复用调用方缓存的小写文本做片段定位，避免每词条再整篇 toLowerCase 一次
    const getSnippet = (content: string, lowerContent: string, term: string, radius: number = 40): string => {
      const lowerTerm = term.toLowerCase()
      const idx = lowerContent.indexOf(lowerTerm)
      if (idx === -1) {
        const tokens = tokenizeChinese(term)
        for (const token of tokens) {
          const tokenIdx = lowerContent.indexOf(token.toLowerCase())
          if (tokenIdx !== -1) {
            const start = Math.max(0, tokenIdx - radius)
            const end = Math.min(content.length, tokenIdx + token.length + radius)
            return content.slice(start, end)
          }
        }
        return content.slice(0, radius * 2)
      }
      const start = Math.max(0, idx - radius)
      const end = Math.min(content.length, idx + term.length + radius)
      return content.slice(start, end)
    }

    notebooks.forEach(notebook => {
      // type 过滤对两类结果都要生效：选"只搜知识库"时不应再返回文档，反之亦然
      if (filters?.type === 'all' || filters?.type === 'notebook') {
        if (matchesQuery(notebook.title.toLowerCase())) {
          // 取最新文档的更新时间（原实现取首个文档，排序失真）
          const latestDocTime = notebook.docs.reduce<string | null>(
            (max, d) => (!max || d.updatedAt > max ? d.updatedAt : max),
            null,
          )
          results.push({
            type: 'notebook',
            id: notebook.id,
            title: notebook.title,
            tags: [],
            updatedAt: latestDocTime || new Date().toISOString(),
          })
        }
      }

      if (filters?.type === 'notebook') return

      notebook.docs.forEach(doc => {
        const cached = getSearchableText(doc)
        const tagNames = doc.tags.map(tagId => tags.find(t => t.id === tagId)?.name || '').join(' ')
        // 全文（已小写）：标题 + 内容缓存 + 标签名
        const fullTextLower = `${cached.title} ${cached.content} ${tagNames.toLowerCase()}`

        if (matchesQuery(fullTextLower) && matchesTagFilter(doc.tags) && matchesDateFilter(doc.updatedAt)) {
          const highlights: { field: string; text: string }[] = []

          if (doc.title && terms.some(t => cached.title.includes(t.term))) {
            highlights.push({ field: 'title', text: doc.title })
          }
          if (doc.content) {
            const seenSnippets = new Set<string>()
            terms.forEach(t => {
              if (t.isNot) return
              const snippet = getSnippet(doc.content!, cached.content, t.term)
              if (snippet && !seenSnippets.has(snippet)) {
                seenSnippets.add(snippet)
                highlights.push({ field: 'content', text: snippet })
              }
            })
          }

          results.push({
            type: 'doc',
            id: doc.id,
            notebookId: notebook.id,
            title: doc.title,
            content: doc.content,
            tags: doc.tags,
            updatedAt: doc.updatedAt,
            highlights: highlights.slice(0, 3),
          })
        }
      })
    })

    return results
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit)
  },

  getSearchSuggestions: (query) => {
    const { notebooks, tags, searchHistory } = get()
    const suggestions: SearchSuggestion[] = []
    const lowerQuery = query.toLowerCase()
    const queryTokens = tokenizeChinese(lowerQuery)

    const matchesChinese = (text: string): boolean => {
      if (queryTokens.length === 0) return text.toLowerCase().includes(lowerQuery)
      return queryTokens.every(token => text.toLowerCase().includes(token))
    }

    tags.forEach(tag => {
      if (matchesChinese(tag.name)) {
        suggestions.push({
          text: tag.name,
          type: 'tag',
          tagId: tag.id,
        })
      }
    })

    notebooks.forEach(notebook => {
      notebook.docs.forEach(doc => {
        if (matchesChinese(doc.title)) {
          suggestions.push({
            text: doc.title,
            type: 'title',
            docId: doc.id,
          })
        }
      })
    })

    searchHistory.forEach(history => {
      if (history.query.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          text: history.query,
          type: 'history',
        })
      }
    })

    return suggestions.slice(0, 8)
  },

  addSearchHistory: (query, resultCount) => {
    set((state) => {
      const existing = state.searchHistory.find(h => h.query === query)

      if (existing) {
        existing.timestamp = new Date().toISOString()
        existing.resultCount = resultCount
        existing.useCount = (existing.useCount || 0) + 1
      } else {
        const newHistory: SearchHistory = {
          id: newId(),
          query,
          timestamp: new Date().toISOString(),
          resultCount,
          pinned: false,
          useCount: 1,
        }
        state.searchHistory.unshift(newHistory)
        if (state.searchHistory.length > 20) {
          // 保留置顶的项目
          const pinned = state.searchHistory.filter(h => h.pinned)
          const unpinned = state.searchHistory.filter(h => !h.pinned)
          state.searchHistory = [...pinned, ...unpinned.slice(0, 20 - pinned.length)]
        }
      }
    })
  },

  clearSearchHistory: () => {
    set((state) => {
      state.searchHistory = []
    })
  },

  removeSearchHistoryItem: (id) => {
    set((state) => {
      state.searchHistory = state.searchHistory.filter(h => h.id !== id)
    })
  },

  togglePinSearchHistory: (id) => {
    set((state) => {
      const item = state.searchHistory.find(h => h.id === id)
      if (item) {
        item.pinned = !item.pinned
      }
    })
  },

  getPopularSearches: (limit = 5) => {
    const { searchHistory } = get()
    return [...searchHistory]
      .sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
      .slice(0, limit)
  },
})