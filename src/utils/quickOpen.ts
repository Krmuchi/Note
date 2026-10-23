import type { Notebook } from '@/types'
import { flattenDocs, type DocRef } from '@/utils/docNavigation'
import { fuzzyScore } from '@/utils/fuzzyMatch'

/** 快速打开的候选项：在展平结果上补一个"面包屑文案" */
export interface QuickOpenItem extends DocRef {
  /** 用于列表右侧显示的层级提示，如「学习笔记 › 父文档」 */
  context: string
}

export function buildQuickOpenIndex(notebooks: Notebook[]): QuickOpenItem[] {
  return flattenDocs(notebooks).map((item) => ({
    ...item,
    context: [item.notebookTitle, ...item.path.slice(0, -1)].join(' › '),
  }))
}

/** 没有输入时展示"最近编辑"，有输入时按模糊得分排序（同分再看更新时间） */
export function rankQuickOpenItems(
  items: QuickOpenItem[],
  query: string,
  limit = 20,
): QuickOpenItem[] {
  const trimmed = query.trim()

  if (!trimmed) {
    return [...items]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit)
  }

  const scored: { item: QuickOpenItem; score: number }[] = []
  for (const item of items) {
    // 标题优先；标题不命中时再看层级路径（"学习笔记 › 英语" 这类定位）
    const score = Math.max(fuzzyScore(item.title, trimmed), Math.floor(fuzzyScore(item.context, trimmed) / 2))
    if (score > 0) scored.push({ item, score })
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.item.updatedAt).getTime() - new Date(a.item.updatedAt).getTime(),
    )
    .slice(0, limit)
    .map((s) => s.item)
}
