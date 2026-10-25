import { useState, useEffect, useCallback } from "react"
import type { ToastProps, ToastAction } from "./ToastView"
import {
  subscribeToast,
  subscribeToastRemove,
  showToast,
  hideToast,
  toast,
  toastWithUndo,
  type ToastMessage,
} from "@/services/toast"

/*
 * Toast 拆成两层：
 *
 *  - `services/toast.ts`：纯发射器（无 React），hooks / store slice 从这里发提示，
 *    不再反向依赖 UI 组件。
 *  - 本文件：订阅发射器并把提示渲染进 React 树（useToast）。
 *
 * 这里重新导出 toast / toastWithUndo / showToast / hideToast，是为了让既有
 * 组件侧调用点保持一行 import —— 但**非组件模块请直接从 `@/services/toast` 引入**，
 * 否则会把 React 组件模块拖进纯逻辑依赖链。
 */

export type { ToastMessage, ToastAction }
export { toast, toastWithUndo, showToast, hideToast }

let toastId = 0
let toastSeq = 0

/** 同 type+message 在该时间窗内只弹一次，避免连点/连击刷屏 */
const DEDUP_WINDOW = 3000
/** 队列上限，超出丢弃最旧的一条 */
const MAX_TOASTS = 5
const recentToastAt = new Map<string, number>()

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

    const id = `toast-${++toastId}-${++toastSeq}`
    setToasts((prev) => {
      const next = [...prev, { ...message, id, onClose: removeToast }]
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next
    })
    return id
  }, [removeToast])

  /*
   * 订阅全局发射器，使 store slice / hooks 等非组件模块也能弹出/关闭提示。
   * 依赖里带 addToast 是刻意的：StrictMode 下 effect 会执行两次（挂载-卸载-挂载），
   * 订阅必须跟着 addToast 的最终引用重新绑定，否则旧监听器仍指向已卸载组件的 setState。
   */
  useEffect(() => {
    const unsubscribe = subscribeToast((message) => addToast(message))
    const unsubscribeRemove = subscribeToastRemove(removeToast)
    return () => {
      unsubscribe()
      unsubscribeRemove()
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
