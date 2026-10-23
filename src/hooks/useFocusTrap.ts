import { useEffect, useRef, type RefObject } from 'react'

/**
 * 弹窗焦点陷阱（A2）。
 *
 * 此前：弹窗只处理了 Esc 与"打开时自动聚焦某个按钮"，但 Tab 会一路跑到背后的页面上去 ——
 * 键盘/读屏用户会"迷路"在看不见的控件之间。
 *
 * 这里做两件事：
 * 1. Tab / Shift+Tab 在弹窗内循环；
 * 2. 关闭时把焦点还给打开弹窗的那个元素（焦点归还是常被忽略、但体感差别很大的一点）。
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useFocusTrap<T extends HTMLElement>(active = true): RefObject<T | null> {
  const containerRef = useRef<T | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

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

    const handleKeyDown = (event: KeyboardEvent): void => {
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
