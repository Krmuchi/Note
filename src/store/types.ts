import type { CoreSlice } from './slices/coreSlice'
import type { TagSlice } from './slices/tagSlice'
import type { SearchSlice } from './slices/searchSlice'
import type { UndoRedoSlice } from './slices/undoRedoSlice'

export type NotesStore = CoreSlice & TagSlice & SearchSlice & UndoRedoSlice