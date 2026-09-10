import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { NotesStore } from './types'
import { createCoreSlice } from './slices/coreSlice'
import { createVersionSlice } from './slices/versionSlice'
import { createShareSlice } from './slices/shareSlice'
import { createCommentSlice } from './slices/commentSlice'
import { createTagSlice } from './slices/tagSlice'
import { createSearchSlice } from './slices/searchSlice'
import { createUndoRedoSlice } from './slices/undoRedoSlice'
import { createQuickNoteSlice } from './slices/quickNoteSlice'
import { createKeyboardSlice } from './slices/keyboardSlice'

export type { SaveStatus } from './slices/coreSlice'
export type { NotesStore }

export const useNotesStore = create<NotesStore>()(
  immer((...a) => ({
    ...createCoreSlice(...a),
    ...createVersionSlice(...a),
    ...createShareSlice(...a),
    ...createCommentSlice(...a),
    ...createTagSlice(...a),
    ...createSearchSlice(...a),
    ...createUndoRedoSlice(...a),
    ...createQuickNoteSlice(...a),
    ...createKeyboardSlice(...a),
  }))
)

export const selectActiveNotebook = (state: NotesStore): import('@/types').Notebook | null =>
  state.notebooks.find(nb => nb.id === state.activeNotebookId) ?? null

/** 使用 coreSlice 中缓存的 activeDoc，避免每次渲染都执行两次 find */
export const selectActiveDoc = (state: NotesStore): import('@/types').NoteDoc | null => state.activeDoc