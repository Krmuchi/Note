/**
 * 极简模糊匹配（快速打开用）。
 *
 * 只做「完全相等 / 前缀 / 子串 / 字符子序列」四档打分，不引入依赖：
 * 中文标题下用户通常直接输入汉字，拉丁标题或代码式缩写（如 `rdme` → README）走子序列。
 *
 * 拼音首字母匹配（体验优化方案 S6）需要一张拼音表或额外依赖，尚未实现 ——
 * 与其硬塞一张可能写错的表，不如先不做。
 */

export function fuzzyScore(text: string, query: string): number {
  const target = text.toLowerCase()
  const q = query.trim().toLowerCase()
  if (!q) return 1

  if (target === q) return 1000

  const index = target.indexOf(q)
  if (index === 0) return 900
  if (index > 0) return 800 - Math.min(index, 199)

  // 字符子序列：按顺序出现即可，间隔越多分越低
  let cursor = 0
  let gaps = 0
  let lastHit = -1
  for (let i = 0; i < target.length && cursor < q.length; i++) {
    if (target[i] !== q[cursor]) continue
    if (lastHit >= 0) gaps += i - lastHit - 1
    lastHit = i
    cursor++
  }

  if (cursor === q.length) return Math.max(1, 300 - Math.min(gaps, 299))
  return 0
}
