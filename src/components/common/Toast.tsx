import { useState, useEffect, useCallback } from "react"
import type { ToastProps, ToastAction } from "./ToastView"

let toastId = 0

export interface ToastMessage {
  type: "success" | "error" | "warning" | "info"
  message: string
  duration?: number
  /** 可选的行动按钮（如"撤销"）；带按钮时停留时间自动延长 */
  action?: ToastAction
}

type ToastListener = (message: ToastMessage) => string
type ToastRemoveListener = (id: string) => void

const toastListeners = new Set<ToastListener>()
const toastRemoveListeners = new Set<ToastRemoveListener>()

/** 同 type+message 在该时间窗内只弹一次，避免连点/连击刷屏 */
const DEDUP_WINDOW = 3000
/** 队列上限，超出丢弃最旧的一条 */
const MAX_TOASTS = 5
const recentToastAt = new Map<string, number>()

/** 弹出提示并返回 id（可配合 hideToast 提前关闭），供"进行中"类提示使用 */
export function showToast(message: ToastMessage): string {
  let id = ''
  toastListeners.forEach((listener) => {
    id = listener(message) || id
  })
  return id
}

/** 按 id 提前关闭提示（用于"进行中"提示在操作结束时消失） */
export function hideToast(id: string): void {
  if (!id) return
  toastRemoveListeners.forEach((listener) => listener(id))
}

/** 全局 Toast 发射器：供 store slice / hooks 等非组件模块使用 */
export function emitToast(message: ToastMessage): void {
  showToast(message)
}

/** 全局 Toast 便捷方法 */
export const toast = {
  success: (message: string, duration?: number, action?: ToastAction) =>
    emitToast({ type: "success", message, duration, action }),
  error: (message: string, duration?: number) => emitToast({ type: "error", message, duration }),
  warning: (message: string, duration?: number) => emitToast({ type: "warning", message, duration }),
  info: (message: string, duration?: number) => emitToast({ type: "info", message, duration }),
}

/** 带"撤销"按钮的成功提示：批量操作的统一回执方式 */
export const toastWithUndo = (message: string, onUndo: () => void): void => {
  emitToast({ type: "success", message, action: { label: "撤销", onClick: onUndo } })
}

export function useToast(): {
  toasts: ToastProps[]
  addToast: (message: ToastMessage) => string
  removeToast: (id: string) => void
  success: (message: string, duration?: number) => string
  error: (message: string, duration?: number) => string
  warning: (message: string, duration?: number) => string
  info: (message: string, duration?: number) => string
} {
  const [toasts, setToasts] = useState<ToastProps[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const addToast = useCallback((message: ToastMessage) => {
    const now = Date.now()
    const dedupKey = `${message.type}:${message.message}`
    const lastAt = recentToastAt.get(dedupKey)
    if (lastAt !== undefined && now - lastAt < DEDUP_WINDOW) return ''
    // 顺手清理过期计时，避免长时间运行后 Map 无界增长
    if (recentToastAt.size > 100) {
      recentToastAt.forEach((at, key) => {
        if (now - at >= DEDUP_WINDOW) recentToastAt.delete(key)
      })
    }
    recentToastAt.set(dedupKey, now)

    const id = `toast-${++toastId}`
    setToasts((prev) => {
      const next = [...prev, { ...message, id, onClose: removeToast }]
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next
    })
    return id
  }, [removeToast])

  // 订阅全局 Toast 发射器，使 store slice / hooks 等非组件模块也能弹出/关闭提示
  useEffect(() => {
    const listener: ToastListener = (message) => addToast(message)
    toastListeners.add(listener)
    toastRemoveListeners.add(removeToast)
    return () => {
      toastListeners.delete(listener)
      toastRemoveListeners.delete(removeToast)
    }
  }, [addToast, removeToast])

  const success = useCallback((message: string, duration?: number) => {
    return addToast({ type: "success", message, duration })
  }, [addToast])

  const error = useCallback((message: string, duration?: number) => {
    return addToast({ type: "error", message, duration })
  }, [addToast])

  const warning = useCallback((message: string, duration?: number) => {
    return addToast({ type: "warning", message, duration })
  }, [addToast])

  const info = useCallback((message: string, duration?: number) => {
    return addToast({ type: "info", message, duration })
  }, [addToast])

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
  }
}