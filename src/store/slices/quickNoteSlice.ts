import type { StateCreator } from 'zustand'
import type { NotesStore } from '@/store/types'
import { newId } from '@/store/storeUtils'

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
}

type QuickNoteSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  QuickNoteSlice
>

const QUICK_NOTES_KEY = 'notes-quick-notes'

export const createQuickNoteSlice: QuickNoteSliceCreator = (set, get) => ({
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
    get().saveQuickNotes()
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
    get().saveQuickNotes()
  },

  deleteQuickNote: (id) => {
    set((state) => {
      state.quickNotes = state.quickNotes.filter(n => n.id !== id)
    })
    get().saveQuickNotes()
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

  saveQuickNotes: async () => {
    try {
      const { quickNotes } = get()
      localStorage.setItem(QUICK_NOTES_KEY, JSON.stringify(quickNotes))
    } catch {
      // ignore
    }
  },
})
