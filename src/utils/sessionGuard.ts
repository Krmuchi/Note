/**
 * 异常退出检测（体验优化方案 R6）。
 *
 * 草稿恢复只能覆盖"有未落盘改动"的情况；进程被杀 / 崩溃 / 断电这类退出
 * 之前是完全没有信号的。这里用一个 localStorage 标记：
 * 启动时置"运行中"，正常退出前置"已清理"，下次启动读到"运行中"即说明上次异常退出。
 */

const SESSION_KEY = 'notes-session-active'

export const SESSION_ACTIVE = '1'
export const SESSION_CLEAN = '0'

/**
 * 开始本次会话。
 * @returns 上次是否异常退出（true 表示上次没有走到正常退出流程）
 */
export function beginSession(): boolean {
  try {
    const abnormal = localStorage.getItem(SESSION_KEY) === SESSION_ACTIVE
    localStorage.setItem(SESSION_KEY, SESSION_ACTIVE)
    return abnormal
  } catch {
    // 存储不可用时无法判断，宁可当作正常退出，也不要每次启动都告警
    return false
  }
}

/** 正常退出前调用（beforeunload / 关窗） */
export function endSession(): void {
  try {
    localStorage.setItem(SESSION_KEY, SESSION_CLEAN)
  } catch {
    /* ignore */
  }
}
