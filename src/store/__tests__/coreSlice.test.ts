import { describe, it, expect, beforeEach } from 'vitest'
import { useNotesStore, selectActiveDoc } from '@/store'
import type { NoteDoc } from '@/types'

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

  it('移动父文档时子文档连同整棵子树一起过去（P0-3，旧实现会把子文档留在原库）', () => {
    const { createNotebook, createDoc, moveDocToNotebook } = useNotesStore.getState()
    createNotebook('Source')
    createNotebook('Target')

    const state1 = useNotesStore.getState()
    const sourceId = state1.notebooks[0].id
    const targetId = state1.notebooks[1].id

    createDoc(sourceId, null, { title: 'Parent Doc' })
    const parentId = useNotesStore.getState().notebooks[0].docs[0].id
    createDoc(sourceId, parentId, { title: 'Child Doc' })
    const childId = useNotesStore.getState().notebooks[0].docs[1].id
    createDoc(sourceId, childId, { title: 'Grandchild Doc' })

    moveDocToNotebook(sourceId, parentId, targetId)

    const state2 = useNotesStore.getState()
    // 原知识库被搬空，目标知识库里父子孙三级齐全且层级保持
    expect(state2.notebooks[0].docs).toHaveLength(0)
    expect(state2.notebooks[1].docs).toHaveLength(3)
    const parent = state2.notebooks[1].docs.find(d => d.id === parentId)
    const child = state2.notebooks[1].docs.find(d => d.id === childId)
    const grandchild = state2.notebooks[1].docs.find(d => d.title === 'Grandchild Doc')
    expect(parent?.parentId).toBeNull()
    expect(child?.parentId).toBe(parentId)
    expect(grandchild?.parentId).toBe(childId)
  })

  it('父子同选时对已随父移动的子文档再次调用是安全的 no-op', () => {
    const { createNotebook, createDoc, moveDocToNotebook } = useNotesStore.getState()
    createNotebook('Source')
    createNotebook('Target')

    const state1 = useNotesStore.getState()
    const sourceId = state1.notebooks[0].id
    const targetId = state1.notebooks[1].id

    createDoc(sourceId, null, { title: 'Parent Doc' })
    const parentId = useNotesStore.getState().notebooks[0].docs[0].id
    createDoc(sourceId, parentId, { title: 'Child Doc' })
    const childId = useNotesStore.getState().notebooks[0].docs[1].id

    // 模拟批量移动里的"父子同选"：父先搬、子后搬
    moveDocToNotebook(sourceId, parentId, targetId)
    moveDocToNotebook(sourceId, childId, targetId)

    const state2 = useNotesStore.getState()
    expect(state2.notebooks[0].docs).toHaveLength(0)
    expect(state2.notebooks[1].docs).toHaveLength(2)
    expect(state2.notebooks[1].docs.find(d => d.id === childId)?.parentId).toBe(parentId)
  })

  it('打开中的标签跟随文档换库，不被 pruneOpenTabs 清掉', () => {
    const { createNotebook, createDoc, moveDocToNotebook, openTab } = useNotesStore.getState()
    createNotebook('Source')
    createNotebook('Target')

    const state1 = useNotesStore.getState()
    const sourceId = state1.notebooks[0].id
    const targetId = state1.notebooks[1].id

    createDoc(sourceId, null, { title: 'Doc' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id

    // pruneOpenTabs 的闸门：lastSavedAt 非 null 才代表数据已加载完成
    // openTabs 不在本 describe 的 beforeEach 里复位（setActiveDocId 会顺手开标签），这里显式清空
    useNotesStore.setState({ openTabs: [], lastSavedAt: new Date().toISOString(), loadFailed: false })
    openTab(sourceId, docId)
    expect(useNotesStore.getState().openTabs).toHaveLength(1)

    moveDocToNotebook(sourceId, docId, targetId)

    expect(useNotesStore.getState().openTabs).toEqual([{ notebookId: targetId, docId }])
  })

  it('同知识库内的"移动"直接返回，不重排子树', () => {
    const { createNotebook, createDoc, moveDocToNotebook } = useNotesStore.getState()
    createNotebook('Only')
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Doc' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id
    const before = useNotesStore.getState().notebooks[0].docs

    moveDocToNotebook(notebookId, docId, notebookId)

    expect(useNotesStore.getState().notebooks[0].docs).toBe(before)
  })
})

