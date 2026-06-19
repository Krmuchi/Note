import type { StateCreator } from 'zustand'
import type { SearchHistory, SearchSuggestion, SearchFilter, SearchResult } from '@/types'
import type { NotesStore } from '@/store/types'
import { newId } from '@/store/storeUtils'

const tokenizeChinese = (text: string): string[] => {
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
  search: (query: string, filters?: SearchFilter) => SearchResult[]
  getSearchSuggestions: (query: string) => SearchSuggestion[]
  addSearchHistory: (query: string, resultCount: number) => void
  clearSearchHistory: () => void
  removeSearchHistoryItem: (id: string) => void
}

type SearchSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  SearchSlice
>

export const createSearchSlice: SearchSliceCreator = (set, get) => ({
  searchHistory: [],

  search: (query, filters) => {
    const { notebooks, tags } = get()
    const results: SearchResult[] = []

    const parseQuery = (q: string) => {
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

    const matchesQuery = (text: string | undefined): boolean => {
      if (!text) return false
      const lowerText = text.toLowerCase()

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

    const matchesTagFilter = (docTags: string[]) => {
      if (!filters?.tags || filters.tags.length === 0) return true
      return filters.tags.some(tagId => docTags.includes(tagId))
    }

    const matchesDateFilter = (updatedAt: string) => {
      if (!filters?.dateRange) return true
      const docDate = new Date(updatedAt)
      const startDate = new Date(filters.dateRange.start)
      const endDate = new Date(filters.dateRange.end)
      return docDate >= startDate && docDate <= endDate
    }

    const getSnippet = (content: string, term: string, radius: number = 40): string => {
      const lowerContent = content.toLowerCase()
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
      if (filters?.type === 'all' || filters?.type === 'notebook') {
        if (matchesQuery(notebook.title)) {
          results.push({
            type: 'notebook',
            id: notebook.id,
            title: notebook.title,
            tags: [],
            updatedAt: notebook.docs[0]?.updatedAt || new Date().toISOString(),
          })
        }
      }

      notebook.docs.forEach(doc => {
        const tagNames = doc.tags.map(tagId => tags.find(t => t.id === tagId)?.name || '').join(' ')
        const fullText = `${doc.title} ${doc.content || ''} ${tagNames}`

        if (matchesQuery(fullText) && matchesTagFilter(doc.tags) && matchesDateFilter(doc.updatedAt)) {
          const highlights: { field: string; text: string }[] = []

          if (doc.title && terms.some(t => doc.title.toLowerCase().includes(t.term))) {
            highlights.push({ field: 'title', text: doc.title })
          }
          if (doc.content) {
            const seenSnippets = new Set<string>()
            terms.forEach(t => {
              if (t.isNot) return
              const snippet = getSnippet(doc.content!, t.term)
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

    return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
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
      } else {
        const newHistory: SearchHistory = {
          id: newId(),
          query,
          timestamp: new Date().toISOString(),
          resultCount,
        }
        state.searchHistory.unshift(newHistory)
        if (state.searchHistory.length > 20) {
          state.searchHistory = state.searchHistory.slice(0, 20)
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
})