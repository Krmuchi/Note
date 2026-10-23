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
 * 搜索过滤（标题匹配）+ 标签过滤 + 排序，文档树与虚拟化列表共用。
 * 标签是"与"关系：选了多个标签时，文档需要同时带上这些标签才留下。
 */
export function filterAndSortDocs(
  docs: NoteDoc[],
  searchText: string,
  mode: DocSortMode,
  tagIds: string[] = [],
): NoteDoc[] {
  const query = searchText.trim().toLowerCase()

  let filtered = docs
  if (query) {
    filtered = filtered.filter((doc) => doc.title.toLowerCase().includes(query))
  }
  if (tagIds.length > 0) {
    filtered = filtered.filter((doc) => {
      const docTags = doc.tags ?? []
      return tagIds.every((tagId) => docTags.includes(tagId))
    })
  }

  return sortDocs(filtered, mode)
}
