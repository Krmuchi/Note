/**
 * 多标签页的纯逻辑（对齐语雀：同时打开多篇文档横向切换）。
 *
 * 设计原则：标签只保存 `{ notebookId, docId }` **引用**，不复制文档内容。
 * 文档正文始终只有一份（在 notebooks 里），标签切走再切回来读到的是最新内容 ——
 * 若在此复制正文，编辑器就会出现"标签里是旧内容、store 里是新内容"的双份真相。
 */

export interface OpenTab {
  notebookId: string
  docId: string
}

/** 标签数量上限：超出后按最久未用淘汰（打开过很多文档也不会把标题栏挤爆） */
export const MAX_OPEN_TABS = 12

/** 稳定的标签标识（文档 id 在全局唯一，但仍带上库 id 以防跨库迁移后语义含糊） */
export function tabKey(tab: OpenTab): string {
  return `${tab.notebookId}:${tab.docId}`
}

export function isSameTab(a: OpenTab, b: OpenTab): boolean {
  return a.notebookId === b.notebookId && a.docId === b.docId
}

/**
 * 打开一篇文档：已在列表中就把它移到末尾（最近使用），否则追加。
 * 返回新数组；超过上限时丢弃最旧的标签（数组头部）。
 */
export function openTabInList(tabs: OpenTab[], tab: OpenTab): OpenTab[] {
  if (!tab.notebookId || !tab.docId) return tabs

  const withoutDup = tabs.filter((t) => !isSameTab(t, tab))
  const next = [...withoutDup, tab]
  return next.length > MAX_OPEN_TABS ? next.slice(next.length - MAX_OPEN_TABS) : next
}

/** 关闭一个标签；返回剩余列表 */
export function closeTabInList(tabs: OpenTab[], tab: OpenTab): OpenTab[] {
  return tabs.filter((t) => !isSameTab(t, tab))
}

/**
 * 关闭标签后应该激活哪一个。
 *
 * 规则：优先选**被关闭项之后**的那个（与浏览器一致，用户视觉上"下一个顶上来了"）；
 * 若关闭的是最后一个，则选前一个；列表空了返回 null。
 */
export function pickTabAfterClose(
  tabs: OpenTab[],
  closingTab: OpenTab,
  activeTab: OpenTab | null,
): OpenTab | null {
  if (tabs.length === 0) return null
  const closingIndex = tabs.findIndex((t) => isSameTab(t, closingTab))

  // 关的不是当前标签：当前标签保持不动
  if (!activeTab || !isSameTab(activeTab, closingTab)) return activeTab

  if (closingIndex < 0) return tabs[tabs.length - 1]
  const next = tabs[closingIndex + 1] ?? tabs[closingIndex - 1]
  return next ?? null
}

/**
 * 裁剪失效标签：文档被删除/移动后，标签里可能留着已经不存在的引用。
 * 必须过滤，否则点击标签会打开一篇"幽灵文档"。
 */
export function pruneTabs(
  tabs: OpenTab[],
  exists: (notebookId: string, docId: string) => boolean,
): OpenTab[] {
  return tabs.filter((t) => exists(t.notebookId, t.docId))
}
