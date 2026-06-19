import { describe, it, expect, beforeEach } from 'vitest'
import { useNotesStore } from '@/store'

describe('notesStore', () => {
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
  })

  it('should create a new notebook', () => {
    const { createNotebook } = useNotesStore.getState()
    createNotebook('Test Notebook')
    
    const state = useNotesStore.getState()
    expect(state.notebooks).toHaveLength(1)
    expect(state.notebooks[0].title).toBe('Test Notebook')
  })

  it('should update notebook title', () => {
    const { createNotebook, updateNotebookTitle } = useNotesStore.getState()
    createNotebook('Test Notebook')
    
    const notebookId = useNotesStore.getState().notebooks[0].id
    updateNotebookTitle(notebookId, 'Updated Title')
    
    const state = useNotesStore.getState()
    expect(state.notebooks[0].title).toBe('Updated Title')
  })

  it('should create a new document', () => {
    const { createNotebook, createDoc } = useNotesStore.getState()
    createNotebook('Test Notebook')
    
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Test Doc' })
    
    const state = useNotesStore.getState()
    expect(state.notebooks[0].docs).toHaveLength(1)
    expect(state.notebooks[0].docs[0].title).toBe('Test Doc')
  })

  it('should toggle favorite status', () => {
    const { createNotebook, createDoc, toggleFavorite } = useNotesStore.getState()
    createNotebook('Test Notebook')
    
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Test Doc' })
    
    const docId = useNotesStore.getState().notebooks[0].docs[0].id
    toggleFavorite(notebookId, docId)
    
    const state = useNotesStore.getState()
    expect(state.notebooks[0].docs[0].favorite).toBe(true)
  })

  it('should create and manage tags', () => {
    const { createTag, updateTag, deleteTag } = useNotesStore.getState()
    
    createTag('Test Tag', '#FF6B6B', '🏷️')
    const state1 = useNotesStore.getState()
    expect(state1.tags).toHaveLength(1)
    expect(state1.tags[0].name).toBe('Test Tag')
    
    const tagId = state1.tags[0].id
    updateTag(tagId, { name: 'Updated Tag' })
    const state2 = useNotesStore.getState()
    expect(state2.tags[0].name).toBe('Updated Tag')
    
    deleteTag(tagId)
    const state3 = useNotesStore.getState()
    expect(state3.tags).toHaveLength(0)
  })

  it('should search documents', () => {
    const { createNotebook, createDoc, search } = useNotesStore.getState()
    createNotebook('Test Notebook')
    
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Hello World', content: 'This is a test document' })
    
    const results = search('Hello')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Hello World')
  })
})