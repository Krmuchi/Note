import { describe, it, expect, beforeEach } from 'vitest'
import { useNotesStore } from '@/store'
import {
  consumeTagSearch,
  getPrimarySearchTerm,
  requestTagSearch,
  resetTagSearch,
  sortSearchHistory,
} from '@/store/slices/searchSlice'
import type { NoteDoc, Notebook, SearchHistory, Tag } from '@/types'

/**
 * 搜索的行为契约（此前 searchSlice 零测试）。
 * 重点锁定：相关度排序（S4）、排序切换、查询语法、以及"今天"这类日期边界的时区正确性。
 */

const doc = (over: Partial<NoteDoc> & { id: string; title: string }): NoteDoc => ({
  content: '',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const notebook = (docs: NoteDoc[], id = 'nb-1'): Notebook => ({ id, title: '知识库', docs })

const setStore = (docs: NoteDoc[]): void =>
  useNotesStore.setState({ notebooks: [notebook(docs)], trash: [], tags: [], searchHistory: [] })

describe('search - 排序与相关度', () => {
  beforeEach(() => {
    setStore([
      doc({
        id: 'd-content',
        title: '无关标题',
        content: '正文里出现了关键词' + 'x'.repeat(50) + '关键词',
        updatedAt: '2026-10-01T10:00:00.000Z',
      }),
      doc({ id: 'd-title', title: '关键词在标题里', content: '正文没有', updatedAt: '2026-09-01T10:00:00.000Z' }),
    ])
  })

  it('默认按相关度：标题命中优先于正文命中（即使正文文档更新）', () => {
    const results = useNotesStore.getState().search('关键词')
    expect(results.map(r => r.id)).toEqual(['d-title', 'd-content'])
    expect(results[0].score!).toBeGreaterThan(results[1].score!)
  })

  it('标题以关键词开头时得分更高', () => {
    setStore([
      doc({ id: 'd-prefix', title: '关键词开头' }),
      doc({ id: 'd-middle', title: '中间有词关键词在后面' }),
    ])
    const results = useNotesStore.getState().search('关键词')
    expect(results[0].id).toBe('d-prefix')
  })

  it('sort=time 时按最近更新倒序', () => {
    const results = useNotesStore.getState().search('关键词', { sort: 'time' })
    expect(results.map(r => r.id)).toEqual(['d-content', 'd-title'])
  })
})

describe('search - 查询语法', () => {
  beforeEach(() => {
    setStore([
      doc({ id: 'd-a', title: '项目计划 A', content: '包含归档说明' }),
      doc({ id: 'd-b', title: '项目计划 B', content: '不含那个词' }),
    ])
  })

  it('空格分隔＝需要同时包含', () => {
    const results = useNotesStore.getState().search('项目 计划')
    expect(results).toHaveLength(2)
  })

  it('-排除词 过滤掉包含该词的文档', () => {
    const results = useNotesStore.getState().search('项目 -归档')
    expect(results.map(r => r.id)).toEqual(['d-b'])
  })

  it('"精确短语" 要求连续出现，而普通查询只要求每个字都出现', () => {
    // 用反序的字做判别：普通查询会分词成单字，四个字都在 → 命中；
    // 引号包裹后要求连续子串 → 命中不到。这正是"精确短语"的意义所在。
    expect(useNotesStore.getState().search('划计目项')).toHaveLength(2)
    expect(useNotesStore.getState().search('"划计目项"')).toHaveLength(0)
  })

  it('排除词不参与相关度打分', () => {
    const results = useNotesStore.getState().search('项目 -归档')
    expect(results[0].score).toBeGreaterThan(0)
  })
})

describe('search - 日期边界', () => {
  it('开始日期按本地零点解析：当天 00:30 的文档算在范围内', () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const today = `${y}-${m}-${d}`

    setStore([
      doc({ id: 'd-early', title: '今天的文档', updatedAt: new Date(`${today}T00:30:00`).toISOString() }),
      doc({ id: 'd-old', title: '今天的文档', updatedAt: new Date(Date.now() - 2 * 86400000).toISOString() }),
    ])

    const results = useNotesStore.getState().search('今天的文档', { dateRange: { start: today, end: today } })
    expect(results.map(r => r.id)).toEqual(['d-early'])
  })

  it('结束日期按当天 23:59:59 处理：当天 23:00 的文档仍能搜到', () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const today = `${y}-${m}-${d}`

    setStore([doc({ id: 'd-late', title: '晚间文档', updatedAt: new Date(`${today}T23:00:00`).toISOString() })])
    const results = useNotesStore.getState().search('晚间文档', { dateRange: { start: today, end: today } })
    expect(results.map(r => r.id)).toEqual(['d-late'])
  })
})

