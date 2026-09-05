import type { StateCreator } from 'zustand'
import type { ShareLink, NoteDoc } from '@/types'
import type { NotesStore } from '@/store/types'
import { newId, generateShareUrl } from '@/store/storeUtils'
import { toast } from '@/components/common/Toast'

export interface ShareSlice {
  generateShareLink: (notebookId: string, docId: string, permission: 'view' | 'comment' | 'edit' | 'manage', password: string, expiresAt: string | null) => void
  deleteShareLink: (notebookId: string, docId: string, linkId: string) => void
}

type ShareSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  ShareSlice
>

export const createShareSlice: ShareSliceCreator = (set, _get) => ({
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

    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (!notebook || !doc) {
        toast.warning('请先打开一个文档再生成分享链接')
        return
      }
      doc.shareLinks = [...(doc.shareLinks || []), newLink]
      doc.shareSettings = {
        ...doc.shareSettings,
        enabled: true,
      } as NoteDoc['shareSettings']
      doc.updatedAt = new Date().toISOString()
      state.lastMutationAt = Date.now()
    })
  },

  deleteShareLink: (notebookId, docId, linkId) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc) {
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
  },
})