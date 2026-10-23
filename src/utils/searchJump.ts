/**
 * 搜索结果 → 文档内定位的跨组件通道（S1）。
 *
 * 搜索面板与编辑器相隔 AppPanels / MainContent 多层，为此层层透传 props 得不偿失；
 * 沿用本项目已有的模块级事件模式（toast / confirmAction / onboarding 都是这么做的）。
 */

export interface SearchJumpRequest {
  docId: string
  notebookId?: string
  /** 用于在文档内定位的关键词（调用方应先用 getPrimarySearchTerm 剔除 -排除词） */
  query: string
}

let pending: SearchJumpRequest | null = null
const listeners = new Set<() => void>()

export function requestSearchJump(request: SearchJumpRequest): void {
  if (!request.query) return
  pending = { ...request }
  listeners.forEach((listener) => listener())
}

export function subscribeSearchJump(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 取出并清空与 docId 匹配的待处理跳转。
 * 只匹配同一篇文档：用户点了 A 的结果、却先打开了 B 时，
 * 不应该把 A 的关键词强加给 B。
 */
export function consumeSearchJump(docId: string): string | null {
  if (!pending || pending.docId !== docId || !pending.query) return null
  const query = pending.query
  pending = null
  return query
}

/** 仅测试用 */
export function resetSearchJump(): void {
  pending = null
}
