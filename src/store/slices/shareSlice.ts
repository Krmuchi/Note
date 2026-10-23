import type { StateCreator } from 'zustand'
import type { ShareLink, NoteDoc } from '@/types'
import type { NotesStore } from '@/store/types'
import { newId, generateShareUrl } from '@/store/storeUtils'

/** store 层动作统一返回信封，toast 由调用组件负责（store 不反向依赖组件层） */
export type ShareActionResult = { ok: true } | { ok: false; error: string }

export interface ShareSlice {
  generateShareLink: (notebookId: string, docId: string, permission: 'view' | 'comment' | 'edit' | 'manage', password: string, expiresAt: string | null) => ShareActionResult
  deleteShareLink: (notebookId: string, docId: string, linkId: string) => ShareActionResult
}

type ShareSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  ShareSlice
>

export const createShareSlice: ShareSliceCreator = (set) => ({
  generateShareLink: (notebookId, docId, permission, password, expiresAt) => {
    const linkId = newId()
    const newLink: ShareLink = {
      id: linkId,
      docId,
      notebookId,
      url: generateShareUrl(docId, linkId),
      permission,
      password: password || null,
      expiresAt,
      createdAt: new Date().toISOString(),
      accessCount: 0,
      lastAccessedAt: null,
    }

    let found = false
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (!notebook || !doc) {
        return
      }
      found = true
      doc.shareLinks = [...(doc.shareLinks || []), newLink]
      doc.shareSettings = {
        ...doc.shareSettings,
        enabled: true,
      } as NoteDoc['shareSettings']
      doc.updatedAt = new Date().toISOString()
      state.lastMutationAt = Date.now()
    })

    return found ? { ok: true } : { ok: false, error: '请先打开一个文档再生成分享链接' }
  },

  deleteShareLink: (notebookId, docId, linkId) => {
    let found = false
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc) {
        found = true
        const updatedLinks = (doc.shareLinks || []).filter(link => link.id !== linkId)
        doc.shareLinks = updatedLinks
        doc.shareSettings = {
          ...doc.shareSettings,
          enabled: updatedLinks.length > 0,
        } as NoteDoc['shareSettings']
        doc.updatedAt = new Date().toISOString()
        state.lastMutationAt = Date.now()
      }
    })
    return found ? { ok: true } : { ok: false, error: '未找到要删除的分享链接' }
  },
})
