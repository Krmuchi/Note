/**
 * 全局提示发射器（无 React 依赖）。
 *
 * 为什么在 services 而不是 components：hooks 与 store slice 需要弹提示，
 * 但它们**不该反向依赖 UI 组件** —— 旧实现里 5 个 hooks 直接
 * `import { toast } from '@/components/common/Toast'`，构成层倒置，
 * 也让这些 hook 无法在没有 React 组件树的场景（纯逻辑单测）里使用。
 *
 * 这里只做"发射"，订阅方是 components/common/Toast.tsx 里的 `useToast()`；
 * 真正的渲染（ToastView）仍归 UI 层。
 */

export interface ToastAction {
  /** 按钮文案，如"撤销" */
  label: string
  /** 点击后执行；点击即关闭该提示 */
  onClick: () => void
}

export interface ToastMessage {
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
  /** 可选的行动按钮（如"撤销"）；带按钮时停留时间自动延长 */
  action?: ToastAction
}

type ToastListener = (message: ToastMessage) => string
type ToastRemoveListener = (id: string) => void

const toastListeners = new Set<ToastListener>()
const toastRemoveListeners = new Set<ToastRemoveListener>()

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

/** 订阅发射器（由 useToast 调用）；返回取消订阅函数 */
export function subscribeToast(listener: ToastListener): () => void {
  toastListeners.add(listener)
  return () => {
    toastListeners.delete(listener)
  }
}

/** 订阅"按 id 关闭"（由 useToast 调用）；返回取消订阅函数 */
export function subscribeToastRemove(listener: ToastRemoveListener): () => void {
  toastRemoveListeners.add(listener)
  return () => {
    toastRemoveListeners.delete(listener)
  }
}

/** 全局 Toast 便捷方法 */
export const toast = {
  success: (message: string, duration?: number, action?: ToastAction) =>
    showToast({ type: 'success', message, duration, action }),
  error: (message: string, duration?: number) => showToast({ type: 'error', message, duration }),
  warning: (message: string, duration?: number) => showToast({ type: 'warning', message, duration }),
  info: (message: string, duration?: number) => showToast({ type: 'info', message, duration }),
}

/** 带"撤销"按钮的成功提示：批量操作的统一回执方式 */
export const toastWithUndo = (message: string, onUndo: () => void): void => {
  showToast({ type: 'success', message, action: { label: '撤销', onClick: onUndo } })
}
