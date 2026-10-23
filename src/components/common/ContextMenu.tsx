import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent, ReactNode, RefObject } from 'react'

export interface ContextMenuItem {
  id: string
  /** 可访问名即文本内容（图标 aria-hidden，不污染朗读） */
  label: string
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  title?: string
  onSelect: () => void
}

export interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  ariaLabel?: string
  /** 右对齐锚点：下拉菜单贴着触发按钮右缘展开时使用 */
  alignX?: 'left' | 'right'
  /** 触发器容器：其中的 mousedown 不视为"外部点击"，保证点触发器是开关而不是重开 */
  triggerRef?: RefObject<HTMLElement | null>
  /** Esc / 外部点击 / 选中菜单项后触发 */
  onClose: () => void
}

/**
 * 共享右键菜单 / 下拉菜单。
 * 统一补齐此前 4 处内联菜单缺失的可访问性与键盘行为：
 * role=menu(menuitem)、打开聚焦首个可选项、方向键循环、Home/End、Esc 关闭并归还焦点、
 * 视口边界钳制、外部点击关闭。
 */
export function ContextMenu({
  x,
  y,
  items,
  ariaLabel,
  alignX = 'left',
  triggerRef,
  onClose,
}: ContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)
  /** 仅在 Esc / 选中菜单项这类"键盘或意图明确"的关闭时归还焦点；
      外部点击关闭时归还焦点会把用户刚点的元素焦点抢走 */
  const restoreFocusRef = useRef(false)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y })

  // 视口边界钳制：菜单贴边时整体收回可视区，避免超出屏幕无法点到
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 8
    let left = alignX === 'right' ? x - rect.width : x
    let top = y
    if (left + rect.width > window.innerWidth - margin) left = window.innerWidth - rect.width - margin
    if (left < margin) left = margin
    if (top + rect.height > window.innerHeight - margin) top = window.innerHeight - rect.height - margin
    if (top < margin) top = margin
    setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }))
  }, [x, y, alignX, items])

  // 打开时聚焦首个可选项；关闭时（按需）把焦点还给打开前的元素
  useEffect(() => {
    prevFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = menuRef.current?.querySelector<HTMLButtonElement>('button.context-menu-item:not(:disabled)')
    first?.focus()
    return () => {
      if (restoreFocusRef.current) prevFocusRef.current?.focus()
    }
  }, [])

  // 外部点击关闭（mousedown 先于 click，触发器开关逻辑不会被抢先一步关掉再打开）
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (triggerRef?.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose, triggerRef])

  const handleItemSelect = useCallback((item: ContextMenuItem) => {
    if (item.disabled) return
    restoreFocusRef.current = true
    item.onSelect()
    onClose()
  }, [onClose])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button.context-menu-item') ?? [])
    const focusable = buttons.filter((b) => !b.disabled)
    if (focusable.length === 0) return
    const current = focusable.indexOf(document.activeElement as HTMLButtonElement)

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        restoreFocusRef.current = true
        onClose()
        break
      case 'ArrowDown':
        e.preventDefault()
        focusable[(current + 1) % focusable.length]?.focus()
        break
      case 'ArrowUp':
        e.preventDefault()
        focusable[current <= 0 ? focusable.length - 1 : current - 1]?.focus()
        break
      case 'Home':
        e.preventDefault()
        focusable[0]?.focus()
        break
      case 'End':
        e.preventDefault()
        focusable[focusable.length - 1]?.focus()
        break
      case 'Tab':
        // 菜单内不循环 Tab：按标准菜单行为关闭并放行焦点去下一个元素
        onClose()
        break
      default:
        break
    }
  }, [onClose])

  return (
    <div
      className="context-menu"
      role="menu"
      aria-label={ariaLabel}
      ref={menuRef}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={handleKeyDown}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={item.danger ? 'context-menu-item danger' : 'context-menu-item'}
          disabled={item.disabled}
          title={item.title}
          onClick={() => handleItemSelect(item)}
        >
          {item.icon !== undefined && (
            <span className="context-menu-icon" aria-hidden="true">{item.icon}</span>
          )}
          <span className="context-menu-text">{item.label}</span>
        </button>
      ))}
    </div>
  )
}

export default ContextMenu
