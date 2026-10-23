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

/**
 * 取第一个"正向"关键词：跳过 `-排除词`，并剥掉精确短语的引号。
 * 搜索结果的"打开后定位到命中处"（S1）需要一个真正能在正文里找到的词 ——
 * 直接把整串查询丢进去会因为 `-词` 而定位失败。
 */
export const getPrimarySearchTerm = (query: string): string => {
  for (const part of query.trim().split(/\s+/)) {
    if (!part || part.startsWith('-')) continue
    const term = part.startsWith('"') && part.endsWith('"') ? part.slice(1, -1) : part
    if (term) return term
  }
  return ''
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

        // 空词条（连续空格 / 只有一个 "-" / 只有一对引号）必须丢弃：
        // 留着会让 every() 里的 includes('') 恒为 true，空查询于是"命中全部文档"
        if (!term) return

        terms.push({ term: term.toLowerCase(), isNot, isExact })
      })

      return terms
    }

    const terms = parseQuery(query)
    // 没有任何正向/排除词条：空查询不应返回整库
    if (terms.length === 0) return []

    /*
     * 分词只做一次。
     * 旧实现把 `tokenizeChinese(term)` 放在 matchesQuery 的 every 回调里，
     * 也就是"每篇文档 × 每个词条"都要重跑一遍逐字符分词 —— 2000 篇文档、
     * 2 个词条就是 4000 次对一个短词的分词，属于纯浪费。
     */
    const termPlans = terms.map(({ term, isNot, isExact }) => ({
      term,
      isNot,
      isExact,
      tokens: isExact ? [] : tokenizeChinese(term),
    }))

    // 标签 id → 小写名称，避免每篇文档都对每个标签做一次 tags.find 线性扫描
    const tagNameById = new Map<string, string>()
    for (const tag of tags) tagNameById.set(tag.id, (tag.name || '').toLowerCase())

    // 接收已小写的文本，避免每次匹配重复 toLowerCase 整篇内容
    const matchesQuery = (lowerText: string | undefined): boolean => {
      if (!lowerText) return false

      for (const plan of termPlans) {
        const { term, isNot, isExact, tokens } = plan
        const found = isExact || tokens.length === 0
          ? lowerText.includes(term)
          : tokens.every(token => lowerText.includes(token))
        if (isNot ? found : !found) return false
      }
      return true
    }

    /*
     * 需要打分的词条（排除词不参与打分）。
     * 旧实现每次 scoreOf 都从头遍历 terms 再判断 isNot，命中结果的打分因此
     * 多走一遍含排除词的循环；这里提前筛掉。
     */
    const scoringTerms = terms.filter(t => !t.isNot && t.term)

    const scoreOf = (titleLower: string, contentLower: string, tagNamesLower: string): number => {
      let score = 0
      for (const { term } of scoringTerms) {
        if (titleLower.includes(term)) {
          score += titleLower.startsWith(term) ? 120 : 90
        }

        const first = contentLower.indexOf(term)
        if (first >= 0) {
          score += 40
          score += Math.max(0, 20 - Math.floor(first / 200))
          let count = 0
          let from = first
          while (count < 12) {
            const next = contentLower.indexOf(term, from)
            if (next === -1) break
            count++
            from = next + term.length
          }
          score += Math.min(count, 10) * 3
        }

        if (tagNamesLower.includes(term)) score += 25
      }
      return score
    }

    const matchesTagFilter = (docTags: string[]): boolean => {
      if (!filters?.tags || filters.tags.length === 0) return true
      return filters.tags.some(tagId => docTags.includes(tagId))
    }

    /*
     * 日期边界只解析一次。
     * 旧实现在 matchesDateFilter 内部对每篇文档都 new Date(...) 两次 + setHours 一次，
     * 启用日期筛选时会随文档数线性放大；边界值本身只取决于 filters，与文档无关。
     * 显式拼 T00:00:00 按本地时区解析：new Date('2026-10-01') 走的是 UTC，
     * 东八区下等于本地 08:00，会把当天 00:00–08:00 更新的文档错误排除。
     */
    const rangeStart = filters?.dateRange?.start
      ? new Date(`${filters.dateRange.start}T00:00:00`)
      : null
    const rangeEndRaw = filters?.dateRange?.end
      ? new Date(`${filters.dateRange.end}T00:00:00`)
      : null
    const rangeStartMs =
      rangeStart && !Number.isNaN(rangeStart.getTime()) ? rangeStart.getTime() : null
    let rangeEndMs: number | null = null
    if (rangeEndRaw && !Number.isNaN(rangeEndRaw.getTime())) {
      // 结束日期按当天 23:59:59 处理，确保当天的文档能被搜到
      rangeEndRaw.setHours(23, 59, 59, 999)
      rangeEndMs = rangeEndRaw.getTime()
    }

    const hasDateFilter = rangeStartMs !== null || rangeEndMs !== null

    const matchesDateFilter = (updatedAt: string): boolean => {
      if (!hasDateFilter) return true
      const docTime = Date.parse(updatedAt)
      if (Number.isNaN(docTime)) return false
      // 只限制用户真正填了的一侧，避免单边筛选把所有结果过滤掉
      if (rangeStartMs !== null && docTime < rangeStartMs) return false
      if (rangeEndMs !== null && docTime > rangeEndMs) return false
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
            score: scoreOf(notebook.title.toLowerCase(), '', ''),
          })
        }
      }

      if (filters?.type === 'notebook') return

      notebook.docs.forEach(doc => {
        const cached = getSearchableText(doc)
        // 标签名从 id→name 映射取，不再对每个文档的每个标签做一次 tags.find
        const tagNames = doc.tags.map(tagId => tagNameById.get(tagId) ?? '').join(' ')
        // 全文（已小写）：标题 + 内容缓存 + 标签名
        const fullTextLower = `${cached.title} ${cached.content} ${tagNames}`

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
            score: scoreOf(cached.title, cached.content, tagNames),
          })
        }
      })
    })

    const byTime = (a: SearchResult, b: SearchResult): number =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()

    // 默认按相关度（与语雀一致：搜索结果先看"多相关"，而不是"多新"），可切换为最近更新
    if (filters?.sort === 'time') {
      return results.sort(byTime).slice(0, limit)
    }

    return results
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || byTime(a, b))
      .slice(0, limit)
  },

  getSearchSuggestions: (query) => {
    const { notebooks, tags, searchHistory } = get()
    const suggestions: SearchSuggestion[] = []
    const lowerQuery = query.toLowerCase()
    // 空查询不做建议：否则会把全部标签 + 全部文档标题一次性塞进来
    if (!lowerQuery) return suggestions
    const queryTokens = tokenizeChinese(lowerQuery)

    const matchesChinese = (text: string): boolean => {
      const lower = text.toLowerCase()
      if (queryTokens.length === 0) return lower.includes(lowerQuery)
      return queryTokens.every(token => lower.includes(token))
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