import type { StateCreator } from 'zustand'
import type { SearchHistory, SearchSuggestion, SearchFilter, SearchResult, SearchResponse, NoteDoc } from '@/types'
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

/**
 * 置顶优先的稳定排序：搜索历史的**渲染顺序**与键盘 Enter 的**取词顺序**必须一致。
 * 旧实现只在 SearchHistory 组件里排序，而 SearchPanel 的 Enter 仍按原始数组下标取词，
 * 有置顶项时"回车搜的不是高亮那条"。这里提供唯一排序来源，store 写入与面板共用。
 * Array.prototype.sort 在现代 V8 是稳定排序：同置顶状态下保持原有相对顺序。
 */
export const sortSearchHistory = (history: SearchHistory[]): SearchHistory[] =>
  [...history].sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false))

/**
 * P1-9「按标签看文档」的跨组件一次性请求：标签页发起 → 搜索面板打开时消费。
 * 与 searchJump / docNavigation 同款的模块级通道（面板的筛选条件是组件内 state，
 * 从外部塞值只能走一次性请求，避免把临时查询写进全局 store）。
 */
export interface TagSearchRequest {
  tagIds: string[]
  /** 展示用的标签名（面板标题/提示语），如「工作」 */
  label: string
}

let pendingTagSearch: TagSearchRequest | null = null

export function requestTagSearch(request: TagSearchRequest): void {
  pendingTagSearch = { tagIds: [...request.tagIds], label: request.label }
}

/** 取出并清空待处理请求；未消费的请求不会影响下一次普通搜索 */
export function consumeTagSearch(): TagSearchRequest | null {
  const request = pendingTagSearch
  pendingTagSearch = null
  return request
}

/** 仅测试用 */
export function resetTagSearch(): void {
  pendingTagSearch = null
}

/**
 * 流式 top-K 的默认 K：搜索只保留分数最高的前 200 条。
 * 旧实现先算完全部命中、给每条生成高亮片段、再全量排序，1000 篇库搜常见词
 * 一次 100~500ms 主线程冻结；改为遍历期维护一个容量 K 的有序窗口后，
 * 排序与高亮的成本都只跟 K 走，不再随命中数放大。
 * 需要更多结果的调用方可以显式传更大的 limit，或用 offset 分批取回下一段（按需加载下一批）。
 */
export const SEARCH_TOP_K = 200

