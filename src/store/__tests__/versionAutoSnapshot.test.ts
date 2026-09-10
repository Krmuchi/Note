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
