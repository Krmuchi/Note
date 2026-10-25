import type { StateCreator } from 'zustand'
import type { NoteDoc, Notebook, TrashDoc, AppStore } from '@/types'
import type { NotesStore } from '@/store/types'
import { newId } from '@/store/storeUtils'
import { pushAutoVersion } from '@/store/docVersions'
import { loadAppStore, saveAppStore } from '@/services/storage'
import { TRASH_RETENTION_DAYS } from '@/shared/constants'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** 从文档列表移除指定文档，并将其子文档重挂到该文档的父级 */
function detachAndReparent(docs: NoteDoc[], docId: string, parentId: NoteDoc['parentId']): NoteDoc[] {
  return docs
    .filter(d => d.id !== docId)
    .map(d => d.parentId === docId ? { ...d, parentId } : d)
}

/**
 * 保存失败时裁剪全部文档的版本快照（各保留最新 keep 份），为 payload 瘦身后重试。
 *
 * 必须在 immer 草稿内调用：`get()` 返回的 state 已被 produce 深度冻结，
 * 对其直接赋值会抛 "Cannot assign to read only property"。旧实现在 catch 块里
 * 直接改 get() 的引用，异常逃逸出 saveNotes，导致 saveStatus 永远停在 'saving'，
 * useAutoSave 既不会重试也不弹失败提示 —— 保存失败被静默吞掉。
 */
