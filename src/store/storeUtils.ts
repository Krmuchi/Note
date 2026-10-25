import type { NoteDoc } from '@/types'

/**
 * 按 id 定位活跃文档。
 *
 * 唯一实现：`activeDoc` 曾是一份"缓存副本"，需要在 12 处 action 里手工重算同步，
 * 任何新增的改文档 action 漏同步就会让编辑器显示旧内容且不报错。现在它只有一个
 * 派生入口（`store/index.ts` 的 `selectActiveDoc`），不存在第二份真相。
 */
export const findActiveDoc = (
  notebooks: readonly { id: string; docs: readonly NoteDoc[] }[],
  notebookId: string,
  docId: string,
): NoteDoc | null => {
  if (!notebookId || !docId) return null
  const notebook = notebooks.find((nb) => nb.id === notebookId)
  return notebook?.docs.find((doc) => doc.id === docId) ?? null
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const generateShareUrl = (docId: string, linkId: string): string => {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  // Electron file:// 下 origin 为 "file://"，拼出的链接无意义，回退为相对路径
  if (!origin || !/^https?:/i.test(origin)) {
    return `/share/${docId}/${linkId}`
  }
  return `${origin}/share/${docId}/${linkId}`
}