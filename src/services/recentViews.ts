import type { RecentView } from '@/types'
import { RECENT_VIEWS_KEY } from '@/utils/onboarding'

/**
 * 最近浏览记录（模块级外部 store，沿用 useUIState 的模式）。
 *
 * 为什么下沉：记录动作原先内联在 App.handleViewDoc 里，而收藏视图为了「点文档不跳走」
 * 改用本地打开（只切 activeNotebookId/activeDocId），于是绕过了记录 —— 在收藏里翻阅
 * 的文档不再进「最近」。把记录与视图切换解耦后，任何打开入口都能记录，
 * 且不必强制切回 notebooks 视图。
 */

const MAX_RECENT_VIEWS = 50

function read(): RecentView[] {
  try {
    const saved = localStorage.getItem(RECENT_VIEWS_KEY)
    if (!saved) return []
    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed)) return []
    // 逐项校验：手改/损坏的 localStorage 不该让开始页与最近视图崩掉
    return parsed.filter(
      (v): v is RecentView =>
        Boolean(v) &&
        typeof (v as RecentView).docId === 'string' &&
        typeof (v as RecentView).notebookId === 'string' &&
        typeof (v as RecentView).viewedAt === 'string',
    )
  } catch {
    return []
  }
}

let recentViews: RecentView[] = read()
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => listener())
}

export function getRecentViews(): RecentView[] {
  return recentViews
}

export function subscribeRecentViews(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 记录一次浏览：同文档去重后置顶，超出上限截断；写入失败不影响使用 */
export function recordRecentView(notebookId: string, docId: string): void {
  if (!notebookId || !docId) return
  const filtered = recentViews.filter((v) => !(v.docId === docId && v.notebookId === notebookId))
  recentViews = [
    { docId, notebookId, viewedAt: new Date().toISOString() },
    ...filtered,
  ].slice(0, MAX_RECENT_VIEWS)
  try {
    localStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify(recentViews))
  } catch {
    // storage unavailable：内存态仍然有效
  }
  emit()
}