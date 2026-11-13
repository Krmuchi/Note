import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useNotesStore } from '@/store'
import * as storage from '@/services/storage'
import type { AppStore, QuickNoteData } from '@/types'

/**
 * 小记（便签）的持久化数据安全回归。
 *
 * 旧实现有三条真实的数据丢失路径，这里逐条锁死：
 * 1. 启动合并顺序：loadNotes 先把磁盘小记并进**空的**内存态再落盘，
 *    只存在于 localStorage 的较新小记（写完小记没编辑文档就关应用/崩溃）被磁盘旧副本冲掉。
 *    修复：先 loadQuickNotes() 读本机，再 importQuickNotes() 并磁盘，保留较新 updatedAt。
 * 2. 面板重挂载覆盖：loadQuickNotes 直接 `state.quickNotes = notes` 覆盖内存，
 *    800ms 防抖窗口内切走再切回，最后一次编辑消失。修复：改为立即落盘 + 合并语义。
 * 3. 删除复活：本机删掉的小记没有墓碑，启动/恢复备份时被磁盘旧副本"复活"。
 *    修复：删除写墓碑，importQuickNotes / loadQuickNotes 跳过墓碑 id。
 */

const QUICK_NOTES_KEY = 'notes-quick-notes'
const QUICK_NOTES_DELETED_KEY = 'notes-quick-notes-deleted'

