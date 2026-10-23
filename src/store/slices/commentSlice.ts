import type { StateCreator } from 'zustand'
import type { Comment, CommentAnchor } from '@/types'
import type { NotesStore } from '@/store/types'
import { newId } from '@/store/storeUtils'

export interface CommentSlice {
  /**
   * 添加评论。
   * @param anchor 可选的划词锚点；不传则为文档级评论（与改造前行为一致）
   */
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
    const newComment: Comment = {
      id: newId(),
      docId,
      author: '我',
      content,
      createdAt: new Date().toISOString(),
      replies: [],
      // 只挂有效锚点：空选区（start === end）没有可指向的内容，按文档级评论处理
      ...(anchor && anchor.quote && anchor.start !== anchor.end ? { anchor } : {}),
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