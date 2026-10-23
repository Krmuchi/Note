/**
 * 大纲"当前章节"计算（纯逻辑，便于单测）。
 *
 * 语雀的大纲会跟随阅读位置高亮当前标题；本项目旧实现只渲染标题树，
 * 长文档里用户翻到中间时无法从大纲判断"现在在哪一节"。
 *
 * 这里只做"字符偏移 → 所属标题"的映射：取偏移之前**最后一个**标题。
 * 不依赖 DOM 或滚动像素，因此不受字号、软换行影响。
 */

export interface OutlineHeadingLike {
  id: string
  level: number
  /** 标题在正文中的字符偏移 */
  position: number
}

/**
 * 找出光标/阅读位置所属的标题 id。
 *
 * @param headings 按 position 升序排列的标题列表
 * @param position 当前字符偏移（通常是光标位置）
 * @returns 所属标题的 id；在第一个标题之前时返回 null（此时不属于任何章节）
 */
export function findActiveHeadingId(
  headings: OutlineHeadingLike[],
  position: number,
): string | null {
  if (headings.length === 0) return null
  if (!Number.isFinite(position) || position < 0) return null

  let active: string | null = null
  for (const heading of headings) {
    // 标题必须严格位于当前位置之前（含标题自身起点）
    if (heading.position > position) break
    active = heading.id
  }
  return active
}

/**
 * 由"可见行号"换算字符偏移：用于大纲跟随**滚动位置**而非光标。
 * 滚动是用户阅读的主要动作，光标可能停在别处不动。
 */
export function lineIndexToOffset(content: string, lineIndex: number): number {
  if (lineIndex <= 0) return 0
  const lines = content.split('\n')
  if (lineIndex >= lines.length) return content.length

  let offset = 0
  for (let i = 0; i < lineIndex; i++) {
    offset += lines[i].length + 1 // +1 补回换行符
  }
  return offset
}

/**
 * 由 textarea 的 scrollTop 估算当前顶部的行号。
 * lineHeight 为 0 或非法时返回 0，避免除零得到 Infinity。
 */
export function scrollTopToLineIndex(scrollTop: number, lineHeight: number): number {
  if (!Number.isFinite(scrollTop) || scrollTop <= 0) return 0
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return 0
  return Math.floor(scrollTop / lineHeight)
}

/** 与 DocumentOutline 一致的标题 id 生成规则（层级 + 文本，重名追加序号） */
export function collectOutlineHeadings(content: string): OutlineHeadingLike[] {
  if (!content) return []
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  const headings: OutlineHeadingLike[] = []
  const seen = new Map<string, number>()
  let match: RegExpExecArray | null

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length
    const text = match[2].trim()
    const base = `${level}-${text}`
    const occurrence = seen.get(base) ?? 0
    seen.set(base, occurrence + 1)
    headings.push({
      id: occurrence === 0 ? base : `${base}~${occurrence}`,
      level,
      position: match.index,
    })
  }

  return headings
}
