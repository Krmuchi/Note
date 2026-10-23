import { describe, it, expect, beforeEach } from 'vitest'
import { useNotesStore } from '@/store'
import { getPrimarySearchTerm } from '@/store/slices/searchSlice'
import type { NoteDoc, Notebook } from '@/types'

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
