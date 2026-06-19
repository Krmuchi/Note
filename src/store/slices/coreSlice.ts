import type { StateCreator } from 'zustand'
import type { NoteDoc, Notebook, ShareLink, DocVersion, TrashDoc, Comment } from '@/types'
import type { NotesStore } from '@/store/types'
import { newId, generateShareUrl } from '@/store/storeUtils'

const TRASH_RETENTION_DAYS = 30

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface CoreSlice {
  notebooks: Notebook[]
  trash: TrashDoc[]
  saveStatus: SaveStatus
  lastSavedAt: string | null
  activeNotebookId: string
  activeDocId: string
  searchText: string
  loadNotes: () => Promise<void>
  saveNotes: () => Promise<void>
  updateStore: (store: Partial<NotesStore>) => void
  setSaveStatus: (status: SaveStatus) => void
  createNotebook: (title: string) => void
  updateNotebookTitle: (id: string, title: string) => void
  deleteNotebook: (id: string) => void
  createDoc: (notebookId: string, parentId: string | null, docData?: Partial<NoteDoc>) => void
  updateDoc: (notebookId: string, docId: string, updates: Partial<NoteDoc>) => void
  deleteDoc: (notebookId: string, docId: string) => void
  moveDocToTrash: (notebookId: string, docId: string) => void
  moveDocToNotebook: (sourceNotebookId: string, docId: string, targetNotebookId: string) => void
  saveVersion: (notebookId: string, docId: string, type: 'auto' | 'manual' | 'published') => void
  getDocVersions: (notebookId: string, docId: string) => DocVersion[] | undefined
  restoreVersion: (notebookId: string, docId: string, versionId: string) => void
  toggleFavorite: (notebookId: string, docId: string) => void
  restoreFromTrash: (docId: string) => void
  deleteFromTrash: (docId: string) => void
  clearTrash: () => void
  autoCleanTrash: () => void
  generateShareLink: (notebookId: string, docId: string, permission: 'view' | 'comment' | 'edit' | 'manage', password: string, expiresAt: string | null) => void
  deleteShareLink: (notebookId: string, docId: string, linkId: string) => void
  addComment: (notebookId: string, docId: string, content: string) => void
  deleteComment: (notebookId: string, docId: string, commentId: string) => void
  reorderDocs: (notebookId: string, fromIndex: number, toIndex: number, parentId?: string | null) => void
  setActiveNotebookId: (id: string) => void
  setActiveDocId: (id: string) => void
  setSearchText: (text: string) => void
}

type CoreSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  CoreSlice
>

