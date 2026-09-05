import type { CoreSlice } from './slices/coreSlice'
import type { VersionSlice } from './slices/versionSlice'
import type { ShareSlice } from './slices/shareSlice'
import type { CommentSlice } from './slices/commentSlice'
import type { TagSlice } from './slices/tagSlice'
import type { SearchSlice } from './slices/searchSlice'
import type { UndoRedoSlice } from './slices/undoRedoSlice'
import type { QuickNoteSlice } from './slices/quickNoteSlice'
import type { KeyboardSlice } from './slices/keyboardSlice'

export type NotesStore = CoreSlice & VersionSlice & ShareSlice & CommentSlice & TagSlice & SearchSlice & UndoRedoSlice & QuickNoteSlice & KeyboardSlice