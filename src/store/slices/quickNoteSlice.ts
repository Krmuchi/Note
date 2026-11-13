import type { StateCreator } from 'zustand'
import type { NotesStore } from '@/store/types'
import { newId } from '@/store/storeUtils'
import type { QuickNoteData } from '@/types'

export interface QuickNote {
  id: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface QuickNoteSlice {
  quickNotes: QuickNote[]
  /**
   * 已删除小记的墓碑（id → 删除时间 ISO）。
   * 小记同时存在于 localStorage 与 notes-data.json（备份副本）两处，
   * 启动/恢复时按 id 合并；没有墓碑的话，本机刚删掉的小记会被磁盘旧副本"复活"。
   */
  quickNoteTombstones: Record<string, string>
  addQuickNote: (content: string, tags?: string[]) => void
  updateQuickNote: (id: string, content: string, tags?: string[]) => void
  deleteQuickNote: (id: string) => void
  loadQuickNotes: () => void
  saveQuickNotes: () => Promise<void>
  /** 立即把小记刷入 localStorage（保留接口兼容；现在每次变更都已同步落盘） */
  flushQuickNotes: () => void
  /** 导出用：把便签并入数据快照（导出/备份必须包含便签，否则用户以为备份全了） */
  withQuickNotesForExport: <T extends Record<string, unknown>>(payload: T) => T & { quickNotes: QuickNoteData[] }
  /** 导入用：把备份里的便签合并进当前便签（按 id 去重，保留较新的 updatedAt，跳过已删除） */
  importQuickNotes: (imported: QuickNoteData[] | undefined) => void
}

type QuickNoteSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  QuickNoteSlice
>

const QUICK_NOTES_KEY = 'notes-quick-notes'
const QUICK_NOTES_DELETED_KEY = 'notes-quick-notes-deleted'
/** 墓碑保留时长：远超任何备份恢复窗口，过期清理避免无限增长 */
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000

/** 读取并清理过期墓碑；损坏数据一律按空处理，绝不让面板崩 */
function readTombstones(): Record<string, string> {
  try {
    const raw = localStorage.getItem(QUICK_NOTES_DELETED_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const now = Date.now()
    const out: Record<string, string> = {}
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'string' && now - new Date(at).getTime() < TOMBSTONE_TTL_MS) {
        out[id] = at
      }
    }
    return out
  } catch {
    return {}
  }
}