describe('coreSlice - updateDoc parentId 环防御（P2-3 单趟 id→parentId 索引）', () => {
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

  /** 造一条 A(根) → B(A 的子) → C(B 的子) 的链，返回 [nbId, aId, bId, cId] */
  function buildChain(): [string, string, string, string] {
    const { createNotebook, createDoc } = useNotesStore.getState()
    createNotebook('NB')
    const nbId = useNotesStore.getState().notebooks[0].id
    const aId = createDoc(nbId, null, { title: 'A' })!
    const bId = createDoc(nbId, aId, { title: 'B' })!
    const cId = createDoc(nbId, bId, { title: 'C' })!
    return [nbId, aId, bId, cId]
  }

  const docById = (nbId: string, docId: string): NoteDoc =>
    useNotesStore.getState().notebooks.find(nb => nb.id === nbId)!.docs.find(d => d.id === docId)!

  it('把父级改成自己的后代时退回 null（否则文档树渲染无限递归）', () => {
    const [nbId, aId, , cId] = buildChain()
    useNotesStore.getState().updateDoc(nbId, aId, { parentId: cId })
    expect(docById(nbId, aId).parentId).toBeNull()
  })

  it('父级填成自己时退回 null', () => {
    const [nbId, , bId] = buildChain()
    useNotesStore.getState().updateDoc(nbId, bId, { parentId: bId })
    expect(docById(nbId, bId).parentId).toBeNull()
  })

  it('挂到合法父级上时原样保留（不是环就别动）', () => {
    const [nbId, , bId, cId] = buildChain()
    const aId = docById(nbId, bId).parentId! // B 的父 = A
    // C 从 B 改挂到 A：A → null，祖先链上没有 C → 不是环，保持 A
    useNotesStore.getState().updateDoc(nbId, cId, { parentId: aId })
    expect(docById(nbId, cId).parentId).toBe(aId)
  })

  it('跨知识库的 parentId 取不到父文档 → 视作无父，不误判成环（保持原值）', () => {
    const [nbId, , bId] = buildChain()
    useNotesStore.getState().updateDoc(nbId, bId, { parentId: 'other-notebook-doc' })
    expect(docById(nbId, bId).parentId).toBe('other-notebook-doc')
  })

  it('数据里已存在脏环时沿祖先链上溯不会死循环，且不误改目标字段', () => {
    const [nbId, aId, bId, cId] = buildChain()
    // 直接注入 A↔B 的脏环（模拟旧数据 / 导入的坏数据）
    useNotesStore.setState((s) => ({
      notebooks: s.notebooks.map(nb => nb.id !== nbId ? nb : {
        ...nb,
        docs: nb.docs.map(d =>
          d.id === aId ? { ...d, parentId: bId }
          : d.id === bId ? { ...d, parentId: aId }
          : d),
      }),
    }))

    // 上溯 A→B→A 由 seen 集合截断：C 不在环上 → parentId 保持合法挂载
    useNotesStore.getState().updateDoc(nbId, cId, { parentId: aId })
    expect(docById(nbId, cId).parentId).toBe(aId)
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

describe('coreSlice - data safety (trash restore / load-failed guard)', () => {
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
      loadFailed: false,
    })
  })

  it('restores doc to an existing notebook after its source notebook was deleted (no data loss)', () => {
    const { createNotebook, createDoc, deleteNotebook, restoreFromTrash } = useNotesStore.getState()
    createNotebook('Notebook A')
    createNotebook('Notebook B')
    const state1 = useNotesStore.getState()
    const notebookAId = state1.notebooks[0].id
    const notebookBId = state1.notebooks[1].id

    createDoc(notebookAId, null, { title: 'Doc in A' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id

    // 删除整个知识库 A → 文档进入回收站，notebookId 指向已不存在的知识库
    deleteNotebook(notebookAId)
    expect(useNotesStore.getState().trash).toHaveLength(1)

    restoreFromTrash(docId)

    const state2 = useNotesStore.getState()
    // 文档必须真实存在于某个知识库中，绝不能从 trash 移除后丢弃
    expect(state2.trash).toHaveLength(0)
    const allDocs = state2.notebooks.flatMap(nb => nb.docs)
    expect(allDocs.some(d => d.id === docId)).toBe(true)
    expect(state2.notebooks.find(nb => nb.id === notebookBId)!.docs.some(d => d.id === docId)).toBe(true)
    expect(state2.activeDocId).toBe(docId)
  })

  it('creates a recovery notebook when restoring with no notebooks left', () => {
    const { createNotebook, createDoc, deleteNotebook, restoreFromTrash } = useNotesStore.getState()
    createNotebook('Only Notebook')
    const notebookId = useNotesStore.getState().notebooks[0].id
    createDoc(notebookId, null, { title: 'Last Doc' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id

    deleteNotebook(notebookId)
    restoreFromTrash(docId)

    const state = useNotesStore.getState()
    expect(state.notebooks).toHaveLength(1)
    expect(state.notebooks[0].docs.some(d => d.id === docId)).toBe(true)
  })

  it('derives null activeDoc after deleting the active notebook', () => {
    const { createNotebook, createDoc, setActiveNotebookId, setActiveDocId, deleteNotebook } = useNotesStore.getState()
    createNotebook('A')
    createNotebook('B')
    const state1 = useNotesStore.getState()
    const idA = state1.notebooks[0].id
    const idB = state1.notebooks[1].id

    createDoc(idA, null, { title: 'Doc in A' })
    const docId = useNotesStore.getState().notebooks[0].docs[0].id
    setActiveNotebookId(idA)
    setActiveDocId(docId)
    expect(selectActiveDoc(useNotesStore.getState())?.id).toBe(docId)

    deleteNotebook(idA)

    const state2 = useNotesStore.getState()
    // 幽灵文档会导致后续输入被静默丢弃：activeDoc 是派生值，
    // 删库后 activeDocId 被清空，派生结果必然为 null（不存在"忘了重算"的可能）
    expect(selectActiveDoc(state2)).toBeNull()
    expect(state2.activeNotebookId).toBe(idB)
  })

  it('blocks saveNotes when data failed to load', async () => {
    useNotesStore.setState({ loadFailed: true, saveStatus: 'error' })
    await useNotesStore.getState().saveNotes()
    // 守卫生效：不应进入 saving/saved 流程，避免空状态覆盖磁盘数据
    expect(useNotesStore.getState().saveStatus).toBe('error')
  })

  it('restoreVersion backs up current content before overwriting', () => {
    useNotesStore.setState({
      notebooks: [{
        id: 'nb1',
        title: 'NB',
        docs: [{
          id: 'doc1',
          title: 'Doc',
          content: 'current content',
          parentId: null,
          tags: [],
          favorite: false,
          pinned: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          versions: [{
            id: 'v1',
            docId: 'doc1',
            notebookId: 'nb1',
            title: 'Doc',
            content: 'old content',
            tags: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            type: 'auto',
          }],
        }],
      }],
      trash: [],
      tags: [],
      searchHistory: [],
      activeNotebookId: 'nb1',
      activeDocId: 'doc1',
      searchText: '',
      saveStatus: 'idle',
      lastSavedAt: null,
      loadFailed: false,
    })

    useNotesStore.getState().restoreVersion('nb1', 'doc1', 'v1')

    const doc = useNotesStore.getState().notebooks[0].docs[0]
    expect(doc.content).toBe('old content')
    // 恢复前备份必须存在，且内容是恢复前的当前内容
    const backup = doc.versions!.find(v => v.content === 'current content')
    expect(backup).toBeTruthy()
    expect(backup!.type).toBe('manual')
  })
})
