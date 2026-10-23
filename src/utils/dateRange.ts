/**
 * 搜索的快捷时间范围（S3）。
 *
 * 关键点：用**本地日期**拼字符串，而不是 toISOString()。
 * toISOString 是 UTC，东八区下"今天 08:00 之前"会算成昨天，
 * 于是「今天」筛不出当天上午写的东西 —— 这类过滤器一旦不准就没人敢用。
 */

/** 可选快捷范围（天）：1 = 今天，7 = 近 7 天，30 = 近 30 天 */
export const QUICK_RANGE_DAYS = [1, 7, 30] as const

export type QuickRangeDays = (typeof QUICK_RANGE_DAYS)[number]

export const QUICK_RANGE_LABELS: Record<number, string> = {
  1: '今天',
  7: '近 7 天',
  30: '近 30 天',
}

const toLocalDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** 生成 [今天-(days-1), 今天] 的本地日期区间（含首尾） */
export function buildQuickRange(days: number, now: Date = new Date()): { start: string; end: string } {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(end)
  start.setDate(end.getDate() - Math.max(0, days - 1))
  return { start: toLocalDate(start), end: toLocalDate(end) }
}

/** 当前 dateRange 是否正好等于某个快捷范围（用于点亮对应的快捷按钮，手动改日期后自动熄灭） */
export function isQuickRangeActive(
  range: { start?: string; end?: string } | undefined,
  days: number,
  now: Date = new Date(),
): boolean {
  if (!range?.start || !range?.end) return false
  const expected = buildQuickRange(days, now)
  return range.start === expected.start && range.end === expected.end
}