export const createQuickNoteSlice: QuickNoteSliceCreator = (set, get) => {
  /*
   * 小记的每次变更都是离散的用户动作（新增 / 保存 / 删除），不是逐键输入，
   * 因此**同步立即落盘**，不再使用 800ms 防抖。旧实现的防抖窗口有两个数据丢失路径：
   * 1. 窗口内切换视图再回来，loadQuickNotes 用尚未落盘的旧 localStorage 覆盖内存；
   * 2. 窗口内崩溃 / 关窗，最后一次编辑丢失。
   * 立即落盘后这两个窗口都不复存在，beforeunload 兜底也不再需要。
   */
  const persistNow = (): void => {
    try {
      localStorage.setItem(QUICK_NOTES_KEY, JSON.stringify(get().quickNotes))
      localStorage.setItem(QUICK_NOTES_DELETED_KEY, JSON.stringify(get().quickNoteTombstones))
    } catch {
      // 存储不可用时静默失败（与旧实现一致）
    }
  }

  return {
    quickNotes: [],
    quickNoteTombstones: {},

    addQuickNote: (content, tags = []) => {
      const newNote: QuickNote = {
        id: newId(),
        content,
        tags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      set((state) => {
        state.quickNotes.unshift(newNote)
        // 触发自动保存，让小记也随全量保存进入 notes-data.json（备份副本）
        state.lastMutationAt = Date.now()
      })
      persistNow()
    },

    updateQuickNote: (id, content, tags) => {
      set((state) => {
        const note = state.quickNotes.find(n => n.id === id)
        if (note) {
          note.content = content
          if (tags !== undefined) note.tags = tags
          note.updatedAt = new Date().toISOString()
          state.lastMutationAt = Date.now()
        }
      })
      persistNow()
    },

    deleteQuickNote: (id) => {
      set((state) => {
        state.quickNotes = state.quickNotes.filter(n => n.id !== id)
        state.quickNoteTombstones[id] = new Date().toISOString()
        state.lastMutationAt = Date.now()
      })
      persistNow()
    },

    loadQuickNotes: () => {
      try {
        const tombstones = readTombstones()
        const raw = localStorage.getItem(QUICK_NOTES_KEY)
        let local: QuickNote[] = []
        if (raw) {
          const parsed: unknown = JSON.parse(raw)
          // 结构校验：localStorage 数据损坏（非数组）会让面板渲染崩溃
          if (Array.isArray(parsed)) {
            local = parsed.filter(
              (n): n is QuickNote =>
                Boolean(n) && typeof n.id === 'string' && typeof n.content === 'string' && !tombstones[n.id],
            )
          }
        }
        /*
         * 合并而非覆盖：内存里可能已有更新的一份（启动时从磁盘导入 / 备份恢复）。
         * 旧实现直接 `state.quickNotes = notes` 覆盖，会丢掉内存里较新的编辑。
         * 这里按 id 保留 updatedAt 较新者，与 importQuickNotes 的合并语义一致。
         */
        set((state) => {
          state.quickNoteTombstones = { ...state.quickNoteTombstones, ...tombstones }
          const byId = new Map(state.quickNotes.map(n => [n.id, n]))
          for (const incoming of local) {
            const existing = byId.get(incoming.id)
            if (!existing || (incoming.updatedAt || '') > (existing.updatedAt || '')) {
              byId.set(incoming.id, {
                ...incoming,
                tags: Array.isArray(incoming.tags) ? incoming.tags : [],
              })
            }
          }
          state.quickNotes = [...byId.values()]
        })
        persistNow()
      } catch {
        // ignore
      }
    },

    // 保留显式异步保存接口（兼容既有调用）；现在变更已同步落盘，这里只是再写一次兜底
    saveQuickNotes: async () => {
      persistNow()
    },

    flushQuickNotes: () => {
      persistNow()
    },

    /**
     * 把便签并入要导出的数据快照。
     *
     * 便签平时存在独立的 localStorage 键里（高频编辑的轻量数据），
     * 但「导出全部 / 本地备份」必须包含它们 —— 否则用户以为备份全了，
     * 换机恢复时才发现所有便签都没了。
     */
    withQuickNotesForExport: (payload) => ({
      ...payload,
      quickNotes: get().quickNotes.map(n => ({ ...n })),
    }),

    /**
     * 从备份 / 磁盘恢复便签。
     * 按 id 去重并保留 updatedAt 较新的那一条：用户可能已经在本机改过同一条便签，
     * 直接用备份覆盖会丢掉较新的编辑。本机已删除（墓碑）的小记不被旧副本复活。
     */
    importQuickNotes: (imported) => {
      if (!Array.isArray(imported) || imported.length === 0) return

      set((state) => {
        const byId = new Map(state.quickNotes.map(n => [n.id, n]))
        for (const incoming of imported) {
          if (!incoming || typeof incoming.id !== 'string' || typeof incoming.content !== 'string') continue
          if (state.quickNoteTombstones[incoming.id]) continue
          const existing = byId.get(incoming.id)
          if (!existing) {
            byId.set(incoming.id, {
              id: incoming.id,
              content: incoming.content,
              tags: Array.isArray(incoming.tags) ? incoming.tags : [],
              createdAt: incoming.createdAt || new Date().toISOString(),
              updatedAt: incoming.updatedAt || new Date().toISOString(),
            })
            continue
          }
          // 双方都有：保留更新时间较晚的一份
          if ((incoming.updatedAt || '') > (existing.updatedAt || '')) {
            existing.content = incoming.content
            existing.tags = Array.isArray(incoming.tags) ? incoming.tags : existing.tags
            existing.updatedAt = incoming.updatedAt
          }
        }
        state.quickNotes = [...byId.values()]
      })
      persistNow()
    },
  }
}