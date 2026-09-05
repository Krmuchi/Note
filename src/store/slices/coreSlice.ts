import type { StateCreator } from 'zustand'
import type { NoteDoc, Notebook, DocVersion, TrashDoc } from '@/types'
import type { NotesStore } from '@/store/types'
import { newId } from '@/store/storeUtils'
import { loadAppStore, saveAppStore } from '@/services/storage'
import { TRASH_RETENTION_DAYS } from '@/shared/constants'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** 从文档列表移除指定文档，并将其子文档重挂到该文档的父级 */
function detachAndReparent(docs: NoteDoc[], docId: string, parentId: NoteDoc['parentId']): NoteDoc[] {
  return docs
    .filter(d => d.id !== docId)
    .map(d => d.parentId === docId ? { ...d, parentId } : d)
}

/** 向文档推入 auto 版本快照（30s 内去重，最多保留 50 个） */
function pushAutoVersion(doc: NoteDoc, notebookId: string, updates: Partial<NoteDoc>): void {
  const lastAuto = (doc.versions || []).find(v => v.type === 'auto')
  if (lastAuto && Date.now() - new Date(lastAuto.createdAt).getTime() < 30_000) {
    return
  }

  const now = new Date()
  const newVersion: DocVersion = {
    id: newId(),
    docId: doc.id,
    notebookId,
    title: updates.title || doc.title,
    content: updates.content || doc.content,
    tags: updates.tags || doc.tags,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    type: 'auto',
  }

  // 大文档的全量快照会随保存 payload 一起膨胀（每份都是完整 content 拷贝），
  // 超过 100KB 的文档仅保留 5 份快照，避免把 store 推向 IPC 50MB 上限导致保存永久失败
  const snapshotContent = newVersion.content.length
  const maxVersions = snapshotContent > 100_000 ? 5 : 50
  doc.versions = [newVersion, ...(doc.versions || [])].slice(0, maxVersions)
}

/** 保存失败时裁剪全部文档的版本快照（各保留最新 10 份），为 payload 瘦身后重试 */
function trimAllVersions(notebooks: Notebook[], keep: number): void {
  for (const nb of notebooks) {
    for (const doc of nb.docs) {
      if (doc.versions && doc.versions.length > keep) {
        doc.versions = doc.versions.slice(0, keep)
      }
    }
  }
}

