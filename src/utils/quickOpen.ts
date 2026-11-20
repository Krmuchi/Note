import type { Notebook } from '@/types'
import { flattenDocs, type DocRef } from '@/utils/docNavigation'
import { fuzzyScore, prebuildPinyinForms } from '@/utils/fuzzyMatch'

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

/**
 * 每次排序允许**同步**补建的拼音条目上限（S6 性能）。
 * 1000 篇标题全量建索引约 300~800ms，以前整段发生在首键击键路径上；
 * 现在每次排序最多补建 200 条，其余交给 QuickOpenPanel 打开时的空闲预构建，
 * 缓存补齐后（同一个面板生命周期内）击键不再有任何建索引成本。
 */
export const PINYIN_BUILD_BUDGET = 200

/** 没有输入时展示"最近编辑"，有输入时按模糊得分排序（同分再看更新时间） */
export function rankQuickOpenItems(
  items: QuickOpenItem[],
  query: string,
  limit = 20,
  pinyinBuildBudget = PINYIN_BUILD_BUDGET,
): QuickOpenItem[] {
  const trimmed = query.trim()

  if (!trimmed) {
    return [...items]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit)
  }

  /*
   * 拼音索引补建（有界、同步）：只补未缓存的汉字串，标题先于路径（标题权重更高）。
   * 查询含汉字时拼音通道不会参与打分，直接跳过这一步。
   */
  if (pinyinBuildBudget > 0 && /[a-z0-9]/.test(trimmed)) {
    const texts: string[] = []
    for (const item of items) texts.push(item.title)
    for (const item of items) texts.push(item.context)
    prebuildPinyinForms(texts, pinyinBuildBudget)
  }

  const scored: { item: QuickOpenItem; score: number }[] = []
  for (const item of items) {
    // 标题优先；标题不命中时再看层级路径（"学习笔记 › 英语" 这类定位）。
    // 打分只读拼音缓存（cacheOnlyPinyin）：预算之外的条目本次按原文打分，
    // 首键成本有上界，拼音命中随后续击键 / 空闲预构建补齐。
    const score = Math.max(
      fuzzyScore(item.title, trimmed, { cacheOnlyPinyin: true }),
      Math.floor(fuzzyScore(item.context, trimmed, { cacheOnlyPinyin: true }) / 2),
    )
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
