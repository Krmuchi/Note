import type { NoteDoc } from '@/types'

/**
 * 文档树排序策略（体验优化方案 T2）。
 *
 * 置顶（pinned）在**所有**模式下都排在最前：它是用户显式表达的顺序意图，
 * 不应该被"按时间/按标题"打乱。
 */

export type DocSortMode = 'updated' | 'manual' | 'title'

export const DOC_SORT_MODES: { id: DocSortMode; label: string }[] = [
  { id: 'updated', label: '按修改时间' },
  { id: 'manual', label: '手动排序' },
  { id: 'title', label: '按标题' },
]

export const DOC_SORT_STORAGE_KEY = 'notes-doc-sort'

const VALID_MODES = DOC_SORT_MODES.map((m) => m.id)

export function readDocSortMode(): DocSortMode {
  try {
    const saved = localStorage.getItem(DOC_SORT_STORAGE_KEY)
    if (saved && (VALID_MODES as string[]).includes(saved)) return saved as DocSortMode
  } catch {
    /* 存储不可用时用默认值 */
  }
  return 'updated'
}

export function writeDocSortMode(mode: DocSortMode): void {
  try {
    localStorage.setItem(DOC_SORT_STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

/** updatedAt 解析缓存：排序比较里反复 new Date() 解析 ISO 字符串开销不小 */
const updatedAtCache = new WeakMap<NoteDoc, number>()

export function getUpdatedTime(doc: NoteDoc): number {
  let cached = updatedAtCache.get(doc)
  if (cached === undefined) {
    cached = new Date(doc.updatedAt).getTime()
    updatedAtCache.set(doc, cached)
  }
  return cached
}

const pinnedFirst = (a: NoteDoc, b: NoteDoc): number =>
  Number(b.pinned ?? false) - Number(a.pinned ?? false)

/** 只做排序，不改动原数组（返回新数组） */
export function sortDocs(docs: NoteDoc[], mode: DocSortMode): NoteDoc[] {
  const next = [...docs]

  if (mode === 'manual') {
    // Array.prototype.sort 在现代 V8 是稳定排序：同 pinned 状态下保持数组原顺序，
    // 也就是拖拽排序维护出来的顺序
    return next.sort(pinnedFirst)
  }

  if (mode === 'title') {
    // localeCompare('zh-CN') 让中文按拼音排序，而不是按 UTF-16 码位
    return next.sort((a, b) => pinnedFirst(a, b) || a.title.localeCompare(b.title, 'zh-CN'))
  }

  return next.sort((a, b) => pinnedFirst(a, b) || getUpdatedTime(b) - getUpdatedTime(a))
}

/**
 * 「文档自身是否命中当前筛选」的唯一判定（标题包含 + 标签与关系）。
 *
 * P0-2：文档树要按**全层级**过滤 —— 逐层 filter 只能筛掉当前层，
 * 折叠的子孙永远不会被看到，因此树会先用本函数算出"自身命中"集合，
 * 再沿父子关系补齐祖先；filterAndSortDocs 也必须走同一份判定，
 * 否则"树上看到的"与"过滤依据的"会随实现漂移。
 */
export function docMatchesFilters(doc: NoteDoc, searchText: string, tagIds: string[] = []): boolean {
  const query = searchText.trim().toLowerCase()
  if (query && !doc.title.toLowerCase().includes(query)) return false
  if (tagIds.length > 0) {
    const docTags = doc.tags ?? []
    if (!tagIds.every((tagId) => docTags.includes(tagId))) return false
  }
  return true
}

/**
 * 搜索过滤（标题匹配）+ 标签过滤 + 排序，文档树与虚拟化列表共用。
 * 标签是"与"关系：选了多个标签时，文档需要同时带上这些标签才留下。
 */
export function filterAndSortDocs(
  docs: NoteDoc[],
  searchText: string,
  mode: DocSortMode,
  tagIds: string[] = [],
): NoteDoc[] {
  return sortDocs(
    docs.filter((doc) => docMatchesFilters(doc, searchText, tagIds)),
    mode,
  )
}

/* ============================================================
   树结构工具（P0-3 跨库移动 / P1-13 批量移动去重 共用）
   ============================================================ */

/**
 * 收集 rootId 及其全部后代的 id。
 * 防环：parentId 成环的脏数据（A→B→A）靠 result 去重兜住，不会死循环。
 */
export function collectSubtreeIds(docs: NoteDoc[], rootId: string): Set<string> {
  const result = new Set<string>([rootId])
  const childrenByParent = new Map<string, NoteDoc[]>()
  for (const doc of docs) {
    const key = doc.parentId ?? ''
    const bucket = childrenByParent.get(key)
    if (bucket) bucket.push(doc)
    else childrenByParent.set(key, [doc])
  }

  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop() as string
    for (const child of childrenByParent.get(id) ?? []) {
      if (result.has(child.id)) continue
      result.add(child.id)
      stack.push(child.id)
    }
  }
  return result
}

/**
 * 批量选择里的"父子同选"去重：祖先已在集合中时丢掉后代 ——
 * 否则跨库移动会先搬走父、再搬一次已不存在的子（或把子丢在原库）。
 * 返回值保持入参顺序，界面提示的"移动 N 篇"因此与实际一致。
 */
export function dedupeToTopLevel(ids: string[], docs: NoteDoc[]): string[] {
  const selected = new Set(ids)
  const byId = new Map(docs.map((doc) => [doc.id, doc]))

  return ids.filter((id) => {
    let parentId = byId.get(id)?.parentId ?? null
    const seen = new Set<string>()
    while (parentId) {
      if (selected.has(parentId)) return false
      if (seen.has(parentId)) break
      seen.add(parentId)
      parentId = byId.get(parentId)?.parentId ?? null
    }
    return true
  })
}
