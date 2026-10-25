import { useState, useEffect, useCallback, useRef, memo } from "react"
import type { CSSProperties, JSX } from "react"
import type { ToastAction, ToastMessage } from "@/services/toast"

/*
 * 类型定义在 services/toast.ts（发射器侧），这里只做渲染。
 * 两处各自声明一份 interface 会在改动时漂移，且发射器与渲染器的
 * duration/action 语义必须完全一致（带 action 的提示停留更久）。
 */
export type { ToastAction }

export interface ToastProps extends ToastMessage {
  id: string
  onClose: (id: string) => void
}

const iconMap = {
  success: "✓",
  error: "✗",
  warning: "⚠️",
  info: "ℹ️",
}

/** 带操作按钮时的最短停留时间：3 秒来不及读完并点击，容易错过撤销入口 */
const MIN_DURATION_WITH_ACTION = 8000

const ToastItemInner = ({ id, type, message, onClose, duration, action }: ToastProps): JSX.Element => {
  const [isExiting, setIsExiting] = useState(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // 有行动按钮时自动延长停留，否则用户来不及点"撤销"
  const effectiveDuration =
    action && (duration === undefined || duration < MIN_DURATION_WITH_ACTION)
      ? MIN_DURATION_WITH_ACTION
      : duration ?? 3000

  useEffect(() => {
    // 统一登记所有定时器，卸载时全部清理，避免退出动画 timer 泄漏
    const timer = setTimeout(() => {
      setIsExiting(true)
      const exitTimer = setTimeout(() => onClose(id), 200)
      timersRef.current.push(exitTimer)
    }, effectiveDuration)
    timersRef.current.push(timer)

    return () => {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
    }
  }, [id, effectiveDuration, onClose])

  const handleClose = useCallback(() => {
    setIsExiting(true)
    setTimeout(() => onClose(id), 200)
  }, [id, onClose])

  const handleAction = useCallback(() => {
    action?.onClick()
    handleClose()
  }, [action, handleClose])

  return (
    <div
      className={`toast toast-${type} ${isExiting ? "exit" : "enter"}`}
      style={{ "--toast-duration": `${effectiveDuration}ms` } as CSSProperties}
    >
      <span className="toast-icon" aria-hidden="true">{iconMap[type]}</span>
      <span className="toast-message">{message}</span>
      {action && (
        <button type="button" className="toast-action" onClick={handleAction}>
          {action.label}
        </button>
      )}
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

export function ToastContainer({ toasts, onClose }: ToastContainerProps): JSX.Element {
  // 错误走 assertive 播报（role=alert），其余保持 polite，避免错误提示被读屏延后
  const assertiveToasts = toasts.filter((toast) => toast.type === "error")
  const politeToasts = toasts.filter((toast) => toast.type !== "error")

  return (
    <div className="toast-container">
      <div className="toast-live-region" role="status" aria-live="polite">
        {politeToasts.map((toast) => (
          <ToastItem key={toast.id} {...toast} onClose={onClose} />
        ))}
      </div>
      <div className="toast-live-region" role="alert" aria-live="assertive">
        {assertiveToasts.map((toast) => (
          <ToastItem key={toast.id} {...toast} onClose={onClose} />
        ))}
      </div>
    </div>
  )
}
