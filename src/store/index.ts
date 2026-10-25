import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { NotesStore } from './types'
import type { Notebook, NoteDoc } from '@/types'
import { findActiveDoc } from './storeUtils'
import { createCoreSlice } from './slices/coreSlice'
import { createVersionSlice } from './slices/versionSlice'
import { createShareSlice } from './slices/shareSlice'
import { createCommentSlice } from './slices/commentSlice'
import { createTagSlice } from './slices/tagSlice'
import { createSearchSlice } from './slices/searchSlice'
import { createUndoRedoSlice } from './slices/undoRedoSlice'
import { createQuickNoteSlice } from './slices/quickNoteSlice'
import { createKeyboardSlice } from './slices/keyboardSlice'
import { createTabSlice } from './slices/tabSlice'

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
    ...createTabSlice(...a),
  }))
)

export const selectActiveNotebook = (state: NotesStore): Notebook | null =>
  state.notebooks.find(nb => nb.id === state.activeNotebookId) ?? null

/**
 * 活跃文档（派生值，非 state 字段）。
 *
 * 旧实现把 activeDoc 存在 state 里当缓存，靠 12 处 action 手工重算 —— 任何新增的
 * 改文档 action 忘记同步，编辑器就会显示旧内容且不报错。现在只有 notebooks 一份
 * 真相，这里按 id 派生。
 *
 * 性能：`findActiveDoc` 是两次线性查找（知识库数 × 文档数），与旧实现的开销相同；
 * 但订阅语义变了 —— 旧缓存只在内容变化时换引用，派生的引用同样只在对应文档被
 * immer 改写时才变，所以订阅者不会因此多渲染。
 */
export const selectActiveDoc = (state: NotesStore): NoteDoc | null =>
  findActiveDoc(state.notebooks, state.activeNotebookId, state.activeDocId)