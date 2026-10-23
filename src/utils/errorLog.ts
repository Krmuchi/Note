/**
 * 运行时错误日志（体验优化方案 R3）。
 *
 * 背景：ErrorBoundary 早就把崩溃写进 localStorage 的 `error-logs`，但**全应用没有读取入口** ——
 * 用户遇到问题时既看不到、也导不出，等于只写不读。这里把读写收敛到一处，
 * 并补上"全局未捕获错误 / 未处理的 Promise 拒绝"两条此前完全没记录的来源。
 */

export type ErrorLogSource = 'render' | 'window' | 'promise'

export interface ErrorLogEntry {
  timestamp: string
  message: string
  stack?: string
  source: ErrorLogSource
}

const STORAGE_KEY = 'error-logs'
const MAX_ENTRIES = 50

/** 兼容早期写入的形状（{ timestamp, error, stack }，没有 source 字段） */
function normalize(raw: unknown): ErrorLogEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const message = typeof item.message === 'string' ? item.message : typeof item.error === 'string' ? item.error : ''
  if (!message) return null
  return {
    timestamp: typeof item.timestamp === 'string' ? item.timestamp : new Date().toISOString(),
    message,
    stack: typeof item.stack === 'string' ? item.stack : undefined,
    source: item.source === 'window' || item.source === 'promise' ? item.source : 'render',
  }
}

export function readErrorLogs(): ErrorLogEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalize).filter((entry): entry is ErrorLogEntry => entry !== null)
  } catch {
    return []
  }
}

export function appendErrorLog(entry: Omit<ErrorLogEntry, 'timestamp'> & { timestamp?: string }): void {
  try {
    const logs = readErrorLogs()
    logs.push({ ...entry, timestamp: entry.timestamp ?? new Date().toISOString() })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_ENTRIES)))
  } catch {
    /* 存储不可用时静默降级：不能因为记日志失败再抛一次错 */
  }
}

export function clearErrorLogs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

const SOURCE_LABELS: Record<ErrorLogSource, string> = {
  render: '渲染崩溃',
  window: '未捕获错误',
  promise: '未处理的 Promise',
}

/** 供"复制诊断信息"与导出使用 */
export function formatErrorLogs(entries: ErrorLogEntry[]): string {
  if (entries.length === 0) return '(没有错误记录)'
  return entries
    .map((entry) => {
      const time = new Date(entry.timestamp).toLocaleString('zh-CN')
      return `[${time}] (${SOURCE_LABELS[entry.source]}) ${entry.message}${entry.stack ? '\n' + entry.stack : ''}`
    })
    .join('\n\n')
}

/**
 * 安装全局错误捕获（main.tsx 调用一次）。
 * 返回卸载函数，便于测试与热更新场景清理。
 */
export function installGlobalErrorLogging(): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleError = (event: ErrorEvent): void => {
    appendErrorLog({
      source: 'window',
      message: event.message || String(event.error ?? '未捕获错误'),
      stack: event.error instanceof Error ? event.error.stack : undefined,
    })
  }

  const handleRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason
    appendErrorLog({
      source: 'promise',
      message: reason instanceof Error ? reason.message : String(reason ?? '未处理的 Promise 拒绝'),
      stack: reason instanceof Error ? reason.stack : undefined,
    })
  }

  window.addEventListener('error', handleError)
  window.addEventListener('unhandledrejection', handleRejection)
  return () => {
    window.removeEventListener('error', handleError)
    window.removeEventListener('unhandledrejection', handleRejection)
  }
}
