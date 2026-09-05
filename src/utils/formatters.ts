/**
 * 时间格式化工具
 * 统一替换散落在各组件中重复实现的相对时间格式化逻辑。
 */

type DateInput = string | number | Date

/** 解析为 Date，非法输入返回 null（避免 Invalid Date 参与比较） */
function toDate(input: DateInput): Date | null {
  const date = input instanceof Date ? input : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * 相对时间（粒度到分钟）：刚刚 / N分钟前 / N小时前 / N天前 / N周前 / M月D日
 */
export function formatRelativeTime(input: DateInput): string {
  const date = toDate(input)
  if (!date) return ''

  const diff = Date.now() - date.getTime()
  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}小时前`

  const days = Math.floor(diff / DAY)
  if (days < 7) return `${days}天前`
  if (days < 30) return `${Math.floor(days / 7)}周前`
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export interface DateTimeFormatOptions {
  /** 今天的显示是否带"今天"前缀 */
  prefixToday?: boolean
  /** 昨天的显示是否带"昨天"前缀 */
  prefixYesterday?: boolean
  /** 超过一周的兜底显示是否带时间 */
  fallbackWithTime?: boolean
}

/**
 * 日期时间显示：今天 HH:mm / 昨天 HH:mm / N天前 / N周前 / M-D
 */
export function formatDateTime(input: DateInput, options: DateTimeFormatOptions = {}): string {
  const { prefixToday = false, prefixYesterday = true, fallbackWithTime = false } = options
  const date = toDate(input)
  if (!date) return ''

  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  // 按自然日比较，避免"今天凌晨 1 点"被算成昨天
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTarget = new Date(date)
  startOfTarget.setHours(0, 0, 0, 0)
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / DAY)

  if (diffDays <= 0) return prefixToday ? `今天 ${time}` : time
  if (diffDays === 1) return prefixYesterday ? '昨天' : '昨天 ' + time
  if (diffDays < 7) return `${diffDays}天前`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`

  return fallbackWithTime
    ? `${date.getMonth() + 1}/${pad2(date.getDate())} ${time}`
    : date.toLocaleDateString('zh-CN')
}