export const createCoreSlice: CoreSliceCreator = (set, get) => ({
  notebooks: [],
  trash: [],
  saveStatus: 'idle',
  lastSavedAt: null,
  activeNotebookId: '',
  activeDocId: '',
  searchText: '',

  setSaveStatus: (status) => set({ saveStatus: status }),

  loadNotes: async () => {
    try {
      const loaded = await window.notesApi.load()
      const normalized = {
        notebooks: loaded.notebooks.map((notebook: Notebook) => ({
          ...notebook,
          docs: notebook.docs.map((doc: NoteDoc) => ({
            ...doc,
            parentId: doc.parentId ?? null,
            tags: doc.tags ?? [],
            favorite: doc.favorite ?? false,
            pinned: doc.pinned ?? false,
            createdAt: doc.createdAt ?? doc.updatedAt ?? new Date().toISOString(),
            shareLinks: doc.shareLinks ?? [],
            shareSettings: doc.shareSettings ?? {
              enabled: false,
              defaultPermission: 'view',
              allowPassword: true,
              allowExpiration: true,
            },
            comments: doc.comments ?? [],
          })),
        })),
        trash: (loaded.trash ?? []).map((doc: Partial<TrashDoc>) => ({
          ...doc,
          parentId: doc.parentId ?? null,
          tags: doc.tags ?? [],
          favorite: doc.favorite ?? false,
          pinned: doc.pinned ?? false,
          notebookId: doc.notebookId ?? "",
          notebookTitle: doc.notebookTitle ?? "未归类知识库",
          originalParentId: doc.originalParentId ?? doc.parentId ?? null,
          deletedAt: doc.deletedAt ?? doc.updatedAt ?? new Date().toISOString(),
        })),
        tags: (loaded.tags ?? []).map((tag: Record<string, unknown>) => ({
          ...tag,
          parentId: tag.parentId ?? null,
          usageCount: tag.usageCount ?? 0,
        })),
        searchHistory: loaded.searchHistory ?? [],
      }

      const now = new Date().toISOString()
      set((state) => {
        Object.assign(state, normalized, { lastSavedAt: now, saveStatus: 'saved' })
      })

      if (normalized.notebooks.length > 0) {
        const savedNotebookId = loaded.activeNotebookId ?? ''
        const savedDocId = loaded.activeDocId ?? ''
        const notebookExists = savedNotebookId && normalized.notebooks.some((nb: Notebook) => nb.id === savedNotebookId)
        const targetNotebook = notebookExists
          ? normalized.notebooks.find((nb: Notebook) => nb.id === savedNotebookId)!
          : normalized.notebooks[0]
        set((state) => {
          state.activeNotebookId = targetNotebook.id
          if (targetNotebook.docs.length > 0) {
            const docExists = savedDocId && targetNotebook.docs.some((d: NoteDoc) => d.id === savedDocId)
            state.activeDocId = docExists ? savedDocId : targetNotebook.docs[0].id
          }
        })
      }
    } catch (error) {
      console.error('Failed to load notes:', error)
    }
  },

  saveNotes: async () => {
    const { notebooks, trash, tags, searchHistory, activeNotebookId, activeDocId } = get()
    set({ saveStatus: 'saving' })
    try {
      await window.notesApi.save({ notebooks, trash, tags, searchHistory, activeNotebookId, activeDocId })
      set({ saveStatus: 'saved', lastSavedAt: new Date().toISOString() })
    } catch (error) {
      console.error('Failed to save notes:', error)
      set({ saveStatus: 'error' })
    }
  },

  updateStore: (store) => set((state) => {
    Object.assign(state, store)
  }),

  createNotebook: (title) => {
    const newNotebook: Notebook = {
      id: newId(),
      title: title || "新建知识库",
      docs: []
    }
    set((state) => {
      state.notebooks.push(newNotebook)
      state.activeNotebookId = newNotebook.id
    })
  },

  updateNotebookTitle: (id, title) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === id)
      if (notebook) notebook.title = title
    })
  },

  deleteNotebook: (id) => {
    set((state) => {
      const target = state.notebooks.find(nb => nb.id === id)
      if (!target) return

      const docsToTrash = target.docs.map(doc => ({
        ...doc,
        parentId: null,
        originalParentId: doc.parentId ?? null,
        updatedAt: new Date().toISOString(),
        deletedAt: new Date().toISOString(),
        notebookId: target.id,
        notebookTitle: target.title,
      }))

      state.notebooks = state.notebooks.filter(nb => nb.id !== id)
      state.trash.push(...docsToTrash)

      if (state.activeNotebookId === id) {
        state.activeNotebookId = state.notebooks[0]?.id || ''
        state.activeDocId = ''
      }
    })
  },

  createDoc: (notebookId, parentId, docData = {}) => {
    const newDoc: NoteDoc = {
      id: newId(),
      title: docData.title || "未命名文档",
      content: docData.content || "",
      parentId: parentId || null,
      tags: docData.tags || [],
      favorite: docData.favorite || false,
      pinned: docData.pinned || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      shareLinks: [],
      shareSettings: {
        enabled: false,
        defaultPermission: 'view',
        allowPassword: true,
        allowExpiration: true,
      },
      ...docData
    }

    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      if (notebook) {
        notebook.docs.push(newDoc)
        state.activeNotebookId = notebookId
        state.activeDocId = newDoc.id
      }
    })
  },

  updateDoc: (notebookId, docId, updates) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (!doc) return

      Object.assign(doc, updates, { updatedAt: new Date().toISOString() })

      if ((updates.content || updates.title || updates.tags) && doc) {
        const versions = doc.versions || []
        const lastAuto = versions.find(v => v.type === 'auto')
        if (lastAuto && Date.now() - new Date(lastAuto.createdAt).getTime() < 30_000) {
          return
        }

        const now = new Date()
        const newVersion: DocVersion = {
          id: newId(),
          docId: doc.id,
          notebookId: notebookId,
          title: updates.title || doc.title,
          content: updates.content || doc.content,
          tags: updates.tags || doc.tags,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          type: 'auto',
        }

        doc.versions = [newVersion, ...(doc.versions || [])].slice(0, 50)
      }
    })
  },

  saveVersion: (notebookId, docId, type) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (!doc) return

      const newVersion: DocVersion = {
        id: newId(),
        docId: doc.id,
        notebookId: notebookId,
        title: doc.title,
        content: doc.content,
        tags: doc.tags,
        createdAt: new Date().toISOString(),
        updatedAt: doc.updatedAt,
        type,
      }

      doc.versions = [newVersion, ...(doc.versions || [])].slice(0, 50)
    })
  },

  getDocVersions: (notebookId, docId) => {
    const notebook = get().notebooks.find(nb => nb.id === notebookId)
    const doc = notebook?.docs.find(d => d.id === docId)
    return doc?.versions
  },

  restoreVersion: (notebookId, docId, versionId) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      const version = doc?.versions?.find(v => v.id === versionId)
      if (!doc || !version) return

      doc.title = version.title
      doc.content = version.content
      doc.tags = version.tags
      doc.updatedAt = new Date().toISOString()
    })
  },

  toggleFavorite: (notebookId, docId) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc) {
        doc.favorite = !doc.favorite
        doc.updatedAt = new Date().toISOString()
      }
    })
  },

  deleteDoc: (notebookId, docId) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      if (notebook) {
        notebook.docs = notebook.docs.filter(doc => doc.id !== docId)
        if (state.activeDocId === docId) {
          state.activeDocId = ''
        }
      }
    })
  },

  moveDocToTrash: (notebookId, docId) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      if (!notebook) return

      const doc = notebook.docs.find(d => d.id === docId)
      if (!doc) return

      notebook.docs = notebook.docs
        .filter(d => d.id !== docId)
        .map(d => d.parentId === docId ? { ...d, parentId: doc.parentId } : d)

      state.trash.push({
        ...doc,
        updatedAt: new Date().toISOString(),
        parentId: null,
        originalParentId: doc.parentId ?? null,
        notebookId: notebookId,
        notebookTitle: notebook.title,
        deletedAt: new Date().toISOString(),
      } as TrashDoc)

      if (state.activeDocId === docId) {
        state.activeDocId = ''
      }
    })
  },

  moveDocToNotebook: (sourceNotebookId, docId, targetNotebookId) => {
    set((state) => {
      const sourceNotebook = state.notebooks.find(nb => nb.id === sourceNotebookId)
      const targetNotebook = state.notebooks.find(nb => nb.id === targetNotebookId)
      if (!sourceNotebook || !targetNotebook) return

      const doc = sourceNotebook.docs.find(d => d.id === docId)
      if (!doc) return

      sourceNotebook.docs = sourceNotebook.docs
        .filter(d => d.id !== docId)
        .map(d => d.parentId === docId ? { ...d, parentId: doc.parentId } : d)

      targetNotebook.docs.push({
        ...doc,
        parentId: null,
        updatedAt: new Date().toISOString(),
      })

      if (state.activeDocId === docId) {
        state.activeNotebookId = targetNotebookId
      }
    })
  },

  restoreFromTrash: (docId) => {
    set((state) => {
      const target = state.trash.find((item) => item.id === docId)
      if (!target) return

      const restoredDoc: NoteDoc = {
        id: target.id,
        title: target.title,
        content: target.content,
        parentId: target.originalParentId,
        tags: target.tags,
        favorite: target.favorite,
        createdAt: target.createdAt ?? target.updatedAt,
        updatedAt: target.updatedAt,
        pinned: false,
        shareLinks: [],
        shareSettings: {
          enabled: false,
          defaultPermission: 'view',
          allowPassword: true,
          allowExpiration: true,
        },
      }

      const targetNotebookId = target.notebookId || state.activeNotebookId
      if (!targetNotebookId) return

      const targetNotebook = state.notebooks.find(nb => nb.id === targetNotebookId)
      if (targetNotebook) {
        targetNotebook.docs.push(restoredDoc)
      }

      state.trash = state.trash.filter((item) => item.id !== docId)
      state.activeNotebookId = targetNotebookId
      state.activeDocId = target.id
    })
  },

  deleteFromTrash: (docId) => {
    set((state) => {
      state.trash = state.trash.filter((item) => item.id !== docId)
    })
  },

  clearTrash: () => {
    set((state) => {
      state.trash = []
    })
  },

  autoCleanTrash: () => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - TRASH_RETENTION_DAYS)
    const cutoffStr = cutoff.toISOString()

    set((state) => {
      const before = state.trash.length
      state.trash = state.trash.filter(item => item.deletedAt > cutoffStr)
      const removed = before - state.trash.length
      if (removed > 0 && import.meta.env.DEV) {
        console.log(`[回收站] 自动清理了 ${removed} 个超过 ${TRASH_RETENTION_DAYS} 天的文档`)
      }
    })
  },

  generateShareLink: (notebookId, docId, permission, password, expiresAt) => {
    const linkId = newId()
    const newLink: ShareLink = {
      id: linkId,
      docId,
      notebookId,
      url: generateShareUrl(docId, linkId),
      permission,
      password: password || null,
      expiresAt,
      createdAt: new Date().toISOString(),
      accessCount: 0,
      lastAccessedAt: null,
    }

    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc) {
        doc.shareLinks = [...(doc.shareLinks || []), newLink]
        doc.shareSettings = {
          ...doc.shareSettings,
          enabled: true,
        } as NoteDoc['shareSettings']
      }
    })
  },

  deleteShareLink: (notebookId, docId, linkId) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc) {
        const updatedLinks = (doc.shareLinks || []).filter(link => link.id !== linkId)
        doc.shareLinks = updatedLinks
        doc.shareSettings = {
          ...doc.shareSettings,
          enabled: updatedLinks.length > 0,
        } as NoteDoc['shareSettings']
      }
    })
  },

  addComment: (notebookId, docId, content) => {
    const newComment: Comment = {
      id: newId(),
      docId,
      author: '我',
      content,
      createdAt: new Date().toISOString(),
    }

    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc) {
        doc.comments = [...(doc.comments || []), newComment]
      }
    })
  },

  deleteComment: (notebookId, docId, commentId) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc) {
        doc.comments = (doc.comments || []).filter(c => c.id !== commentId)
      }
    })
  },

  reorderDocs: (notebookId, fromIndex, toIndex, parentId = null) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      if (!notebook) return

      const docs = notebook.docs.filter(d => d.parentId === parentId)
      const children = notebook.docs.filter(d => d.parentId !== parentId)

      if (fromIndex < 0 || fromIndex >= docs.length) return
      if (toIndex < 0 || toIndex >= docs.length) return

      const [moved] = docs.splice(fromIndex, 1)
      docs.splice(toIndex, 0, moved)

      notebook.docs = [...docs, ...children]
    })
  },

  setActiveNotebookId: (id) => set({ activeNotebookId: id }),
  setActiveDocId: (id) => set({ activeDocId: id }),
  setSearchText: (text) => set({ searchText: text }),
})