export interface CoreSlice {
  notebooks: Notebook[]
  trash: TrashDoc[]
  saveStatus: SaveStatus
  lastSavedAt: string | null
  /** 数据加载是否失败。失败时禁止自动保存，防止用空状态覆盖磁盘上的有效数据 */
  loadFailed: boolean
  /** 数据变更时间戳（毫秒），useAutoSave 仅订阅此值以避免无关重渲染 */
  lastMutationAt: number
  activeNotebookId: string
  activeDocId: string
  /** 缓存的活跃文档引用，避免每次渲染都执行两次 find */
  activeDoc: NoteDoc | null
  searchText: string
  loadNotes: () => Promise<void>
  saveNotes: () => Promise<void>
  updateStore: (store: Partial<NotesStore>) => void
  setSaveStatus: (status: SaveStatus) => void
  createNotebook: (title: string) => void
  updateNotebookTitle: (id: string, title: string) => void
  deleteNotebook: (id: string) => void
  createDoc: (notebookId: string, parentId: string | null, docData?: Partial<NoteDoc>) => string | null
  updateDoc: (notebookId: string, docId: string, updates: Partial<NoteDoc>) => void
  deleteDoc: (notebookId: string, docId: string) => void
  moveDocToTrash: (notebookId: string, docId: string) => void
  moveDocToNotebook: (sourceNotebookId: string, docId: string, targetNotebookId: string) => void
  toggleFavorite: (notebookId: string, docId: string) => void
  togglePin: (notebookId: string, docId: string) => void
  restoreFromTrash: (docId: string) => void
  deleteFromTrash: (docId: string) => void
  clearTrash: () => void
  autoCleanTrash: () => void
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

/** 根据当前 notebooks/activeNotebookId/activeDocId 计算活跃文档 */
function findActiveDoc(notebooks: Notebook[], notebookId: string, docId: string): NoteDoc | null {
  if (!notebookId || !docId) return null
  const notebook = notebooks.find(nb => nb.id === notebookId)
  if (!notebook) return null
  return notebook.docs.find(doc => doc.id === docId) ?? null
}

export const createCoreSlice: CoreSliceCreator = (set, get) => ({
  notebooks: [],
  trash: [],
  saveStatus: 'idle',
  lastSavedAt: null,
  loadFailed: false,
  lastMutationAt: 0,
  activeNotebookId: '',
  activeDocId: '',
  activeDoc: null,
  searchText: '',

  setSaveStatus: (status) => set({ saveStatus: status }),

  loadNotes: async () => {
    try {
      const loaded = await loadAppStore()
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
        tags: (loaded.tags ?? []).map((tag) => ({
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
          state.activeDoc = findActiveDoc(state.notebooks, state.activeNotebookId, state.activeDocId)
        })
      }
    } catch (error) {
      console.error('Failed to load notes:', error)
      // 加载失败时置标志，阻止后续自动保存用空状态覆盖磁盘上的有效数据
      set({ loadFailed: true, saveStatus: 'error' })
    }
  },

  saveNotes: async () => {
    // 数据从未成功加载时不允许落盘，否则会用内存空状态销毁磁盘文件
    if (get().loadFailed) {
      console.warn('[saveNotes] 数据加载失败，已阻止自动保存以保护磁盘数据')
      return
    }
    const { notebooks, trash, tags, searchHistory, activeNotebookId, activeDocId } = get()
    set({ saveStatus: 'saving' })
    try {
      await saveAppStore({ notebooks, trash, tags, searchHistory, activeNotebookId, activeDocId })
      set({ saveStatus: 'saved', lastSavedAt: new Date().toISOString() })
    } catch (error) {
      // 保存失败最常见的原因是版本快照把 payload 推向 IPC 50MB 上限，
      // 裁剪各文档版本快照到最新 10 份后重试一次
      console.error('Failed to save notes, retrying after trimming versions:', error)
      trimAllVersions(notebooks, 10)
      try {
        await saveAppStore({ notebooks, trash, tags, searchHistory, activeNotebookId, activeDocId })
        set({ saveStatus: 'saved', lastSavedAt: new Date().toISOString() })
      } catch (retryError) {
        console.error('Failed to save notes after retry:', retryError)
        set({ saveStatus: 'error' })
      }
    }
  },

  updateStore: (store) => set((state) => {
    state.lastMutationAt = Date.now()
    Object.assign(state, store)
  }),

  createNotebook: (title) => {
    const newNotebook: Notebook = {
      id: newId(),
      title: title || "新建知识库",
      docs: []
    }
    set((state) => {
      state.lastMutationAt = Date.now()
      state.notebooks.push(newNotebook)
      state.activeNotebookId = newNotebook.id
    })
  },

  updateNotebookTitle: (id, title) => {
    set((state) => {
      state.lastMutationAt = Date.now()
      const notebook = state.notebooks.find(nb => nb.id === id)
      if (notebook) notebook.title = title
    })
  },

  deleteNotebook: (id) => {
    set((state) => {
      const target = state.notebooks.find(nb => nb.id === id)
      if (!target) return
      state.lastMutationAt = Date.now()

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
        // 必须重算 activeDoc，否则编辑器继续显示已删除知识库中的幽灵文档，
        // 用户后续输入会被 updateDoc 静默丢弃
        state.activeDoc = findActiveDoc(state.notebooks, state.activeNotebookId, state.activeDocId)
      }
    })
  },

  createDoc: (notebookId, parentId, docData = {}) => {
    // ...docData 放在前面，防止调用方传入的 id/createdAt 等字段覆盖下方生成的默认值
    const newDoc: NoteDoc = {
      ...docData,
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
    }

    let createdId: string | null = null
    set((state) => {
      state.lastMutationAt = Date.now()
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      if (notebook) {
        notebook.docs.push(newDoc)
        state.activeNotebookId = notebookId
        state.activeDocId = newDoc.id
        state.activeDoc = newDoc
        createdId = newDoc.id
      }
    })
    // 返回新文档 id：UI 层创建后可立即跳转编辑器（避免"点了没反应"）
    return createdId
  },

  updateDoc: (notebookId, docId, updates) => {
    set((state) => {
      state.lastMutationAt = Date.now()
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (!doc || !notebook) return

      // parentId 环防御（第二道保险，第一道在拖拽 hook）：新的父级不能是自己或自己的后代，
      // 否则文档树渲染会无限递归
      if (updates.parentId) {
        let cursorId: string | null = updates.parentId
        const seen = new Set<string>()
        while (cursorId && !seen.has(cursorId)) {
          if (cursorId === docId) {
            updates = { ...updates, parentId: null }
            break
          }
          seen.add(cursorId)
          cursorId = notebook.docs.find(d => d.id === cursorId)?.parentId ?? null
        }
      }

      Object.assign(doc, updates, { updatedAt: new Date().toISOString() })

      if (updates.content || updates.title || updates.tags) {
        pushAutoVersion(doc, notebookId, updates)
      }

      // 同步更新 activeDoc 缓存
      if (state.activeDocId === docId && state.activeNotebookId === notebookId) {
        state.activeDoc = doc
      }
    })
  },

  toggleFavorite: (notebookId, docId) => {
    set((state) => {
      state.lastMutationAt = Date.now()
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc) {
        doc.favorite = !doc.favorite
        doc.updatedAt = new Date().toISOString()
        // 同步更新 activeDoc 缓存
        if (state.activeDocId === docId && state.activeNotebookId === notebookId) {
          state.activeDoc = doc
        }
      }
    })
  },

