import { describe, it, expect, beforeEach } from 'vitest'
import { useNotesStore } from '@/store'
import type { NoteDoc, Notebook } from '@/types'

function makeVersion(id: string, type: 'auto' | 'manual') {
  return {
    id,
    docId: 'doc-1',
    notebookId: 'nb-1',
    title: 't',
    content: 'c',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type,
  }
}

function makeDoc(): NoteDoc {
  return {
    id: 'doc-1',
    title: 'doc',
    content: 'hello',
    parentId: null,
    tags: [],
    favorite: false,
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    versions: [],
    comments: [],
    shareLinks: [],
  } as NoteDoc
}

describe('回收站条目瘦身（版本快照只留 1 份）', () => {
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
      openTabs: [],
      loadFailed: false,
    })
  })

  it('移入回收站时版本快照被裁到 1 份（正文与评论保留）', () => {
    const doc = makeDoc()
    doc.versions = [makeVersion('v1', 'auto'), makeVersion('v2', 'auto'), makeVersion('v3', 'manual')]
    useNotesStore.setState({ notebooks: [{ id: 'nb-1', title: 'nb', docs: [doc] } as Notebook], activeNotebookId: 'nb-1' })

    useNotesStore.getState().moveDocToTrash('nb-1', 'doc-1')
    const trashed = useNotesStore.getState().trash[0]
    expect(trashed).toBeDefined()
    expect(trashed.versions).toHaveLength(1)
    // 优先保留手动版本
    expect(trashed.versions![0].type).toBe('manual')
    // 正文保留（误删恢复靠它）
    expect(trashed.content).toBe('hello')
  })

  it('删除整个知识库时其下文档同样瘦身', () => {
    const doc1 = makeDoc()
    doc1.versions = [makeVersion('a', 'auto'), makeVersion('b', 'auto')]
    const doc2 = makeDoc()
    doc2.id = 'doc-2'
    doc2.versions = [makeVersion('c', 'auto'), makeVersion('d', 'auto')]
    useNotesStore.setState({ notebooks: [{ id: 'nb-1', title: 'nb', docs: [doc1, doc2] } as Notebook], activeNotebookId: 'nb-1' })

    useNotesStore.getState().deleteNotebook('nb-1')
    const trash = useNotesStore.getState().trash
    expect(trash).toHaveLength(2)
    for (const item of trash) {
      expect(item.versions!.length).toBe(1)
    }
  })

  it('只有 1 份快照的文档不动（没有可裁的）', () => {
    const doc = makeDoc()
    doc.versions = [makeVersion('only', 'auto')]
    useNotesStore.setState({ notebooks: [{ id: 'nb-1', title: 'nb', docs: [doc] } as Notebook], activeNotebookId: 'nb-1' })

    useNotesStore.getState().moveDocToTrash('nb-1', 'doc-1')
    expect(useNotesStore.getState().trash[0].versions).toHaveLength(1)
    expect(useNotesStore.getState().trash[0].versions![0].id).toBe('only')
  })
})