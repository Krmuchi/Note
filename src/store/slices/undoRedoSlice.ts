import type { StateCreator } from 'zustand'
import type { NotesStore } from '@/store/types'

export interface DocSnapshot {
  title: string
  content: string
  tags: string[]
}

interface DocHistory {
  past: DocSnapshot[]
  future: DocSnapshot[]
}

/**
 * 单篇文档撤销/重做栈的字节预算。
 *
 * 快照是完整正文副本：只按条数（200）裁剪时，一篇 200KB 的文档编辑 200 次
 * 会常驻约 40MB（past + future 翻倍）。按 8MB/篇 裁剪，与版本快照的
 * 单篇预算（docVersions.ts）同量级 —— 撤销深度到几 MB 正文已经远超实用回溯范围。
 */
export const UNDO_BUDGET_BYTES_PER_DOC = 8 * 1024 * 1024

/** 估算一份快照的字节占用（UTF-8 上界：中文按 3 字节/字） */
function snapshotBytes(snapshot: DocSnapshot): number {
  return (snapshot.content?.length ?? 0) * 3 + (snapshot.title?.length ?? 0) * 3
        + (snapshot.tags?.length ?? 0) * 32 + 64
}

/** 从最旧一侧裁剪到条数与字节双预算内（不会清空：至少保留最新 1 份） */
function trimStackToBudget(stack: DocSnapshot[], limit: number): DocSnapshot[] {
  let result = stack
  if (result.length > limit) result = result.slice(result.length - limit)
  let total = result.reduce((sum, s) => sum + snapshotBytes(s), 0)
  while (total > UNDO_BUDGET_BYTES_PER_DOC && result.length > 1) {
    total -= snapshotBytes(result[0])
    result = result.slice(1)
  }
  return result
}

export interface UndoRedoSlice {
  history: Record<string, DocHistory>
  /**
   * 撤销/重做执行序号：每次真正 pop 快照时递增。
   *
   * 富文本编辑器的内容同步 effect 靠它识别"这次内容变化来自撤销/重做"：
   * 撤销与打字都走 updateDoc，编辑器无法从内容本身区分；而 lastWrittenRef
   * 会让"重做回到刚写出的值"被误判为无需重建（Ctrl+Z 后 Ctrl+Y 静默无效）。
   * 序号放在 store 里，任何入口（全局键盘 / 工具栏 / 未来新入口）都能触发重建。
   */
  undoRedoSeq: number
  pushUndoSnapshot: (docId: string, snapshot: DocSnapshot, limit: number) => void
  popUndoSnapshot: (docId: string) => DocSnapshot | null
  pushRedoSnapshot: (docId: string, snapshot: DocSnapshot) => void
  popRedoSnapshot: (docId: string) => DocSnapshot | null
  clearHistory: (docId: string) => void
  /** 仅清空重做栈（新编辑使"未来"失效，但保留撤销历史） */
  clearRedoStack: (docId: string) => void
}

type UndoRedoSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  UndoRedoSlice
>

export const createUndoRedoSlice: UndoRedoSliceCreator = (set, get) => ({
  history: {},
  undoRedoSeq: 0,

  pushUndoSnapshot: (docId, snapshot, limit) => {
    set((state) => {
      if (!state.history[docId]) {
        state.history[docId] = { past: [], future: [] }
      }
      const h = state.history[docId]
      h.past.push(snapshot)
      // 条数 + 字节双预算（字节预算防「200 份 × 大文档正文」常驻几十 MB）
      h.past = trimStackToBudget(h.past, limit)
      h.future = []
    })
  },

  popUndoSnapshot: (docId) => {
    const h = get().history[docId]
    if (!h || h.past.length === 0) return null
    const snapshot = h.past[h.past.length - 1]
    set((state) => {
      state.history[docId].past.pop()
      state.undoRedoSeq += 1
    })
    return snapshot
  },

  pushRedoSnapshot: (docId, snapshot) => {
    set((state) => {
      if (!state.history[docId]) {
        state.history[docId] = { past: [], future: [] }
      }
      const h = state.history[docId]
      h.future.push(snapshot)
      // future 此前完全没有上限（旧实现连条数都不限）：连续重做再编辑会无界增长
      h.future = trimStackToBudget(h.future, 200)
    })
  },

  popRedoSnapshot: (docId) => {
    const h = get().history[docId]
    if (!h || h.future.length === 0) return null
    const snapshot = h.future[h.future.length - 1]
    set((state) => {
      state.history[docId].future.pop()
      state.undoRedoSeq += 1
    })
    return snapshot
  },

  clearHistory: (docId) => {
    set((state) => {
      delete state.history[docId]
    })
  },

  clearRedoStack: (docId) => {
    const h = get().history[docId]
    if (!h || h.future.length === 0) return
    set((state) => {
      state.history[docId].future = []
    })
  },
})