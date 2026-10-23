import { onBackupCreated } from '@/services/storage'

/**
 * 备份状态展示（体验优化方案 R4）。
 * 主进程只在保存成功且过了节流窗口时推送 backup:created；
 * 这里把"读 localStorage + 订阅推送"收敛到一处，避免侧栏与设置各写一份。
 */

export const LAST_BACKUP_KEY = 'notes-last-backup-at'

export function readLastBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY)
  } catch {
    return null
  }
}

export function writeLastBackupAt(iso: string): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, iso)
  } catch {
    /* 存储不可用时仅内存态生效 */
  }
}

/** 订阅"自动备份完成"；返回取消订阅函数，并同步回写 localStorage */
export function watchLastBackupAt(callback: (iso: string) => void): () => void {
  return onBackupCreated((info) => {
    writeLastBackupAt(info.at)
    callback(info.at)
  })
}

/** 备份时间显示：当天只显示时分，跨天带上日期 */
export function formatBackupTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const isToday = date.toDateString() === new Date().toDateString()
  return isToday
    ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function formatBackupSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
