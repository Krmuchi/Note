import type { CommentAnchor } from '@/types'

/**
 * 划词评论锚点的重定位（纯逻辑，便于单测）。
 *
 * 问题：锚点存的是**字符区间**，但用户在评论之后继续编辑文档时区间会漂移 ——
 * 在评论之前插入一段文字，后面所有锚点都会整体后移；删除则前移。
 * 如果直接用旧区间去高亮/跳转，就会指到完全无关的段落。
 *
 * 策略（从精确到宽松，命中即返回）：
 * 1. 区间处文本仍等于 quote → 完全命中，直接返回；
 * 2. 在全文里重新查找 quote（优先离原位置最近的）→ 覆盖"整体位移"的情况；
 * 3. 都找不到 → 认为锚点已失效，返回 null，由调用方显示为普通评论。
 *
 * 刻意**不做**模糊匹配：把评论锚到一段并非用户选中的文字上，
 * 比不锚定更糟 —— 用户会以为评论指向了错误的内容。
 */

/** 在全文里查找 quote，返回离原位置最近的命中起点；没有则返回 -1 */
export function findNearestOccurrence(text: string, quote: string, nearIndex: number): number {
  if (!quote) return -1

  let bestIndex = -1
  let bestDistance = Number.POSITIVE_INFINITY
  let from = 0

  while (from <= text.length - quote.length) {
    const found = text.indexOf(quote, from)
    if (found === -1) break

    const distance = Math.abs(found - nearIndex)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = found
    }
    // 继续找：可能存在更靠近原位置的重复出现
    from = found + 1
  }

  return bestIndex
}

/** 解析后的锚点：区间 + 是否仍精确（用于界面区分"原文"与"已移动"） */
export interface ResolvedAnchor {
  start: number
  end: number
  quote: string
  /** true = 原区间仍有效；false = 通过重新查找找回 */
  exact: boolean
}

/**
 * 在当前正文中解析锚点。
 * @returns 解析结果；锚点已失效（原文被删/改）时返回 null
 */
export function resolveAnchor(text: string, anchor: CommentAnchor): ResolvedAnchor | null {
  const { start, end, quote } = anchor
  if (!quote) return null
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null

  // 1. 原区间仍然对得上（最常见：评论后没有编辑过这段）
  if (
    start >= 0 &&
    end <= text.length &&
    end > start &&
    text.slice(start, end) === quote
  ) {
    return { start, end, quote, exact: true }
  }

  // 2. 区间漂移了：按原文重新查找离原位置最近的一处
  const found = findNearestOccurrence(text, quote, start)
  if (found === -1) return null

  return { start: found, end: found + quote.length, quote, exact: false }
}

/**
 * 锚点 quote 的最大长度。
 *
 * 划词可以选多长都行，但把整段正文抄进每条评论的 anchor 里会显著放大存储
 * （评论多、文档长时是平方级增长）。500 字足以在区间漂移后唯一定位，
 * 再长也不会更准 —— 超长选区只保留前 500 字，界面展示时同样截断。
 */
export const MAX_ANCHOR_QUOTE_LENGTH = 500

/** 把 textarea 的选区转成锚点（空选区返回 null） */
export function anchorFromSelection(text: string, start: number, end: number): CommentAnchor | null {
  if (start === end) return null
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  if (from < 0 || to > text.length || to <= from) return null

  const raw = text.slice(from, to)
  // 超长选区只存前 N 字：区间仍指向完整选区，但 quote 不再无限膨胀
  const quote = raw.length > MAX_ANCHOR_QUOTE_LENGTH
    ? raw.slice(0, MAX_ANCHOR_QUOTE_LENGTH)
    : raw

  return { start: from, end: to, quote }
}
