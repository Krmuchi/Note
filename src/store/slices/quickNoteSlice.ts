import type { StateCreator } from 'zustand'
import type { NotesStore } from '@/store/types'
import { newId } from '@/store/storeUtils'
import { debounce } from '@/utils/debounce'
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
  addQuickNote: (content: string, tags?: string[]) => void
  updateQuickNote: (id: string, content: string, tags?: string[]) => void
  deleteQuickNote: (id: string) => void
  loadQuickNotes: () => void
  saveQuickNotes: () => Promise<void>
  /** 立即把待写入的便签刷入 localStorage（窗口关闭前调用） */
  flushQuickNotes: () => void
  /** 导出用：把便签并入数据快照（导出/备份必须包含便签，否则用户以为备份全了） */
  withQuickNotesForExport: <T extends Record<string, unknown>>(payload: T) => T & { quickNotes: QuickNoteData[] }
  /** 导入用：把备份里的便签合并进当前便签（按 id 去重，保留较新的 updatedAt） */
  importQuickNotes: (imported: QuickNoteData[] | undefined) => void
}

type QuickNoteSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  QuickNoteSlice
>

const QUICK_NOTES_KEY = 'notes-quick-notes'
const PERSIST_DEBOUNCE_MS = 800

// 测试中会多次创建 store，beforeunload 监听只注册一次，避免监听器堆积
let beforeUnloadBound = false

export const createQuickNoteSlice: QuickNoteSliceCreator = (set, get) => {
  const persist = debounce(() => {
    try {
      localStorage.setItem(QUICK_NOTES_KEY, JSON.stringify(get().quickNotes))
    } catch {
      // 存储不可用时静默失败（与旧实现一致）
    }
  }, PERSIST_DEBOUNCE_MS)

  // 关闭窗口时把最后 800ms 内未落盘的编辑同步写出，避免丢字
  if (!beforeUnloadBound && typeof window !== 'undefined') {
    beforeUnloadBound = true
    window.addEventListener('beforeunload', () => persist.flush())
  }

  return {
    quickNotes: [],

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
      })
      persist()
    },

    updateQuickNote: (id, content, tags) => {
      set((state) => {
        const note = state.quickNotes.find(n => n.id === id)
        if (note) {
          note.content = content
          if (tags !== undefined) note.tags = tags
          note.updatedAt = new Date().toISOString()
        }
      })
      persist()
    },

    deleteQuickNote: (id) => {
      set((state) => {
        state.quickNotes = state.quickNotes.filter(n => n.id !== id)
      })
      persist()
    },

    loadQuickNotes: () => {
      try {
        const raw = localStorage.getItem(QUICK_NOTES_KEY)
        if (raw) {
          const notes = JSON.parse(raw)
          // 结构校验：localStorage 数据损坏（非数组）会让面板渲染崩溃
          if (!Array.isArray(notes)) return
          set((state) => {
            state.quickNotes = notes
          })
        }
      } catch {
        // ignore
      }
    },

    // 保留显式异步保存接口（兼容既有调用），内部取消挂起的防抖后立即写一次
    saveQuickNotes: async () => {
      persist.flush()
    },

    flushQuickNotes: () => {
      persist.flush()
    },

    /**
     * 把便签并入要导出的数据快照。
     *
     * 便签平时不在 notes-data.json 里（它们是高频编辑的轻量数据），
     * 但「导出全部 / 本地备份」必须包含它们 —— 否则用户以为备份全了，
     * 换机恢复时才发现所有便签都没了。
     */
    withQuickNotesForExport: (payload) => ({
      ...payload,
      quickNotes: get().quickNotes.map(n => ({ ...n })),
    }),

    /**
     * 从备份恢复便签。
     * 按 id 去重并保留 updatedAt 较新的那一条：用户可能已经在本机改过同一条便签，
     * 直接用备份覆盖会丢掉较新的编辑。
     */
    importQuickNotes: (imported) => {
      if (!Array.isArray(imported) || imported.length === 0) return

      set((state) => {
        const byId = new Map(state.quickNotes.map(n => [n.id, n]))
        for (const incoming of imported) {
          if (!incoming || typeof incoming.id !== 'string' || typeof incoming.content !== 'string') continue
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
      persist.flush()
    },
  }
}