  togglePin: (notebookId, docId) => {
    set((state) => {
      state.lastMutationAt = Date.now()
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc) {
        doc.pinned = !doc.pinned
        doc.updatedAt = new Date().toISOString()
        // 同步更新 activeDoc 缓存
        if (state.activeDocId === docId && state.activeNotebookId === notebookId) {
          state.activeDoc = doc
        }
      }
    })
  },

  deleteDoc: (notebookId, docId) => {
    set((state) => {
      state.lastMutationAt = Date.now()
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      if (notebook) {
        // 子文档重挂到被删文档的父级，避免留下孤儿文档
        const removed = notebook.docs.find(doc => doc.id === docId)
        notebook.docs = notebook.docs
          .filter(doc => doc.id !== docId)
          .map(doc => doc.parentId === docId ? { ...doc, parentId: removed?.parentId ?? null } : doc)
        if (state.activeDocId === docId) {
          state.activeDocId = ''
        }
        // 无论删除的是否是当前文档，都可能影响 activeDoc 缓存（如删除的是其祖先）
        state.activeDoc = findActiveDoc(state.notebooks, state.activeNotebookId, state.activeDocId)
      }
    })
  },

  moveDocToTrash: (notebookId, docId) => {
    set((state) => {
      state.lastMutationAt = Date.now()
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      if (!notebook) return

      const doc = notebook.docs.find(d => d.id === docId)
      if (!doc) return

      notebook.docs = detachAndReparent(notebook.docs, docId, doc.parentId)

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
      // activeDoc 可能是被删文档的子文档（已被重挂），需重算缓存引用
      state.activeDoc = findActiveDoc(state.notebooks, state.activeNotebookId, state.activeDocId)
    })
  },

  moveDocToNotebook: (sourceNotebookId, docId, targetNotebookId) => {
    set((state) => {
      state.lastMutationAt = Date.now()
      const sourceNotebook = state.notebooks.find(nb => nb.id === sourceNotebookId)
      const targetNotebook = state.notebooks.find(nb => nb.id === targetNotebookId)
      if (!sourceNotebook || !targetNotebook) return

      const doc = sourceNotebook.docs.find(d => d.id === docId)
      if (!doc) return

      sourceNotebook.docs = detachAndReparent(sourceNotebook.docs, docId, doc.parentId)

      targetNotebook.docs.push({
        ...doc,
        parentId: null,
        updatedAt: new Date().toISOString(),
      })

      if (state.activeDocId === docId) {
        state.activeNotebookId = targetNotebookId
        // 文档移动到目标知识库后，重新查找 activeDoc
        state.activeDoc = findActiveDoc(state.notebooks, state.activeNotebookId, state.activeDocId)
      }
    })
  },

  restoreFromTrash: (docId) => {
    set((state) => {
      state.lastMutationAt = Date.now()
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
        pinned: target.pinned ?? false,
        // 回收站条目是完整文档的快照，恢复时必须保留版本历史/评论/分享数据，否则数据丢失
        versions: target.versions ?? [],
        comments: target.comments ?? [],
        shareLinks: target.shareLinks ?? [],
        shareSettings: target.shareSettings ?? {
          enabled: false,
          defaultPermission: 'view',
          allowPassword: true,
          allowExpiration: true,
        },
      }

      // 源知识库可能已被删除（如删除整个知识库后再恢复），此时回退到第一个知识库；
      // 若没有任何知识库则自动创建一个，绝不能把文档从 trash 移出后丢弃（会导致永久丢失）
      let targetNotebook = state.notebooks.find(nb => nb.id === target.notebookId)
      if (!targetNotebook && state.notebooks.length > 0) {
        targetNotebook = state.notebooks[0]
      }
      if (!targetNotebook) {
        targetNotebook = { id: newId(), title: '已恢复文档', docs: [] }
        state.notebooks.push(targetNotebook)
      }

      // 原父文档可能也已不存在（同批删除/不在目标知识库），此时降级为根文档
      const parentExists = restoredDoc.parentId
        ? targetNotebook.docs.some(d => d.id === restoredDoc.parentId)
        : false
      if (!parentExists) {
        restoredDoc.parentId = null
      }

      // 先确认插入成功，再从回收站移除
      targetNotebook.docs.push(restoredDoc)
      state.trash = state.trash.filter((item) => item.id !== docId)
      state.activeNotebookId = targetNotebook.id
      state.activeDocId = target.id
      state.activeDoc = restoredDoc
    })
  },

  deleteFromTrash: (docId) => {
    set((state) => {
      state.lastMutationAt = Date.now()
      state.trash = state.trash.filter((item) => item.id !== docId)
    })
  },

  clearTrash: () => {
    set((state) => {
      state.lastMutationAt = Date.now()
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

  reorderDocs: (notebookId, fromIndex, toIndex, parentId = null) => {
    set((state) => {
      state.lastMutationAt = Date.now()
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

  setActiveNotebookId: (id) => set((state) => {
    state.activeNotebookId = id
    state.activeDoc = findActiveDoc(state.notebooks, state.activeNotebookId, state.activeDocId)
  }),
  setActiveDocId: (id) => set((state) => {
    state.activeDocId = id
    state.activeDoc = findActiveDoc(state.notebooks, state.activeNotebookId, state.activeDocId)
  }),
  setSearchText: (text) => set({ searchText: text }),
})