describe('search - 空查询与退化输入', () => {
  beforeEach(() => {
    setStore([
      doc({ id: 'd-a', title: '项目计划 A', content: '正文' }),
      doc({ id: 'd-b', title: '项目计划 B', content: '正文' }),
    ])
  })

  /**
   * 回归：空词条曾让 every() 里的 includes('') 恒为 true，
   * 于是空查询（以及连续空格、只有一个 "-" 的输入）会"命中整库"并弹出全部文档。
   */
  it('空查询不返回整库', () => {
    expect(useNotesStore.getState().search('')).toEqual([])
    expect(useNotesStore.getState().search('   ')).toEqual([])
  })

  it('只有排除符号 / 空引号时也不返回整库', () => {
    expect(useNotesStore.getState().search('-')).toEqual([])
    expect(useNotesStore.getState().search('""')).toEqual([])
  })

  it('空查询的建议为空（不把全部标签与标题倒进下拉）', () => {
    expect(useNotesStore.getState().getSearchSuggestions('')).toEqual([])
  })
})

describe('getPrimarySearchTerm', () => {
  it('跳过排除词并剥掉精确短语引号', () => {
    expect(getPrimarySearchTerm('-排除 关键词')).toBe('关键词')
    expect(getPrimarySearchTerm('"精确短语"')).toBe('精确短语')
    expect(getPrimarySearchTerm('-只有排除词')).toBe('')
    expect(getPrimarySearchTerm('   ')).toBe('')
  })
})

/**
 * 回归：搜索历史的渲染顺序（SearchHistory 列表）与键盘 Enter 的取词顺序
 * （SearchPanel 按 activeIndex 取数组项）必须一致。旧实现只在组件里排序，
 * 有置顶项时"回车搜的不是高亮那条"。现在 store 写入路径保证置顶在前。
 */