const note = (over: Partial<QuickNoteData> & { id: string }): QuickNoteData => ({
  content: '内容',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

/** 构造一份最小可用的磁盘数据（loadNotes 会逐字段归一化） */
function diskPayload(quickNotes: QuickNoteData[]): AppStore {
  return {
    notebooks: [],
    trash: [],
    tags: [],
    searchHistory: [],
    quickNotes,
  } as AppStore
}

function readLocal(): QuickNoteData[] {
  return JSON.parse(localStorage.getItem(QUICK_NOTES_KEY) ?? '[]') as QuickNoteData[]
}

beforeEach(() => {
  localStorage.clear()
  useNotesStore.setState({
    notebooks: [],
    trash: [],
    tags: [],
    searchHistory: [],
    quickNotes: [],
    quickNoteTombstones: {},
    loadFailed: false,
    loadError: null,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('小记立即落盘（无防抖窗口）', () => {
  it('addQuickNote 后 localStorage 立即可读，无需等待', () => {
    useNotesStore.getState().addQuickNote('马上记下来')
    expect(readLocal().map(n => n.content)).toContain('马上记下来')
  })

  it('updateQuickNote / deleteQuickNote 同样立即落盘', () => {
    const st = useNotesStore.getState()
    st.addQuickNote('原文')
    const id = useNotesStore.getState().quickNotes[0].id

    useNotesStore.getState().updateQuickNote(id, '改后')
    expect(readLocal().find(n => n.id === id)?.content).toBe('改后')

    useNotesStore.getState().deleteQuickNote(id)
    expect(readLocal().find(n => n.id === id)).toBeUndefined()
    const tombstones = JSON.parse(localStorage.getItem(QUICK_NOTES_DELETED_KEY) ?? '{}') as Record<string, string>
    expect(tombstones[id]).toBeTruthy()
  })

  it('小记变更会触发自动保存信号（lastMutationAt），随全量保存进入备份副本', () => {
    useNotesStore.setState({ lastMutationAt: 0 })
    useNotesStore.getState().addQuickNote('x')
    expect(useNotesStore.getState().lastMutationAt).toBeGreaterThan(0)
  })
})

describe('启动合并：本机较新的小记不被磁盘旧副本冲掉', () => {
  it('localStorage 较新 + 磁盘较旧 → 保留本机内容，且落盘后仍是本机内容', async () => {
    localStorage.setItem(
      QUICK_NOTES_KEY,
      JSON.stringify([note({ id: 'q1', content: '本机较新', updatedAt: '2026-06-01T00:00:00.000Z' })]),
    )
    vi.spyOn(storage, 'loadAppStore').mockResolvedValue({
      ok: true,
      data: diskPayload([note({ id: 'q1', content: '磁盘较旧', updatedAt: '2026-01-01T00:00:00.000Z' })]),
    })

    await useNotesStore.getState().loadNotes()

    const notes = useNotesStore.getState().quickNotes
    expect(notes).toHaveLength(1)
    expect(notes[0].content).toBe('本机较新')
    // 关键：合并结果必须回写 localStorage，旧实现这一步会用磁盘旧数据覆盖
    expect(readLocal()[0].content).toBe('本机较新')
  })

  it('磁盘较新（来自别的机器的备份）→ 以磁盘为准', async () => {
    localStorage.setItem(
      QUICK_NOTES_KEY,
      JSON.stringify([note({ id: 'q1', content: '本机较旧', updatedAt: '2026-01-01T00:00:00.000Z' })]),
    )
    vi.spyOn(storage, 'loadAppStore').mockResolvedValue({
      ok: true,
      data: diskPayload([note({ id: 'q1', content: '磁盘较新', updatedAt: '2026-06-01T00:00:00.000Z' })]),
    })

    await useNotesStore.getState().loadNotes()

    expect(useNotesStore.getState().quickNotes[0].content).toBe('磁盘较新')
  })

  it('本机独有的小记（磁盘没有）在启动后仍然保留', async () => {
    localStorage.setItem(
      QUICK_NOTES_KEY,
      JSON.stringify([note({ id: 'local-only', content: '只在本机' })]),
    )
    vi.spyOn(storage, 'loadAppStore').mockResolvedValue({ ok: true, data: diskPayload([]) })

    await useNotesStore.getState().loadNotes()

    expect(useNotesStore.getState().quickNotes.map(n => n.id)).toContain('local-only')
    expect(readLocal().map(n => n.id)).toContain('local-only')
  })
})

describe('loadQuickNotes 合并而非覆盖（面板重挂载不丢编辑）', () => {
  it('内存里较新的一份不被 localStorage 旧数据覆盖', () => {
    useNotesStore.setState({
      quickNotes: [note({ id: 'q1', content: '内存较新', updatedAt: '2026-06-01T00:00:00.000Z' })],
    })
    localStorage.setItem(
      QUICK_NOTES_KEY,
      JSON.stringify([note({ id: 'q1', content: '存储较旧', updatedAt: '2026-01-01T00:00:00.000Z' })]),
    )

    useNotesStore.getState().loadQuickNotes()

    expect(useNotesStore.getState().quickNotes[0].content).toBe('内存较新')
  })

  it('localStorage 损坏（非数组）不崩、不清空内存', () => {
    useNotesStore.setState({ quickNotes: [note({ id: 'q1' })] })
    localStorage.setItem(QUICK_NOTES_KEY, '{"broken":true}')

    useNotesStore.getState().loadQuickNotes()

    expect(useNotesStore.getState().quickNotes).toHaveLength(1)
  })
})

describe('删除墓碑：已删小记不被旧副本复活', () => {
  it('本机删除后，启动时磁盘里的同 id 旧副本不复活', async () => {
    const st = useNotesStore.getState()
    st.addQuickNote('删掉我')
    const id = useNotesStore.getState().quickNotes[0].id
    useNotesStore.getState().deleteQuickNote(id)

    vi.spyOn(storage, 'loadAppStore').mockResolvedValue({
      ok: true,
      data: diskPayload([note({ id, content: '删掉我', updatedAt: '2026-09-01T00:00:00.000Z' })]),
    })

    await useNotesStore.getState().loadNotes()

    expect(useNotesStore.getState().quickNotes.find(n => n.id === id)).toBeUndefined()
  })

  it('importQuickNotes（备份恢复）同样跳过墓碑', () => {
    const st = useNotesStore.getState()
    st.addQuickNote('删掉我')
    const id = useNotesStore.getState().quickNotes[0].id
    useNotesStore.getState().deleteQuickNote(id)

    useNotesStore.getState().importQuickNotes([note({ id, content: '备份里的旧副本' })])

    expect(useNotesStore.getState().quickNotes.find(n => n.id === id)).toBeUndefined()
  })

  it('loadQuickNotes 跳过墓碑 id（localStorage 里残留的已删项不回来）', () => {
    const st = useNotesStore.getState()
    st.addQuickNote('删掉我')
    const id = useNotesStore.getState().quickNotes[0].id
    useNotesStore.getState().deleteQuickNote(id)

    // 模拟另一条路径把已删项又写回了 localStorage 主键
    localStorage.setItem(QUICK_NOTES_KEY, JSON.stringify([note({ id, content: '残留' })]))
    useNotesStore.getState().loadQuickNotes()

    expect(useNotesStore.getState().quickNotes.find(n => n.id === id)).toBeUndefined()
  })
})