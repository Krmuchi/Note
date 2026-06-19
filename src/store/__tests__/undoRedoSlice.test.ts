import { describe, it, expect, beforeEach } from 'vitest'
import { useNotesStore } from '@/store'

describe('undoRedoSlice', () => {
  beforeEach(() => {
    useNotesStore.setState({
      notebooks: [],
      trash: [],
      tags: [],
      searchHistory: [],
      history: {},
      activeNotebookId: '',
      activeDocId: '',
      searchText: '',
      saveStatus: 'idle',
      lastSavedAt: null,
    })
  })

  it('should push an undo snapshot for a doc', () => {
    const { pushUndoSnapshot } = useNotesStore.getState()
    pushUndoSnapshot('doc-1', { title: 't', content: 'c', tags: [] }, 200)

    const history = useNotesStore.getState().history['doc-1']
    expect(history).toBeDefined()
    expect(history!.past).toHaveLength(1)
    expect(history!.past[0].content).toBe('c')
    expect(history!.future).toHaveLength(0)
  })

  it('should pop an undo snapshot and clear future stack on push', () => {
    const { pushUndoSnapshot, popUndoSnapshot } = useNotesStore.getState()
    pushUndoSnapshot('doc-1', { title: 't1', content: 'c1', tags: [] }, 200)
    pushUndoSnapshot('doc-1', { title: 't2', content: 'c2', tags: [] }, 200)

    const snapshot = popUndoSnapshot('doc-1')
    expect(snapshot).not.toBeNull()
    expect(snapshot!.content).toBe('c2')
    expect(useNotesStore.getState().history['doc-1']!.past).toHaveLength(1)
  })

  it('should return null when no undo snapshot exists', () => {
    const { popUndoSnapshot } = useNotesStore.getState()
    expect(popUndoSnapshot('missing-doc')).toBeNull()
  })

  it('should push and pop redo snapshots', () => {
    const { pushRedoSnapshot, popRedoSnapshot } = useNotesStore.getState()
    pushRedoSnapshot('doc-1', { title: 't', content: 'c', tags: [] })

    const snapshot = popRedoSnapshot('doc-1')
    expect(snapshot).not.toBeNull()
    expect(snapshot!.content).toBe('c')
    expect(useNotesStore.getState().history['doc-1']!.future).toHaveLength(0)
  })

  it('should enforce the history limit', () => {
    const { pushUndoSnapshot } = useNotesStore.getState()
    for (let i = 0; i < 5; i++) {
      pushUndoSnapshot('doc-1', { title: `t${i}`, content: `c${i}`, tags: [] }, 3)
    }
    const past = useNotesStore.getState().history['doc-1']!.past
    expect(past).toHaveLength(3)
    expect(past[0].content).toBe('c2')
    expect(past[2].content).toBe('c4')
  })

  it('should clear history for a doc', () => {
    const { pushUndoSnapshot, clearHistory } = useNotesStore.getState()
    pushUndoSnapshot('doc-1', { title: 't', content: 'c', tags: [] }, 200)

    clearHistory('doc-1')
    expect(useNotesStore.getState().history['doc-1']).toBeUndefined()
  })

  it('should keep histories isolated per doc', () => {
    const { pushUndoSnapshot, popUndoSnapshot } = useNotesStore.getState()
    pushUndoSnapshot('doc-1', { title: 't', content: 'c1', tags: [] }, 200)
    pushUndoSnapshot('doc-2', { title: 't', content: 'c2', tags: [] }, 200)

    const snap1 = popUndoSnapshot('doc-1')
    expect(snap1!.content).toBe('c1')
    expect(useNotesStore.getState().history['doc-2']!.past).toHaveLength(1)
  })
})