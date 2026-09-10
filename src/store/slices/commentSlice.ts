import type { StateCreator } from 'zustand'
import type { Comment } from '@/types'
import type { NotesStore } from '@/store/types'
import { newId } from '@/store/storeUtils'

export interface CommentAnchor {
  quote?: string
  anchorStart?: number
  anchorEnd?: number
}

export interface CommentSlice {
  addComment: (notebookId: string, docId: string, content: string, anchor?: CommentAnchor) => void
  deleteComment: (notebookId: string, docId: string, commentId: string) => void
  addReply: (notebookId: string, docId: string, commentId: string, content: string) => void
}

type CommentSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  CommentSlice
>

export const createCommentSlice: CommentSliceCreator = (set, _get) => ({
  addComment: (notebookId, docId, content, anchor) => {
    // 仅当引用文本存在时携带锚定字段，旧数据不受影响
    const anchorFields = anchor?.quote
      ? { quote: anchor.quote, anchorStart: anchor.anchorStart, anchorEnd: anchor.anchorEnd }
      : {}
    const newComment: Comment = {
      id: newId(),
      docId,
      author: '我',
      content,
      createdAt: new Date().toISOString(),
      replies: [],
      ...anchorFields,
    }

    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc) {
        doc.comments = [...(doc.comments || []), newComment]
        doc.updatedAt = new Date().toISOString()
        state.lastMutationAt = Date.now()
      }
    })
  },

  deleteComment: (notebookId, docId, commentId) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc) {
        doc.comments = (doc.comments || []).filter(c => c.id !== commentId)
        doc.updatedAt = new Date().toISOString()
        state.lastMutationAt = Date.now()
      }
    })
  },

  addReply: (notebookId, docId, commentId, content) => {
    const newReply: Comment = {
      id: newId(),
      docId,
      author: '我',
      content,
      createdAt: new Date().toISOString(),
    }

    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc) {
        const comment = (doc.comments || []).find(c => c.id === commentId)
        if (comment) {
          comment.replies = [...(comment.replies || []), newReply]
          doc.updatedAt = new Date().toISOString()
          state.lastMutationAt = Date.now()
        }
      }
    })
  },
})