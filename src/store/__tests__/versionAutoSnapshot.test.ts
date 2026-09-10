import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useNotesStore } from '@/store'

describe('coreSlice - auto version snapshot (updateDoc)', () => {
  beforeEach(() => {
    useNotesStore.setState({
      notebooks: [],
      trash: [],
      tags: [],
      searchHistory: [],
      activeNotebookId: '',
      activeDocId: '',
      searchText: '',
      saveStatus: 'idle',
      lastSavedAt: null,
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const setupDoc = (): { notebookId: string; docId: string } => {
    const { createNotebook, createDoc } = useNotesStore.getState()
    createNotebook('Test Notebook')
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Doc', content: 'v1' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id
    return { notebookId, docId }
  }

  it('creates an auto version on content update', () => {
    const { notebookId, docId } = setupDoc()
    useNotesStore.getState().updateDoc(notebookId, docId, { content: 'v2' })

    const doc = useNotesStore.getState().notebooks[0].docs[0]
    expect(doc.versions).toHaveLength(1)
    expect(doc.versions![0].type).toBe('auto')
    expect(doc.versions![0].content).toBe('v2')
  })

  it('merges updates within the 30s window (no duplicate versions)', () => {
    const { notebookId, docId } = setupDoc()

    useNotesStore.getState().updateDoc(notebookId, docId, { content: 'v2' })
    vi.advanceTimersByTime(5_000)
    useNotesStore.getState().updateDoc(notebookId, docId, { content: 'v3' })
    vi.advanceTimersByTime(5_000)
    useNotesStore.getState().updateDoc(notebookId, docId, { content: 'v4' })

    const doc = useNotesStore.getState().notebooks[0].docs[0]
    expect(doc.versions).toHaveLength(1)
    // 合并窗口内版本停留在首次创建的快照，最新内容不产生新版本
    expect(doc.versions![0].content).toBe('v2')
  })

  it('creates a new version after the 30s window expires', () => {
    const { notebookId, docId } = setupDoc()

    useNotesStore.getState().updateDoc(notebookId, docId, { content: 'v2' })
    vi.advanceTimersByTime(31_000)
    useNotesStore.getState().updateDoc(notebookId, docId, { content: 'v3' })

    const doc = useNotesStore.getState().notebooks[0].docs[0]
    expect(doc.versions).toHaveLength(2)
    expect(doc.versions![0].content).toBe('v3')
  })

  it('caps versions at 50', () => {
    const { notebookId, docId } = setupDoc()

    for (let i = 0; i < 60; i++) {
      useNotesStore.getState().updateDoc(notebookId, docId, { content: `v${i}` })
      vi.advanceTimersByTime(31_000)
    }

    const doc = useNotesStore.getState().notebooks[0].docs[0]
    expect(doc.versions!.length).toBeLessThanOrEqual(50)
  })

  it('does not snapshot on favorite/pinned changes', () => {
    const { notebookId, docId } = setupDoc()
    useNotesStore.getState().updateDoc(notebookId, docId, { favorite: true })
    useNotesStore.getState().updateDoc(notebookId, docId, { pinned: true })

    const doc = useNotesStore.getState().notebooks[0].docs[0]
    expect(doc.versions || []).toHaveLength(0)
    expect(doc.favorite).toBe(true)
    expect(doc.pinned).toBe(true)
  })
})

describe('versionSlice - saveManualVersion (手动保存版本)', () => {
  beforeEach(() => {
    useNotesStore.setState({
      notebooks: [],
      trash: [],
      tags: [],
      searchHistory: [],
      activeNotebookId: '',
      activeDocId: '',
      searchText: '',
      saveStatus: 'idle',
      lastSavedAt: null,
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const setupDoc = (): { notebookId: string; docId: string } => {
    const { createNotebook, createDoc } = useNotesStore.getState()
    createNotebook('Test Notebook')
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Doc', content: 'v1' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id
    return { notebookId, docId }
  }

  it('pushes a manual version with current content and default tag', () => {
    const { notebookId, docId } = setupDoc()
    useNotesStore.getState().updateDoc(notebookId, docId, { content: 'v2' })
    useNotesStore.getState().saveManualVersion(notebookId, docId)

    const doc = useNotesStore.getState().notebooks[0].docs[0]
    expect(doc.versions![0].type).toBe('manual')
    expect(doc.versions![0].content).toBe('v2')
    expect(doc.versions![0].versionTag).toBe('手动快照')
    // 手动保存不修改内容（content 保持 v2）
    expect(doc.content).toBe('v2')
  })

  it('accepts a custom version tag', () => {
    const { notebookId, docId } = setupDoc()
    useNotesStore.getState().saveManualVersion(notebookId, docId, '里程碑')

    const doc = useNotesStore.getState().notebooks[0].docs[0]
    expect(doc.versions![0].versionTag).toBe('里程碑')
  })

  it('keeps manual versions independent of the auto 30s merge window', () => {
    const { notebookId, docId } = setupDoc()
    // 手动保存两次：即使时间紧邻也不被 30s 合并
    useNotesStore.getState().saveManualVersion(notebookId, docId, 'A')
    vi.advanceTimersByTime(1_000)
    useNotesStore.getState().saveManualVersion(notebookId, docId, 'B')

    const doc = useNotesStore.getState().notebooks[0].docs[0]
    expect(doc.versions).toHaveLength(2)
    expect(doc.versions![0].versionTag).toBe('B')
    expect(doc.versions![1].versionTag).toBe('A')
  })

  it('respects the 5-version cap for large documents', () => {
    const { notebookId, docId } = setupDoc()
    useNotesStore.getState().updateDoc(notebookId, docId, { content: 'x'.repeat(100_001) })

    for (let i = 0; i < 8; i++) {
      useNotesStore.getState().saveManualVersion(notebookId, docId, `v${i}`)
    }

    const doc = useNotesStore.getState().notebooks[0].docs[0]
    expect(doc.versions!.length).toBeLessThanOrEqual(5)
  })
})