export interface SearchSlice {
  searchHistory: SearchHistory[]
  /**
   * 流式 top-K 搜索：遍历时只保留分数最高的前 limit 条（默认 SEARCH_TOP_K），
   * 高亮片段只对最终保留的条目生成。需要未截断的命中总数时用 searchWithTotal。
   */
  search: (query: string, filters?: SearchFilter, limit?: number, offset?: number) => SearchResult[]
  /**
   * 与 search 同一引擎，额外返回未截断的命中总数（结果头「共 N 条」用，total >= results.length）。
   * offset：跳过全量排序的前 offset 条、取接下来的 limit 条 —— 「按需加载下一批」用；
   * 批与批之间名次连续（第 201~400 条就是全量排序的 201~400 名），平局走同一套稳定序。
   */
  searchWithTotal: (query: string, filters?: SearchFilter, limit?: number, offset?: number) => SearchResponse
  getSearchSuggestions: (query: string) => SearchSuggestion[]
  addSearchHistory: (query: string, resultCount: number) => void
  clearSearchHistory: () => void
  /** P2「清空搜索历史可撤销」：一次性还原被清空的整份历史（含置顶状态与顺序） */
  restoreSearchHistory: (items: SearchHistory[]) => void
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

/** updatedAt → 毫秒；无效时间按最早处理（比较器必须全序，二分插入才稳定） */
const parseTime = (iso: string): number => {
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * top-K 窗口里的候选条目：命中时只存结果骨架与引用，
 * 高亮片段等窗口定型后只为最终保留的条目生成。
 */
interface SearchCandidate {
  result: SearchResult
  /** updatedAt 的毫秒数（预解析：排序比较不再每次 new Date） */
  timeMs: number
  /** 文档命中的引用（供事后生成高亮片段）；知识库命中为 null */
  doc: NoteDoc | null
  cached: CachedSearchText | null
}

export const createSearchSlice: SearchSliceCreator = (set, get) => ({
  searchHistory: [],

  search: (query, filters, limit = SEARCH_TOP_K, offset = 0) =>
    get().searchWithTotal(query, filters, limit, offset).results,

  searchWithTotal: (query, filters, limit = SEARCH_TOP_K, offset = 0) => {
    const { notebooks, tags } = get()

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
    /*
     * 没有任何正向/排除词条时：空查询不应返回整库。
     * 例外（P1-9「按标签看文档」）：用户只要求了标签或日期范围时，
     * 关键词可以为空 —— 此时 matchesQuery 对空词条恒真，结果由下面的
     * 标签/日期谓词收窄，天然就是"这个标签下有哪些文档"。
     * 既无词条也无任何范围约束才回落到 []（否则空查询命中全部文档）。
     */
    const hasScopeFilter = Boolean(filters?.tags?.length || filters?.dateRange)
    if (terms.length === 0 && !hasScopeFilter) return { results: [], total: 0 }

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

    /*
     * 流式 top-K：遍历时只维护一个容量 cap 的有序窗口（降序，最优在前），
     * 不再全量收集再排序。窗口次序与最终排序完全同一套：
     * 相关度（score 降序 → 更新时间倒序）或 sort=time 时纯时间倒序。
     * 平局视为相等，二分插入把后来者放在同分者之后 —— 与 Array.prototype.sort
     * 的稳定语义一致（同分时先命中的文档占住前 K 的位置）。
     */
    const cap = Math.max(0, Math.floor(limit))
    // 按需分批：跳过全量排序的前 skip 名，取接下来的 cap 名。
    // 窗口必须装下 skip + cap 名，slice 出来的才是全量排序里 [skip, skip+cap) 的名次段。
    const skip = Math.max(0, Math.floor(offset))
    const windowCap = skip + cap
    // 约定：compare(a, b) > 0 表示 a 排在 b 前面（a 更优）；等于 0 为平局。
    // （与 Array.prototype.sort 的"负数=在前"相反，keep 里按此约定写二分。）
    const byTimeDesc = (a: SearchCandidate, b: SearchCandidate): number => a.timeMs - b.timeMs
    const compare: (a: SearchCandidate, b: SearchCandidate) => number =
      filters?.sort === 'time'
        ? byTimeDesc
        : (a, b) => (a.result.score ?? 0) - (b.result.score ?? 0) || byTimeDesc(a, b)

    const kept: SearchCandidate[] = []
    /** 未截断的命中总数（含被窗口丢弃的） */
    let total = 0

    const keep = (candidate: SearchCandidate): void => {
      if (windowCap <= 0) return
      // 不比当前最差的更好（含平局）：丢弃 —— 稳定语义下先到者占住位置
      if (kept.length >= windowCap && compare(candidate, kept[kept.length - 1]) <= 0) return
      // 二分找插入点：放在所有"不比它差"的元素之后、第一个比它差的之前
      let lo = 0
      let hi = kept.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (compare(kept[mid], candidate) >= 0) lo = mid + 1
        else hi = mid
      }
      kept.splice(lo, 0, candidate)
      if (kept.length > windowCap) kept.pop()
    }

    notebooks.forEach(notebook => {
      /*
       * type 过滤对两类结果都要生效：选"只搜知识库"时不应再返回文档，反之亦然。
       * 纯范围筛选（无关键词、只有标签/日期）时**不出知识库结果**：
       * 知识库本身没有标签可被范围谓词收窄，否则"按标签看文档"会混进一个
       * 和该标签毫无关系的知识库行。
       */
      const keywordScoped = terms.length > 0
      if (keywordScoped && (filters?.type === 'all' || filters?.type === 'notebook')) {
        if (matchesQuery(notebook.title.toLowerCase())) {
          // 取最新文档的更新时间（原实现取首个文档，排序失真）
          const latestDocTime = notebook.docs.reduce<string | null>(
            (max, d) => (!max || d.updatedAt > max ? d.updatedAt : max),
            null,
          )
          const updatedAt = latestDocTime || new Date().toISOString()
          total++
          keep({
            result: {
              type: 'notebook',
              id: notebook.id,
              title: notebook.title,
              tags: [],
              updatedAt,
              score: scoreOf(notebook.title.toLowerCase(), '', ''),
            },
            timeMs: parseTime(updatedAt),
            doc: null,
            cached: null,
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
          total++
          keep({
            result: {
              type: 'doc',
              id: doc.id,
              notebookId: notebook.id,
              title: doc.title,
              content: doc.content,
              tags: doc.tags,
              updatedAt: doc.updatedAt,
              score: scoreOf(cached.title, cached.content, tagNames),
            },
            timeMs: parseTime(doc.updatedAt),
            doc,
            cached,
          })
        }
      })
    })

    /*
     * 名次段 [skip, skip+cap) 已定型：只为最终要展示的这一页生成高亮片段。
     * 旧实现在遍历期给全部命中生成片段，排序后又把 cap 之外的丢掉 —— 白算。
     * 片段逻辑原样保留（标题命中整条 + 每个正向词条一段正文上下文，最多 3 条）。
     */
    const results: SearchResult[] = kept.slice(skip, skip + cap).map(({ result, doc, cached }) => {
      // 知识库命中本来就不带高亮
      if (!doc || !cached) return result

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
      return { ...result, highlights: highlights.slice(0, 3) }
    })

    return { results, total }
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

    /*
     * 输出顺序必须与 SearchSuggestions 的分组渲染顺序一致（history → title → tag）：
     * 面板的 ↑↓/Enter 用 suggestions 的原始下标取词，而分组只改视觉不改下标；
     * 数据顺序若与视觉顺序不同，方向键就会"跳着走"（先高亮最末组的标签项）。
     */
    searchHistory.forEach(history => {
      if (history.query.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          text: history.query,
          type: 'history',
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

    tags.forEach(tag => {
      if (matchesChinese(tag.name)) {
        suggestions.push({
          text: tag.name,
          type: 'tag',
          tagId: tag.id,
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
      // 置顶项恒在前：渲染顺序与键盘取词顺序共用这一份数组
      state.searchHistory = sortSearchHistory(state.searchHistory)
    })
  },

  clearSearchHistory: () => {
    set((state) => {
      state.searchHistory = []
    })
  },

  restoreSearchHistory: (items) => {
    if (!Array.isArray(items)) return
    set((state) => {
      // 与写入路径同序：置顶在前、其余按原相对顺序（用户看到的正是被清空前的样子）
      state.searchHistory = sortSearchHistory(items)
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
        // 置顶/取消置顶后立即重排：否则置顶项仍留在原位置，
        // 列表"置顶优先"的视觉顺序与数组下标（键盘 Enter 取词）错位
        state.searchHistory = sortSearchHistory(state.searchHistory)
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