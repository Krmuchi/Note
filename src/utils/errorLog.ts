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

/*
 * 内存缓存（P2-2）。
 *
 * 旧实现 appendErrorLog 每写一条都要 JSON.parse 整个 localStorage + 逐条 normalize，
 * 连续崩溃（每次错误触发一条）时是 O(n²) 的解析开销，而日志最多 50 条，
 * 根本不需要每次都从磁盘重建。
 *
 * - cache：与 cachedRaw 对应的解析结果；null = 还没读过盘。
 * - cachedRaw：最近一次确认读到/写入的磁盘原文。读取时若原文与它不等
 *   （外部直接写了 localStorage、清了 storage、或测试夹具塞数据），
 *   才重新 parse 并刷新缓存 —— 一次 getItem + 字符串比较，
 *   成本远低于每次 JSON.parse，同时把"外部改动"的一致性留在了单窗口应用够用的水平。
 */
let cache: ErrorLogEntry[] | null = null
let cachedRaw: string | null = null

function parseLogs(raw: string | null): ErrorLogEntry[] {
  if (raw === null) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalize).filter((entry): entry is ErrorLogEntry => entry !== null)
  } catch {
    return []
  }
}

/** 读缓存；磁盘原文变了才重新 parse —— 模块里唯一会 JSON.parse 的地方 */
function loadLogs(): ErrorLogEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache === null || raw !== cachedRaw) {
    cache = parseLogs(raw)
    cachedRaw = raw
  }
  return cache
}

export function readErrorLogs(): ErrorLogEntry[] {
  try {
    // 返回副本：调用方随手 push/pop 不会污染缓存（语义与旧实现一致——每次都是新数组）
    return loadLogs().slice()
  } catch {
    return []
  }
}

export function appendErrorLog(entry: Omit<ErrorLogEntry, 'timestamp'> & { timestamp?: string }): void {
  try {
    // 走内存数组：只有这里才 stringify，并且只在成功落盘后更新 cachedRaw，
    // 写失败时缓存里多出来的这条会随下一次原文不等而被磁盘真值覆盖（与旧行为一致）
    const logs = loadLogs()
    logs.push({ ...entry, timestamp: entry.timestamp ?? new Date().toISOString() })
    if (logs.length > MAX_ENTRIES) logs.splice(0, logs.length - MAX_ENTRIES)
    const raw = JSON.stringify(logs)
    localStorage.setItem(STORAGE_KEY, raw)
    cachedRaw = raw
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
  // 磁盘上的状态变了，缓存跟着作废；若 removeItem 实际失败，下一次读到原文又会重新 parse 出旧数据
  cache = []
  cachedRaw = null
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