describe('searchHistory - 置顶顺序', () => {
  const history = (over: Partial<SearchHistory> & { id: string; query: string }): SearchHistory => ({
    timestamp: '2026-01-01T00:00:00.000Z',
    resultCount: 1,
    pinned: false,
    useCount: 1,
    ...over,
  })

  beforeEach(() => {
    useNotesStore.setState({ searchHistory: [] })
  })

  it('togglePin 把置顶项移到最前；取消置顶后稳定保持当前位置（渲染与取词仍一致）', () => {
    useNotesStore.setState({
      searchHistory: [history({ id: 'h1', query: '甲' }), history({ id: 'h2', query: '乙' })],
    })

    useNotesStore.getState().togglePinSearchHistory('h2')
    expect(useNotesStore.getState().searchHistory.map(h => h.id)).toEqual(['h2', 'h1'])

    // 取消置顶：稳定排序不重排未置顶项，h2 留在原位（顺序仍与渲染一致）
    useNotesStore.getState().togglePinSearchHistory('h2')
    expect(useNotesStore.getState().searchHistory.map(h => h.id)).toEqual(['h2', 'h1'])
    expect(useNotesStore.getState().searchHistory.every(h => !h.pinned)).toBe(true)
  })

  it('addSearchHistory 新增条目后置顶项仍在前', () => {
    useNotesStore.setState({
      searchHistory: [history({ id: 'h1', query: '置顶词', pinned: true })],
    })

    useNotesStore.getState().addSearchHistory('新词', 3)
    expect(useNotesStore.getState().searchHistory.map(h => h.query)).toEqual(['置顶词', '新词'])
  })

  it('sortSearchHistory 是稳定排序：同置顶状态保持原相对顺序', () => {
    const list = [
      history({ id: 'a', query: 'a' }),
      history({ id: 'b', query: 'b', pinned: true }),
      history({ id: 'c', query: 'c' }),
      history({ id: 'd', query: 'd', pinned: true }),
    ]
    expect(sortSearchHistory(list).map(h => h.id)).toEqual(['b', 'd', 'a', 'c'])
    // 不改动原数组
    expect(list.map(h => h.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

/**
 * 回归：建议列表的数据顺序必须与 SearchSuggestions 的分组渲染顺序一致
 * （history → title → tag）。键盘 ↑↓/Enter 用原始下标取词，
 * 数据顺序与视觉顺序不同会让方向键"跳着走"。
 */
describe('getSearchSuggestions - 输出顺序与分组渲染一致', () => {
  const tag: Tag = {
    id: 't1',
    name: '项目标签',
    color: '#f00',
    icon: '',
    parentId: null,
    usageCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  beforeEach(() => {
    useNotesStore.setState({
      notebooks: [notebook([doc({ id: 'd1', title: '项目文档' })])],
      tags: [tag],
      searchHistory: [
        { id: 'h1', query: '项目历史', timestamp: '2026-01-01T00:00:00.000Z', resultCount: 1, pinned: false, useCount: 1 },
      ],
    })
  })

  it('按 history → title → tag 输出', () => {
    const suggestions = useNotesStore.getState().getSearchSuggestions('项目')
    expect(suggestions.map(s => s.type)).toEqual(['history', 'title', 'tag'])
    expect(suggestions.map(s => s.text)).toEqual(['项目历史', '项目文档', '项目标签'])
  })
})

/**
 * P1-9「按标签看文档」：关键词可以为空，但必须有标签/日期这类范围约束兜底 ——
 * 否则空查询会命中整库（这正是旧实现 return [] 要防的事故）。
 */
describe('search - 空关键词 + 范围筛选', () => {
  beforeEach(() => {
    setStore([
      doc({ id: 'd1', title: '工作日报', tags: ['t-work'] }),
      doc({ id: 'd2', title: '旅行计划', tags: ['t-life'] }),
      doc({ id: 'd3', title: '无标签文档' }),
    ])
    useNotesStore.setState({ tags: [{ id: 't-work', name: '工作', color: '#f00', icon: '', parentId: null, usageCount: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] })
  })

  it('空关键词 + 标签：返回该标签下的全部文档', () => {
    const results = useNotesStore.getState().search('', { type: 'all', tags: ['t-work'] })
    expect(results.map(r => r.id)).toEqual(['d1'])
  })

  it('空关键词 + 无任何约束：仍然返回空，不会命中整库', () => {
    expect(useNotesStore.getState().search('', { type: 'all' })).toEqual([])
    expect(useNotesStore.getState().search('   ', {})).toEqual([])
  })

  it('空关键词 + 日期范围：只按日期收窄', () => {
    const results = useNotesStore.getState().search('', {
      type: 'all',
      dateRange: { start: '2025-12-31', end: '2026-01-02' },
    })
    expect(results.map(r => r.id).sort()).toEqual(['d1', 'd2', 'd3'])
  })
})

describe('搜索历史 - 清空可撤销（restoreSearchHistory）', () => {
  const history: SearchHistory[] = [
    { id: 'h1', query: '普通词', timestamp: '2026-01-01T00:00:00.000Z', resultCount: 2, pinned: false, useCount: 1 },
    { id: 'h2', query: '置顶词', timestamp: '2026-01-02T00:00:00.000Z', resultCount: 3, pinned: true, useCount: 5 },
  ]

  beforeEach(() => {
    useNotesStore.setState({ searchHistory: [...history] })
  })

  it('清空后可整份还原，且置顶项仍在最前', () => {
    const snapshot = useNotesStore.getState().searchHistory
    useNotesStore.getState().clearSearchHistory()
    expect(useNotesStore.getState().searchHistory).toEqual([])

    useNotesStore.getState().restoreSearchHistory(snapshot)
    expect(useNotesStore.getState().searchHistory.map(h => h.id)).toEqual(['h2', 'h1'])
  })

  it('传入非数组时忽略（撤销过期/脏数据不崩）', () => {
    useNotesStore.getState().clearSearchHistory()
    useNotesStore.getState().restoreSearchHistory(undefined as unknown as SearchHistory[])
    expect(useNotesStore.getState().searchHistory).toEqual([])
  })
})

describe('requestTagSearch / consumeTagSearch 一次性通道', () => {
  it('取出即清空，重复消费返回 null', () => {
    resetTagSearch()
    requestTagSearch({ tagIds: ['t1'], label: '工作' })
    expect(consumeTagSearch()).toEqual({ tagIds: ['t1'], label: '工作' })
    expect(consumeTagSearch()).toBeNull()
  })

  it('外部修改入参不影响已存下的请求（取值时拷贝）', () => {
    resetTagSearch()
    const ids = ['t1']
    requestTagSearch({ tagIds: ids, label: '工作' })
    ids.push('t2')
    expect(consumeTagSearch()?.tagIds).toEqual(['t1'])
  })
})
