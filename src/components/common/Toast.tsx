import { useState, useEffect, useCallback, useRef, memo } from "react"

export interface ToastProps {
  id: string
  type: "success" | "error" | "warning" | "info"
  message: string
  onClose: (id: string) => void
  duration?: number
}

const iconMap = {
  success: "✓",
  error: "✗",
  warning: "⚠️",
  info: "ℹ️",
}

const ToastItemInner = ({ id, type, message, onClose, duration = 3000 }: ToastProps): import('react').ReactElement => {
  const [isExiting, setIsExiting] = useState(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    // 统一登记所有定时器，卸载时全部清理，避免退出动画 timer 泄漏
    const timer = setTimeout(() => {
      setIsExiting(true)
      const exitTimer = setTimeout(() => onClose(id), 200)
      timersRef.current.push(exitTimer)
    }, duration)
    timersRef.current.push(timer)

    return () => {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
    }
  }, [id, duration, onClose])

  const handleClose = useCallback(() => {
    setIsExiting(true)
    setTimeout(() => onClose(id), 200)
  }, [id, onClose])

  return (
    <div className={`toast toast-${type} ${isExiting ? "exit" : "enter"}`}>
      <span className="toast-icon" aria-hidden="true">{iconMap[type]}</span>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={handleClose} aria-label="关闭提示">
        ×
      </button>
    </div>
  )
}

export const ToastItem = memo(ToastItemInner)

export interface ToastContainerProps {
  toasts: ToastProps[]
  onClose: (id: string) => void
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps): import('react').ReactElement {
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} {...toast} onClose={onClose} />
      ))}
    </div>
  )
}

let toastId = 0

export interface ToastMessage {
  type: "success" | "error" | "warning" | "info"
  message: string
  duration?: number
}

type ToastListener = (message: ToastMessage) => void

const toastListeners = new Set<ToastListener>()

/** 全局 Toast 发射器：供 store slice / hooks 等非组件模块使用 */
export function emitToast(message: ToastMessage): void {
  toastListeners.forEach((listener) => listener(message))
}

/** 全局 Toast 便捷方法 */
export const toast = {
  success: (message: string, duration?: number) => emitToast({ type: "success", message, duration }),
  error: (message: string, duration?: number) => emitToast({ type: "error", message, duration }),
  warning: (message: string, duration?: number) => emitToast({ type: "warning", message, duration }),
  info: (message: string, duration?: number) => emitToast({ type: "info", message, duration }),
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
    const id = `toast-${++toastId}`
    setToasts((prev) => [...prev, { ...message, id, onClose: removeToast }])
    return id
  }, [removeToast])

  // 订阅全局 Toast 发射器，使 store slice / hooks 等非组件模块也能弹出提示
  useEffect(() => {
    const listener: ToastListener = (message) => addToast(message)
    toastListeners.add(listener)
    return () => {
      toastListeners.delete(listener)
    }
  }, [addToast])

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