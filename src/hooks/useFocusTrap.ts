import { useEffect, useRef, type RefObject } from 'react'

/**
 * 弹窗焦点陷阱（A2）。
 *
 * 此前：弹窗只处理了 Esc 与"打开时自动聚焦某个按钮"，但 Tab 会一路跑到背后的页面上去 ——
 * 键盘/读屏用户会"迷路"在看不见的控件之间。
 *
 * 这里做三件事：
 * 1. **打开时把焦点移入容器**（P1-2）：此前只在容器上挂 Tab 监听，若焦点从未进入容器，
 *    第一次 Tab 的 keydown 发生在 body 上、根本到不了容器 —— 陷阱整场失效。
 *    因此挂载即聚焦容器内第一个可聚焦元素；弹窗自己若有更想聚焦的目标
 *    （如 RecoveryDialog 聚焦"恢复草稿"），其 effect 在本 hook 之后执行，天然覆盖此处的选择。
 * 2. Tab / Shift+Tab 在弹窗内循环；
 * 3. 关闭时把焦点还给打开弹窗的那个元素（焦点归还是常被忽略、但体感差别很大的一点）。
 *
 * 可选 `onEscape`：容器内按 Esc 调用它，并阻断冒泡（capture + stopImmediatePropagation），
 * 与全局 Esc 链分层关闭的既有约定一致 —— 面板自己声明如何关闭，App 不必逐个登记。
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useFocusTrap<T extends HTMLElement>(active = true, onEscape?: () => void): RefObject<T | null> {
  const containerRef = useRef<T | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const onEscapeRef = useRef(onEscape)
  // 渲染期同步最新回调：Esc 处理器只挂一次，但闭包要拿到最新 handler
  useEffect(() => {
    onEscapeRef.current = onEscape
  })

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    // 不用 offsetParent 判断可见性：jsdom 没有布局，offsetParent 恒为 null，会把所有元素都过滤掉
    const getFocusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
      )

    // P1-2：打开即移入焦点。焦点没进容器，容器上的 Tab 监听就永远不会触发
    const initial = getFocusable()
    if (initial.length > 0) initial[0].focus()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        const handler = onEscapeRef.current
        if (!handler) return
        // capture + 阻断：不让全局 Esc 链连带关掉背后的面板（与 RecoveryDialog 同款语义）
        event.stopImmediatePropagation()
        event.preventDefault()
        handler()
        return
      }
      if (event.key !== 'Tab') return
      const items = getFocusable()
      if (items.length === 0) {
        event.preventDefault()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const activeEl = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const inside = activeEl ? container.contains(activeEl) : false

      if (event.shiftKey) {
        if (!inside || activeEl === first) {
          event.preventDefault()
          last.focus()
        }
      } else if (!inside || activeEl === last) {
        event.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      // 卸载（弹窗关闭）后归还焦点；元素可能已从文档移除，focus() 在那种情况下是空操作
      previouslyFocusedRef.current?.focus?.()
    }
  }, [active])

  return containerRef
}