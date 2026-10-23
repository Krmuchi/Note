import { describe, it, expect, beforeEach } from 'vitest'
import { useNotesStore } from '@/store'
import type { QuickNoteData } from '@/types'

/**
 * 便签的导出 / 导入（数据安全）。
 *
 * 背景：便签平时只存在独立的 localStorage 键里，**不在 notes-data.json 中**。
 * 于是「导出全部」与「本地备份」都带不走便签 —— 用户以为备份全了，
 * 换机恢复时才发现便签全丢。这里锁定三条契约：
 * 1. 导出载荷必须包含便签；
 * 2. 导入时按 id 去重，且保留 updatedAt 较新的那一份（不覆盖本机的新编辑）；
 * 3. 脏数据（非数组 / 缺字段）不能让导入崩掉。
 */

const note = (over: Partial<QuickNoteData> & { id: string }): QuickNoteData => ({
  content: '便签内容',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

beforeEach(() => {
  localStorage.clear()
  useNotesStore.setState({
    notebooks: [],
    trash: [],
    tags: [],
    searchHistory: [],
    quickNotes: [],
  })
})

describe('withQuickNotesForExport', () => {
  it('把便签并入导出载荷（否则导出会丢便签）', () => {
    useNotesStore.setState({ quickNotes: [note({ id: 'q1', content: 'A' })] })

    const payload = useNotesStore.getState().withQuickNotesForExport({ notebooks: [], trash: [] })

    expect(payload.quickNotes).toHaveLength(1)
    expect(payload.quickNotes[0].content).toBe('A')
    // 原有字段不受影响
    expect(payload.notebooks).toEqual([])
  })

  it('返回的是副本，改它不会影响 store（避免导出过程污染状态）', () => {
    useNotesStore.setState({ quickNotes: [note({ id: 'q1', content: 'A' })] })

    const payload = useNotesStore.getState().withQuickNotesForExport({})
    payload.quickNotes[0].content = '被改了'

    expect(useNotesStore.getState().quickNotes[0].content).toBe('A')
  })

  it('没有便签时导出空数组（而不是 undefined）', () => {
    const payload = useNotesStore.getState().withQuickNotesForExport({})
    expect(payload.quickNotes).toEqual([])
  })
})

describe('importQuickNotes', () => {
  it('导入本机不存在的便签', () => {
    useNotesStore.getState().importQuickNotes([note({ id: 'q1', content: '来自备份' })])

    const notes = useNotesStore.getState().quickNotes
    expect(notes).toHaveLength(1)
    expect(notes[0].content).toBe('来自备份')
  })

  it('同 id 时保留 updatedAt 较新的一份（不覆盖本机的新编辑）', () => {
    useNotesStore.setState({
      quickNotes: [note({ id: 'q1', content: '本机较新', updatedAt: '2026-06-01T00:00:00.000Z' })],
    })

    useNotesStore.getState().importQuickNotes([
      note({ id: 'q1', content: '备份较旧', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ])

    expect(useNotesStore.getState().quickNotes[0].content).toBe('本机较新')
  })

  it('备份较新时以备份为准', () => {
    useNotesStore.setState({
      quickNotes: [note({ id: 'q1', content: '本机较旧', updatedAt: '2026-01-01T00:00:00.000Z' })],
    })

    useNotesStore.getState().importQuickNotes([
      note({ id: 'q1', content: '备份较新', updatedAt: '2026-06-01T00:00:00.000Z' }),
    ])

    expect(useNotesStore.getState().quickNotes[0].content).toBe('备份较新')
  })

  it('空/非法输入不改变现状', () => {
    useNotesStore.setState({ quickNotes: [note({ id: 'q1' })] })

    useNotesStore.getState().importQuickNotes(undefined)
    useNotesStore.getState().importQuickNotes([])
    useNotesStore.getState().importQuickNotes(null as unknown as QuickNoteData[])

    expect(useNotesStore.getState().quickNotes).toHaveLength(1)
  })

  it('跳过缺字段的脏项，其余正常导入', () => {
    useNotesStore.getState().importQuickNotes([
      { id: 'ok', content: '有效', tags: [], createdAt: '', updatedAt: '' },
      { id: 123, content: 'id 不是字符串' } as unknown as QuickNoteData,
      { id: 'no-content' } as unknown as QuickNoteData,
    ])

    const notes = useNotesStore.getState().quickNotes
    expect(notes).toHaveLength(1)
    expect(notes[0].id).toBe('ok')
  })

  it('tags 缺失时归一化为空数组（避免渲染崩溃）', () => {
    useNotesStore.getState().importQuickNotes([
      { id: 'q1', content: 'x', createdAt: '', updatedAt: '' } as unknown as QuickNoteData,
    ])

    expect(useNotesStore.getState().quickNotes[0].tags).toEqual([])
  })
})
