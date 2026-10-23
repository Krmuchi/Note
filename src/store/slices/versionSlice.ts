import type { StateCreator } from 'zustand'
import type { DocVersion } from '@/types'
import type { NotesStore } from '@/store/types'
import { newId } from '@/store/storeUtils'

export interface VersionSlice {
  getDocVersions: (notebookId: string, docId: string) => DocVersion[] | undefined
  restoreVersion: (notebookId: string, docId: string, versionId: string) => void
  /**
   * 手动把当前内容定成一个版本（用户点"保存版本"）。
   * 返回新版本 id；文档不存在时返回 null。
   */
  createVersionSnapshot: (
    notebookId: string,
    docId: string,
    options?: { tag?: string; comment?: string },
  ) => string | null
}

type VersionSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  VersionSlice
>

export const createVersionSlice: VersionSliceCreator = (set, get) => ({
  getDocVersions: (notebookId, docId) => {
    const notebook = get().notebooks.find(nb => nb.id === notebookId)
    const doc = notebook?.docs.find(d => d.id === docId)
    return doc?.versions
  },

  restoreVersion: (notebookId, docId, versionId) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      const version = doc?.versions?.find(v => v.id === versionId)
      if (!doc || !version) return

      // 恢复是破坏性操作：覆盖前先把当前内容压入版本列表，保证可再次恢复回来
      const now = new Date().toISOString()
      const backup: DocVersion = {
        id: newId(),
        docId: doc.id,
        notebookId,
        title: doc.title,
        content: doc.content,
        tags: doc.tags,
        createdAt: now,
        updatedAt: now,
        versionTag: '恢复前备份',
        type: 'manual',
      }
      doc.versions = [backup, ...(doc.versions || [])].slice(0, 50)

      doc.title = version.title
      doc.content = version.content
      doc.tags = version.tags
      doc.updatedAt = now
      state.lastMutationAt = Date.now()
    })
  },

  createVersionSnapshot: (notebookId, docId, options = {}) => {
    let createdId: string | null = null
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (!doc) return

      const now = new Date().toISOString()
      const version: DocVersion = {
        id: newId(),
        docId: doc.id,
        notebookId,
        title: doc.title,
        content: doc.content,
        tags: doc.tags,
        createdAt: now,
        updatedAt: now,
        type: 'manual',
        ...(options.tag ? { versionTag: options.tag } : {}),
        ...(options.comment ? { comment: options.comment } : {}),
      }

      /*
       * 与自动快照共用同一个数组和同一个上限（50）。
       * 手动版本排在最前，保证用户"刚定住的那一版"不会被后续自动快照挤出视野；
       * 超限时从**尾部**淘汰旧的自动版本，手动版本优先保留。
       */
      const existing = doc.versions || []
      const merged = [version, ...existing]
      if (merged.length > 50) {
        const manual = merged.filter(v => v.type === 'manual')
        const auto = merged.filter(v => v.type !== 'manual')
        // 手动版本全留（最多 50），其余名额按时间顺序补给自动版本
        doc.versions = [...manual.slice(0, 50), ...auto].slice(0, 50)
      } else {
        doc.versions = merged
      }

      createdId = version.id
      state.lastMutationAt = Date.now()
    })
    return createdId
  },
})