import type { StateCreator } from 'zustand'
import type { NoteDoc } from '@/types'
import type { NotesStore } from '@/store/types'
import { commitVersions, createVersion } from '@/store/docVersions'

export interface VersionSlice {
  getDocVersions: (notebookId: string, docId: string) => NoteDoc['versions']
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

      /*
       * 恢复是破坏性操作：覆盖前先把当前内容压成一份 manual 快照，保证可再恢复回来。
       *
       * 这份快照必须走 `commitVersions`：旧实现硬编码 `slice(0, 50)`，
       * 绕过了大文档的条数收紧与字节预算 —— 一篇 200KB 的文档恢复一次就多出
       * 50 份全量拷贝，直接撞上 notes:save 的 50MB 上限导致保存永久失败。
       */
      const backup = createVersion(doc, notebookId, {
        type: 'manual',
        versionTag: '恢复前备份',
      })

      doc.title = version.title
      doc.content = version.content
      doc.tags = version.tags
      doc.updatedAt = new Date().toISOString()

      commitVersions(doc, [backup, ...(doc.versions || [])])
      state.lastMutationAt = Date.now()
    })
  },

  createVersionSnapshot: (notebookId, docId, options = {}) => {
    let createdId: string | null = null
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (!doc) return

      const version = createVersion(doc, notebookId, {
        type: 'manual',
        ...(options.tag ? { versionTag: options.tag } : {}),
        ...(options.comment ? { comment: options.comment } : {}),
      })

      // 手动版本排在最前，超出上限时由 commitVersions 优先保留手动版本
      commitVersions(doc, [version, ...(doc.versions || [])])

      createdId = version.id
      state.lastMutationAt = Date.now()
    })
    return createdId
  },
})
