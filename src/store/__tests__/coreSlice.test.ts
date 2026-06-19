import { describe, it, expect, beforeEach } from 'vitest'
import { useNotesStore } from '@/store'

describe('coreSlice - comment operations', () => {
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

  it('should add a comment to a document', () => {
    const { createNotebook, createDoc, addComment } = useNotesStore.getState()
    createNotebook('Test Notebook')
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Test Doc' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id

    addComment(notebookId, docId, 'This is a test comment')

    const state = useNotesStore.getState()
    expect(state.notebooks[0].docs[0].comments).toHaveLength(1)
    expect(state.notebooks[0].docs[0].comments![0].content).toBe('This is a test comment')
    expect(state.notebooks[0].docs[0].comments![0].author).toBe('我')
    expect(state.notebooks[0].docs[0].comments![0].docId).toBe(docId)
  })

  it('should add multiple comments to a document', () => {
    const { createNotebook, createDoc, addComment } = useNotesStore.getState()
    createNotebook('Test Notebook')
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Test Doc' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id

    addComment(notebookId, docId, 'First comment')
    addComment(notebookId, docId, 'Second comment')

    const state = useNotesStore.getState()
    expect(state.notebooks[0].docs[0].comments).toHaveLength(2)
    expect(state.notebooks[0].docs[0].comments![0].content).toBe('First comment')
    expect(state.notebooks[0].docs[0].comments![1].content).toBe('Second comment')
  })

  it('should delete a comment from a document', () => {
    const { createNotebook, createDoc, addComment, deleteComment } = useNotesStore.getState()
    createNotebook('Test Notebook')
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Test Doc' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id

    addComment(notebookId, docId, 'Comment to delete')
    const commentId = useNotesStore.getState().notebooks[0].docs[0].comments![0].id

    deleteComment(notebookId, docId, commentId)

    const state = useNotesStore.getState()
    expect(state.notebooks[0].docs[0].comments).toHaveLength(0)
  })

  it('should only delete the specified comment', () => {
    const { createNotebook, createDoc, addComment, deleteComment } = useNotesStore.getState()
    createNotebook('Test Notebook')
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Test Doc' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id

    addComment(notebookId, docId, 'Keep this')
    addComment(notebookId, docId, 'Delete this')

    const state1 = useNotesStore.getState()
    const commentIdToDelete = state1.notebooks[0].docs[0].comments![1].id

    deleteComment(notebookId, docId, commentIdToDelete)

    const state2 = useNotesStore.getState()
    expect(state2.notebooks[0].docs[0].comments).toHaveLength(1)
    expect(state2.notebooks[0].docs[0].comments![0].content).toBe('Keep this')
  })

  it('should not affect other documents when deleting a comment', () => {
    const { createNotebook, createDoc, addComment, deleteComment } = useNotesStore.getState()
    createNotebook('Test Notebook')
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Doc 1' })
    createDoc(notebookId, null, { title: 'Doc 2' })
    const doc1Id = useNotesStore.getState().notebooks[0].docs[0].id
    const doc2Id = useNotesStore.getState().notebooks[0].docs[1].id

    addComment(notebookId, doc1Id, 'Doc1 comment')
    addComment(notebookId, doc2Id, 'Doc2 comment')

    const commentId = useNotesStore.getState().notebooks[0].docs[0].comments![0].id
    deleteComment(notebookId, doc1Id, commentId)

    const state = useNotesStore.getState()
    expect(state.notebooks[0].docs[0].comments).toHaveLength(0)
    expect(state.notebooks[0].docs[1].comments).toHaveLength(1)
  })
})

