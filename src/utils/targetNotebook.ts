import type { Notebook } from '@/types'

/**
 * 新建内容的目标知识库解析：优先当前激活的知识库（用户此刻的上下文），
 * 其次第一个知识库；一个都没有时自动创建「我的知识库」。
 *
 * 背景：侧栏「新建文档」+ 按钮与 Ctrl+N 曾在空库时静默无操作
 * （if (activeNotebookId) 不成立就直接 return），用户点了毫无反应。
 * StartPage 已有同款兜底，这里抽成公共逻辑，所有新建入口共用，避免再次漂移。
 */
export interface TargetNotebookState {
  notebooks: Notebook[]
  activeNotebookId: string
  createNotebook: (title: string) => string
}

export function resolveTargetNotebookId(state: TargetNotebookState): string | null {
  const active = state.notebooks.find((nb) => nb.id === state.activeNotebookId)
  if (active) return active.id
  if (state.notebooks.length > 0) return state.notebooks[0].id
  const created = state.createNotebook('我的知识库')
  return created || null
}
