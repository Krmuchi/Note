import type { StateCreator } from 'zustand'
import type { DocVersion } from '@/types'
import type { NotesStore } from '@/store/types'
import { newId } from '@/store/storeUtils'

export interface VersionSlice {
  getDocVersions: (notebookId: string, docId: string) => DocVersion[] | undefined
  restoreVersion: (notebookId: string, docId: string, versionId: string) => void
  /** 手动保存当前文档为版本快照（type: 'manual'，不触发 updateDoc，避免格式刷等逻辑干扰） */
  saveManualVersion: (notebookId: string, docId: string, versionTag?: string) => void
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

  saveManualVersion: (notebookId, docId, versionTag) => {
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
        versionTag: versionTag || '手动快照',
        type: 'manual',
      }
      // 与 auto 快照一致：大文档(>100KB)仅保留 5 份，普通 50 份
      const maxVersions = version.content.length > 100_000 ? 5 : 50
      doc.versions = [version, ...(doc.versions || [])].slice(0, maxVersions)
      // 手动保存不修改内容，不 bump doc.updatedAt（避免干扰"最近编辑"排序与展示）；
      // 仅标记 mutation，确保自动保存把新版本持久化到磁盘
      state.lastMutationAt = Date.now()
    })
  },
})