describe('coreSlice - moveDocToNotebook', () => {
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

  it('should move a document to another notebook', () => {
    const { createNotebook, createDoc, moveDocToNotebook } = useNotesStore.getState()
    createNotebook('Source Notebook')
    createNotebook('Target Notebook')

    const state1 = useNotesStore.getState()
    const sourceId = state1.notebooks[0].id
    const targetId = state1.notebooks[1].id

    createDoc(sourceId, null, { title: 'Doc to Move' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id

    moveDocToNotebook(sourceId, docId, targetId)

    const state2 = useNotesStore.getState()
    expect(state2.notebooks[0].docs).toHaveLength(0)
    expect(state2.notebooks[1].docs).toHaveLength(1)
    expect(state2.notebooks[1].docs[0].title).toBe('Doc to Move')
    expect(state2.notebooks[1].docs[0].parentId).toBeNull()
  })

  it('should update activeNotebookId when moving the active document', () => {
    const { createNotebook, createDoc, moveDocToNotebook, setActiveNotebookId, setActiveDocId } = useNotesStore.getState()
    createNotebook('Source')
    createNotebook('Target')

    const state1 = useNotesStore.getState()
    const sourceId = state1.notebooks[0].id
    const targetId = state1.notebooks[1].id

    createDoc(sourceId, null, { title: 'Active Doc' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id

    setActiveNotebookId(sourceId)
    setActiveDocId(docId)

    moveDocToNotebook(sourceId, docId, targetId)

    const state2 = useNotesStore.getState()
    expect(state2.activeNotebookId).toBe(targetId)
  })

  it('should reassign children of moved document to moved doc parent', () => {
    const { createNotebook, createDoc, moveDocToNotebook } = useNotesStore.getState()
    createNotebook('Source')
    createNotebook('Target')

    const state1 = useNotesStore.getState()
    const sourceId = state1.notebooks[0].id
    const targetId = state1.notebooks[1].id

    createDoc(sourceId, null, { title: 'Parent Doc' })
    const parentId = useNotesStore.getState().notebooks[0].docs[0].id
    createDoc(sourceId, parentId, { title: 'Child Doc' })

    moveDocToNotebook(sourceId, parentId, targetId)

    const state2 = useNotesStore.getState()
    expect(state2.notebooks[0].docs).toHaveLength(1)
    expect(state2.notebooks[0].docs[0].parentId).toBeNull()
    expect(state2.notebooks[1].docs).toHaveLength(1)
  })
})

describe('coreSlice - share link operations', () => {
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

  it('should generate a share link', () => {
    const { createNotebook, createDoc, generateShareLink } = useNotesStore.getState()
    createNotebook('Test Notebook')
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Test Doc' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id

    generateShareLink(notebookId, docId, 'view', '', null)

    const state = useNotesStore.getState()
    expect(state.notebooks[0].docs[0].shareLinks).toHaveLength(1)
    expect(state.notebooks[0].docs[0].shareLinks![0].permission).toBe('view')
    expect(state.notebooks[0].docs[0].shareSettings!.enabled).toBe(true)
  })

  it('should delete a share link', () => {
    const { createNotebook, createDoc, generateShareLink, deleteShareLink } = useNotesStore.getState()
    createNotebook('Test Notebook')
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Test Doc' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id

    generateShareLink(notebookId, docId, 'edit', 'pass123', null)
    const linkId = useNotesStore.getState().notebooks[0].docs[0].shareLinks![0].id

    deleteShareLink(notebookId, docId, linkId)

    const state = useNotesStore.getState()
    expect(state.notebooks[0].docs[0].shareLinks).toHaveLength(0)
    expect(state.notebooks[0].docs[0].shareSettings!.enabled).toBe(false)
  })

  it('should generate share link with password and expiration', () => {
    const { createNotebook, createDoc, generateShareLink } = useNotesStore.getState()
    createNotebook('Test Notebook')
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Test Doc' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id

    const expiresAt = new Date(Date.now() + 86400000).toISOString()
    generateShareLink(notebookId, docId, 'manage', 'secret', expiresAt)

    const state = useNotesStore.getState()
    const link = state.notebooks[0].docs[0].shareLinks![0]
    expect(link.password).toBe('secret')
    expect(link.expiresAt).toBe(expiresAt)
    expect(link.permission).toBe('manage')
  })
})