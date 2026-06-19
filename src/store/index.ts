import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { NotesStore } from './types'
import { createCoreSlice } from './slices/coreSlice'
import { createTagSlice } from './slices/tagSlice'
import { createSearchSlice } from './slices/searchSlice'
import { createUndoRedoSlice } from './slices/undoRedoSlice'

export type { SaveStatus } from './slices/coreSlice'
export type { NotesStore }

export const useNotesStore = create<NotesStore>()(
  immer((...a) => ({
    ...createCoreSlice(...a),
    ...createTagSlice(...a),
    ...createSearchSlice(...a),
    ...createUndoRedoSlice(...a),
  }))
)

export const selectActiveNotebook = (state: NotesStore) =>
  state.notebooks.find(nb => nb.id === state.activeNotebookId) ?? null

export const selectActiveDoc = (state: NotesStore) => {
  const notebook = state.notebooks.find(nb => nb.id === state.activeNotebookId)
  if (!notebook) return null
  return notebook.docs.find(doc => doc.id === state.activeDocId) ?? null
}