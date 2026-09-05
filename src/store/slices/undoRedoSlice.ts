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

export interface UndoRedoSlice {
  history: Record<string, DocHistory>
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

  pushUndoSnapshot: (docId, snapshot, limit) => {
    set((state) => {
      if (!state.history[docId]) {
        state.history[docId] = { past: [], future: [] }
      }
      const h = state.history[docId]
      h.past.push(snapshot)
      if (h.past.length > limit) {
        h.past.splice(0, h.past.length - limit)
      }
      h.future = []
    })
  },

  popUndoSnapshot: (docId) => {
    const h = get().history[docId]
    if (!h || h.past.length === 0) return null
    const snapshot = h.past[h.past.length - 1]
    set((state) => {
      state.history[docId].past.pop()
    })
    return snapshot
  },

  pushRedoSnapshot: (docId, snapshot) => {
    set((state) => {
      if (!state.history[docId]) {
        state.history[docId] = { past: [], future: [] }
      }
      state.history[docId].future.push(snapshot)
    })
  },

  popRedoSnapshot: (docId) => {
    const h = get().history[docId]
    if (!h || h.future.length === 0) return null
    const snapshot = h.future[h.future.length - 1]
    set((state) => {
      state.history[docId].future.pop()
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