import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { PANEL_LIMITS, useResizableLayout } from '@/hooks/useResizableLayout'
import type React from 'react'

/**
 * 面板调宽的鼠标与触摸路径（A4）。
 * 触屏上 `touchstart/touchmove` 必须走同一套逻辑，否则平板/触屏本完全无法调整面板宽度。
 */

const touchStart = (clientX: number): React.TouchEvent =>
  ({ preventDefault: () => {}, touches: [{ clientX }] }) as unknown as React.TouchEvent

const mouseStart = (clientX: number): React.MouseEvent =>
  ({ preventDefault: () => {}, clientX }) as unknown as React.MouseEvent

function dispatch(type: string, clientX?: number): void {
  const event = new Event(type, { bubbles: true }) as Event & { touches?: Array<{ clientX: number }> }
  if (clientX !== undefined) event.touches = [{ clientX }]
  document.dispatchEvent(event)
}

/**
 * 视口宽度决定 `sidebarCollapsed` 的"自动收起"行为（< BREAKPOINT_WIDE 时默认收起）。
 * jsdom 默认 1024px，会让所有用例都跑在"窄窗口"分支上 —— 显式设成宽屏，
 * 需要验证窄屏行为的用例自己再改。
 */
function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

beforeEach(() => {
  localStorage.clear()
  setViewportWidth(1440)
})

describe('useResizableLayout - 触摸调宽', () => {
  it('touchmove 能调整文档侧栏宽度，touchend 结束拖拽', () => {
    const { result } = renderHook(() => useResizableLayout())
    const before = result.current.docsSidebarWidth

    act(() => {
      result.current.startDocsResize(touchStart(200))
    })
    expect(result.current.dragging).toBe('docs')

    act(() => {
      dispatch('touchmove', 240)
    })
    expect(result.current.docsSidebarWidth).toBe(before + 40)

    act(() => {
      dispatch('touchend')
    })
    expect(result.current.dragging).toBeNull()
  })

  it('触摸拖动同样受上下限约束', () => {
    const { result } = renderHook(() => useResizableLayout())

    act(() => {
      result.current.startDocsResize(touchStart(0))
    })
    act(() => {
      dispatch('touchmove', -5000)
    })
    expect(result.current.docsSidebarWidth).toBe(PANEL_LIMITS.docsSidebar.min)

    act(() => {
      dispatch('touchmove', 5000)
    })
    expect(result.current.docsSidebarWidth).toBe(PANEL_LIMITS.docsSidebar.max)
    act(() => {
      dispatch('touchcancel')
    })
  })

  it('鼠标路径没有回归', () => {
    const { result } = renderHook(() => useResizableLayout())
    const before = result.current.sidebarWidth

    act(() => {
      result.current.startSidebarResize(mouseStart(300))
    })
    act(() => {
      const move = new MouseEvent('mousemove', { bubbles: true, clientX: 330 })
      document.dispatchEvent(move)
    })
    expect(result.current.sidebarWidth).toBe(before + 30)

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
    expect(result.current.dragging).toBeNull()
  })
})

describe('useResizableLayout - 窄窗口自动收起', () => {
  it('窗口窄于 BREAKPOINT_WIDE 时侧栏默认收起，宽屏恢复', async () => {
    const { result } = renderHook(() => useResizableLayout())
    expect(result.current.sidebarCollapsed).toBe(false)

    act(() => {
      setViewportWidth(900)
    })
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })
    expect(result.current.sidebarCollapsed).toBe(true)
    expect(result.current.isCompact).toBe(true)

    act(() => {
      setViewportWidth(1440)
    })
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })
    expect(result.current.sidebarCollapsed).toBe(false)
  })

  it('手动展开后不会被后续 resize 再收起', async () => {
    const { result } = renderHook(() => useResizableLayout())
    act(() => {
      setViewportWidth(900)
    })
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })
    act(() => {
      result.current.toggleSidebarCollapse()
    })
    expect(result.current.sidebarCollapsed).toBe(false)

    // 仍在窄屏区间内再次 resize：不应重新收起
    act(() => {
      setViewportWidth(880)
    })
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })
    expect(result.current.sidebarCollapsed).toBe(false)
  })
})