function trimVersionsInDraft(state: NotesStore, keep: number): void {
  for (const nb of state.notebooks) {
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
  /** 加载失败的具体原因（用于失败恢复引导；加载成功后清空） */
  loadError: string | null
  /** 数据变更时间戳（毫秒），useAutoSave 仅订阅此值以避免无关重渲染 */
  lastMutationAt: number
  activeNotebookId: string
  activeDocId: string
  searchText: string
  loadNotes: () => Promise<void>
  saveNotes: () => Promise<void>
  updateStore: (store: Partial<NotesStore>) => void
  setSaveStatus: (status: SaveStatus) => void
  /** 模板真实使用次数（模板 id → 次数），持久化到 AppStore */
  templateUsage: Record<string, number>
  /** 记录一次模板使用（插入模板文档时调用） */
  recordTemplateUsage: (templateId: string) => void
  /** 创建知识库并返回新 id（调用方凭 id 精确定位，勿用数组末尾推断） */
  createNotebook: (title: string) => string
  updateNotebookTitle: (id: string, title: string) => void
  /** 设置知识库图标（emoji）；传空串表示恢复默认图标 */
  updateNotebookIcon: (id: string, icon: string) => void
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
  /** 按 id 把 movedId 移到 targetId 前/后（同级），避免视图下标与数据下标错配 */
  moveDocRelativeTo: (notebookId: string, movedId: string, targetId: string, position?: 'before' | 'after') => void
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
  loadFailed: false,
  loadError: null,
  lastMutationAt: 0,
  activeNotebookId: '',
  activeDocId: '',
  searchText: '',
  templateUsage: {},

  setSaveStatus: (status) => set({ saveStatus: status }),

  recordTemplateUsage: (templateId) => {
    if (!templateId) return
    set((state) => {
      state.lastMutationAt = Date.now()
      state.templateUsage[templateId] = (state.templateUsage[templateId] || 0) + 1
    })
  },

  loadNotes: async () => {
    try {
      const result = await loadAppStore()
      // 主进程加载失败时返回信封而不是抛错，这里必须显式处理：
      // 否则用户看不到任何提示，且 loadFailed 永久为 true 导致此后所有编辑都不落盘。
      if (!result.ok) {
        set({ loadFailed: true, loadError: result.error, saveStatus: 'error' })
        return
      }
      const loaded = result.data
      const normalized = {
        notebooks: loaded.notebooks.map((notebook: Notebook) => ({
          ...notebook,
          // 图标是可选字段：旧数据没有，非字符串的脏数据也一并归一化为"未设置"
          icon: typeof notebook.icon === 'string' && notebook.icon ? notebook.icon : undefined,
          docs: notebook.docs.map((doc: NoteDoc) => ({
            ...doc,
            // content 必须归一化：旧数据/手工编辑过的 JSON 可能缺此字段，
            // 后续 pushAutoVersion 取 .length 会抛 TypeError 中断整次编辑
            content: typeof doc.content === 'string' ? doc.content : '',
            versions: doc.versions ?? [],
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
        // 模板计数：旧数据无此字段时归一化为 {}；过滤异常键值，防止脏数据进入排序
        templateUsage: Object.fromEntries(
          Object.entries(loaded.templateUsage ?? {}).filter(
            ([k, v]) => typeof k === 'string' && typeof v === 'number' && Number.isFinite(v) && v > 0,
          ),
        ),
      }

      const now = new Date().toISOString()
      set((state) => {
        // 成功加载（含"从备份恢复"后的重新加载）必须清掉失败标记，
        // 否则自动保存会一直处于被拦截状态，用户新写的内容全部不落盘
        Object.assign(state, normalized, {
          lastSavedAt: now,
          saveStatus: 'saved',
          loadFailed: false,
          loadError: null,
        })
      })

      /*
       * 便签：磁盘上的数据是"更权威"的一份（可能来自别的机器的备份），
       * 用它与 localStorage 里的现状合并 —— 按 id 去重、保留较新的 updatedAt。
       * 直接覆盖会丢掉本机最新的编辑；直接忽略则恢复备份后便签不回来。
       */
      const { importQuickNotes } = get()
      if (Array.isArray(loaded.quickNotes) && loaded.quickNotes.length > 0) {
        importQuickNotes(loaded.quickNotes)
      }

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
      // 加载失败时置标志，阻止后续自动保存用空状态覆盖磁盘上的有效数据
      set({
        loadFailed: true,
        loadError: error instanceof Error ? error.message : '加载笔记失败',
        saveStatus: 'error',
      })
    }
  },

  saveNotes: async () => {
    // 数据从未成功加载时不允许落盘，否则会用内存空状态销毁磁盘文件
    if (get().loadFailed) {
      console.warn('[saveNotes] 数据加载失败，已阻止自动保存以保护磁盘数据')
      return
    }
    // 每次都从最新 state 取载荷：裁剪之后必须用裁剪过的数据重试，
    // 否则重试用的是同一个未瘦身的旧引用，重试必然再次失败
    const readPayload = (): AppStore => {
      const { notebooks, trash, tags, searchHistory, activeNotebookId, activeDocId, templateUsage, quickNotes } = get()
      /*
       * 便签随保存一起写入 notes-data.json。
       *
       * 便签平时存在独立的 localStorage 键里（高频编辑，不该每次都走全量保存），
       * 但**本地自动备份是 notes-data.json 的副本** —— 不写进去，用户从备份恢复时
       * 便签会静默消失。这里带上它们，代价只是每次保存多一个很小的字段。
       */
      return {
        notebooks, trash, tags, searchHistory, activeNotebookId, activeDocId, templateUsage,
        quickNotes,
      }
    }

    set({ saveStatus: 'saving' })
    try {
      await saveAppStore(readPayload())
      set({ saveStatus: 'saved', lastSavedAt: new Date().toISOString() })
      return
    } catch (error) {
      // 保存失败最常见的原因是版本快照把 payload 推向 IPC 50MB 上限，
      // 裁剪各文档版本快照到最新 10 份后重试一次
      console.error('Failed to save notes, retrying after trimming versions:', error)
      try {
        // 裁剪必须包在 set 的 immer 草稿里：get() 的 state 是深度冻结的，
        // 直接对它赋值会抛 TypeError 并逃逸出 saveNotes，saveStatus 永远停在
        // 'saving'，useAutoSave 既不重试也不提示，失败被静默吞掉。
        set((state) => { trimVersionsInDraft(state, 10) })
      } catch (trimError) {
        // 裁剪本身失败也必须继续走重试/报错分支，不能中断状态收口
        console.error('Failed to trim versions before retry:', trimError)
      }
    }

    try {
      await saveAppStore(readPayload())
      set({ saveStatus: 'saved', lastSavedAt: new Date().toISOString() })
    } catch (retryError) {
      console.error('Failed to save notes after retry:', retryError)
      set({ saveStatus: 'error' })
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
    return newNotebook.id
  },

  updateNotebookTitle: (id, title) => {
    set((state) => {
      state.lastMutationAt = Date.now()
      const notebook = state.notebooks.find(nb => nb.id === id)
      if (notebook) notebook.title = title
    })
  },

  updateNotebookIcon: (id, icon) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === id)
      if (!notebook) return
      state.lastMutationAt = Date.now()
      // 空串表示"恢复默认"：删除字段而不是存空值，
      // 让旧数据与未设置图标的新数据在存储里保持同一种形态
      if (!icon) delete notebook.icon
      else notebook.icon = icon
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
        // eslint-disable-next-line no-console -- 开发期诊断日志：仅 DEV 且确有清理时输出一次
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

  /**
   * 按 id 重排同级文档：把 movedId 放到 targetId 的位置（before/after）。
   *
   * 为什么需要它：`reorderDocs` 收的是"同级数组里的下标"，而调用方手上的下标
   * 来自**当前视图**（可能被搜索/标签过滤过、也可能按标题或时间排过序），
   * 两者并不是同一个索引空间。只要用户开着筛选或非手动排序去做"上移/下移"，
   * 下标就会指到别的文档上 —— 表现为"点了上移，动的是另一篇"。
   * 用 id 表达意图可以从根本上避开索引空间错配。
   */
  moveDocRelativeTo: (notebookId, movedId, targetId, position = 'before') => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      if (!notebook) return
      if (movedId === targetId) return

      const moved = notebook.docs.find(d => d.id === movedId)
      const target = notebook.docs.find(d => d.id === targetId)
      if (!moved || !target) return

      // 同级才能换序：跨层级换序等于隐式改父级，不是用户想要的
      const movedParent = moved.parentId ?? null
      if (movedParent !== (target.parentId ?? null)) return

      // 按同级相对顺序取出两个位置
      const siblings = notebook.docs.filter(d => (d.parentId ?? null) === movedParent)
      const from = siblings.findIndex(d => d.id === movedId)
      const to = siblings.findIndex(d => d.id === targetId)
      if (from < 0 || to < 0 || from === to) return

      state.lastMutationAt = Date.now()

      // 移除被移动项后，目标下标要按移动方向修正（往前移时目标位置会左移一位）
      const next = siblings.filter(d => d.id !== movedId)
      const anchor = next.findIndex(d => d.id === targetId)
      const insertAt = position === 'before' ? anchor : anchor + 1
      next.splice(insertAt, 0, moved)

      // 同级项按新顺序回填，其余文档保持原有相对位置
      const siblingIds = new Set(next.map(d => d.id))
      let cursor = 0
      notebook.docs = notebook.docs.map(d =>
        siblingIds.has(d.id) ? next[cursor++] : d,
      )
    })
  },

  setActiveNotebookId: (id) => set((state) => {
    state.activeNotebookId = id
  }),
  setActiveDocId: (id) => {
    set((state) => {
      state.activeDocId = id
    })
    /*
     * 自动登记标签：所有"打开文档"的入口最终都会走到这里
     * （文档树点击、搜索跳转、快速打开、最近视图、面包屑…）。
     * 在这里统一登记，既有调用点一行都不用改，也不会漏掉任何入口。
     * 用 get() 而不是闭包里的 id：标签需要 notebookId，而它在 state 里。
     */
    const { activeNotebookId, activeDocId, openTab } = get()
    if (activeNotebookId && activeDocId) openTab(activeNotebookId, activeDocId)
  },
  setSearchText: (text) => set({ searchText: text }),
})
