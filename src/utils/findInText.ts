/**
 * 文档内查找的纯逻辑（BUG-3）。
 *
 * 编辑器是 textarea：DOM 无法给"全部命中"加高亮（没有富文本层），
 * 所以采用"选中当前命中 + 滚动到视口"的方案 —— 尽早在预览/渲染层之外
 * 提供可用的查找能力，不引入自绘高亮层的对齐风险。
 */

export interface FindMatch {
  index: number
  length: number
}

/** 找出全部匹配（不重叠，按出现顺序） */
export function findAllMatches(text: string, query: string, caseSensitive = false): FindMatch[] {
  if (!query) return []

  const haystack = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  if (!needle) return []

  const matches: FindMatch[] = []
  let from = 0
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from)
    if (index === -1) break
    matches.push({ index, length: query.length })
    // 跳过本次命中，避免 "aa" 在 "aaa" 中产生重叠匹配导致替换逻辑混乱
    from = index + needle.length
  }
  return matches
}

/** 文本偏移 → 行号（0 基） */
export function lineIndexAt(text: string, index: number): number {
  let line = 0
  const end = Math.min(index, text.length)
  for (let i = 0; i < end; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

/**
 * 把某一行滚动进视口所需的 scrollTop。
 * 目标行放在视口 1/3 处而不是正中：上下文更完整，连续按"下一个"时跳动也更可预期。
 */
export function computeScrollTop(lineIndex: number, lineHeight: number, viewportHeight: number): number {
  return Math.max(0, lineIndex * lineHeight - viewportHeight / 3)
}

/** 读取 textarea 的实际行高（lineHeight 可能是 'normal'，退回字号 × 1.6） */
export function measureLineHeight(ta: HTMLTextAreaElement): number {
  const style = window.getComputedStyle(ta)
  const fontSize = parseFloat(style.fontSize) || 15
  return parseFloat(style.lineHeight) || fontSize * 1.6
}

/**
 * 把全部匹配替换为 replacement，返回新文本。
 * 一次性按匹配区间拼接，避免"边替换边查找"造成的自我递归替换。
 */
export function replaceAllMatches(text: string, matches: FindMatch[], replacement: string): string {
  if (matches.length === 0) return text
  let result = ''
  let cursor = 0
  for (const match of matches) {
    result += text.slice(cursor, match.index) + replacement
    cursor = match.index + match.length
  }
  return result + text.slice(cursor)
}
