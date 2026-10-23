import type { NoteDoc, Notebook } from '@/types'

/** 展平后的文档引用：快速打开、上一篇/下一篇、面包屑共用同一份结构 */
export interface DocRef {
  notebookId: string
  docId: string
  title: string
  notebookTitle: string
  /** 从知识库到当前文档的标题路径（不含知识库名） */
  path: string[]
  updatedAt: string
}

const titleOf = (doc: NoteDoc): string => doc.title || '未命名文档'

/**
 * 按"树的前序"展平全部文档：父文档紧跟它的子文档。
 * 与文档树的视觉顺序一致，这样"下一篇"就是用户眼里的下一行。
 *
 * 两个防御：脏数据里的 parentId 环（seen 去重）与父级已被删除的孤儿文档
 * （结构化遍历走不到它们，末尾兜底补上）—— 否则这些文档会在快速打开里"消失"。
 */
export function flattenDocs(notebooks: Notebook[]): DocRef[] {
  const result: DocRef[] = []

  for (const notebook of notebooks) {
    const childrenOf = new Map<string | null, NoteDoc[]>()
    for (const doc of notebook.docs) {
      const key = doc.parentId ?? null
      const list = childrenOf.get(key)
      if (list) list.push(doc)
      else childrenOf.set(key, [doc])
    }

    const seen = new Set<string>()

    const walk = (parentId: string | null, path: string[]): void => {
      for (const doc of childrenOf.get(parentId) ?? []) {
        if (seen.has(doc.id)) continue
        seen.add(doc.id)
        const nextPath = [...path, titleOf(doc)]
        result.push({
          notebookId: notebook.id,
          docId: doc.id,
          title: titleOf(doc),
          notebookTitle: notebook.title,
          path: nextPath,
          updatedAt: doc.updatedAt,
        })
        walk(doc.id, nextPath)
      }
    }

    walk(null, [])

    for (const doc of notebook.docs) {
      if (seen.has(doc.id)) continue
      seen.add(doc.id)
      result.push({
        notebookId: notebook.id,
        docId: doc.id,
        title: titleOf(doc),
        notebookTitle: notebook.title,
        path: [titleOf(doc)],
        updatedAt: doc.updatedAt,
      })
    }
  }

  return result
}

/**
 * 取相邻文档（跨知识库连续，符合"下一篇"的直觉）。
 * 调用方按需调用即可（不要在渲染期订阅文档列表），点击时读一次 store 是最省的做法。
 */
export function findAdjacentDoc(
  docs: DocRef[],
  notebookId: string,
  docId: string,
  direction: 'prev' | 'next',
): DocRef | null {
  const index = docs.findIndex((d) => d.notebookId === notebookId && d.docId === docId)
  if (index < 0) return null
  const target = direction === 'prev' ? index - 1 : index + 1
  return docs[target] ?? null
}

export interface Crumb {
  id: string
  title: string
}

/**
 * 面包屑：知识库 › 父文档 › … › 当前文档。
 * 用 parentId 逐级上溯（带环防御），因此成本只与层级深度有关，与文档总数无关。
 */
export function buildDocBreadcrumb(
  notebooks: Notebook[],
  notebookId: string,
  docId: string,
): Crumb[] {
  const notebook = notebooks.find((nb) => nb.id === notebookId)
  if (!notebook) return []

  const crumbs: Crumb[] = [{ id: notebook.id, title: notebook.title }]
  if (!docId) return crumbs

  const byId = new Map(notebook.docs.map((doc) => [doc.id, doc]))
  const chain: Crumb[] = []
  const seen = new Set<string>()

  let cursor = byId.get(docId)
  let depth = 0
  while (cursor && !seen.has(cursor.id) && depth < 50) {
    seen.add(cursor.id)
    chain.unshift({ id: cursor.id, title: titleOf(cursor) })
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    depth++
  }

  return [...crumbs, ...chain]
}

/* ---------------- 打开文档的跨组件通道 ----------------
   面包屑 / 上一篇下一篇 / 快速打开都在编辑器或浮层内部，
   而"打开文档"要经过 App 的 handleViewDoc（记录最近浏览 + 切换视图）。
   沿用 toast / confirmAction / searchJump 的模块级事件模式，避免层层透传 props。 */

export interface DocOpenRequest {
  notebookId: string
  docId: string
}

const openListeners = new Set<(request: DocOpenRequest) => void>()

export function requestDocOpen(request: DocOpenRequest): void {
  if (!request.notebookId || !request.docId) return
  openListeners.forEach((listener) => listener(request))
}

export function subscribeDocOpen(listener: (request: DocOpenRequest) => void): () => void {
  openListeners.add(listener)
  return () => {
    openListeners.delete(listener)
  }
}
