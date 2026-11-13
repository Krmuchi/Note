import React, { useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'

/** 命令式句柄：供键盘导航等外部场景把指定项滚进可视区 */
export interface VirtualScrollHandle {
  /** 将第 index 项滚入可视区（block: nearest 语义：已可见则不动） */
  scrollToIndex: (index: number) => void
}

export interface VirtualScrollProps<T> {
  items: T[]
  /** 每项固定高度（px） */
  itemHeight: number
  /** 滚动容器高度（px） */
  containerHeight: number
  /** 渲染单项 */
  renderItem: (item: T, index: number) => React.ReactNode
  /** 视口外预渲染项数 */
  overscan?: number
  /** 滚动到底部回调 */
  onScrollToBottom?: () => void
  className?: string
  /** 稳定 key 提取器；缺省用 index（行内状态会随排序/滚动串位，尽量提供） */
  getKey?: (item: T) => string
  /** React 19 ref-as-prop：暴露命令式 scrollToIndex */
  ref?: React.Ref<VirtualScrollHandle>
}

/**
 * 虚拟滚动：仅渲染可见区域内的列表项，大幅降低 DOM 数量，
 * 支持固定行高 + 可配置预渲染，适合万级数据渲染。
 */
export function VirtualScroll<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5,
  onScrollToBottom,
  className,
  getKey,
  ref,
}: VirtualScrollProps<T>): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const totalHeight = items.length * itemHeight
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const visibleCount = Math.ceil(containerHeight / itemHeight) + overscan * 2
  const endIndex = Math.min(items.length, startIndex + visibleCount)

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex],
  )

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      setScrollTop(el.scrollTop)
      if (onScrollToBottom && el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
        onScrollToBottom()
      }
    },
    [onScrollToBottom],
  )

  /*
   * 命令式滚动到指定项。虚拟化下目标项可能根本不在 DOM 里，
   * 外部 querySelector + scrollIntoView 会静默失效（键盘导航"焦点消失"）。
   * 这里直接按行高计算 scrollTop 并同步渲染窗口：
   * 真实浏览器里赋值 scrollTop 还会触发 scroll 事件再同步一次（同值，无额外渲染）；
   * jsdom 不派发 scroll 事件，所以必须在这里显式 setScrollTop。
   */
  const scrollToIndex = useCallback(
    (index: number) => {
      const el = containerRef.current
      if (!el || items.length === 0) return
      const clamped = Math.max(0, Math.min(index, items.length - 1))
      const itemTop = clamped * itemHeight
      const itemBottom = itemTop + itemHeight
      const viewTop = el.scrollTop
      const viewBottom = viewTop + containerHeight

      let next = viewTop
      if (itemTop < viewTop) next = itemTop
      else if (itemBottom > viewBottom) next = itemBottom - containerHeight

      const maxScroll = Math.max(0, totalHeight - containerHeight)
      next = Math.max(0, Math.min(next, maxScroll))
      el.scrollTop = next
      setScrollTop(next)
    },
    [items.length, itemHeight, containerHeight, totalHeight],
  )

  useImperativeHandle(ref, () => ({ scrollToIndex }), [scrollToIndex])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height: containerHeight, overflow: 'auto', position: 'relative' }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((item, i) => {
          const index = startIndex + i
          return (
            <div
              key={getKey ? getKey(item) : index}
              style={{
                position: 'absolute',
                top: index * itemHeight,
                left: 0,
                right: 0,
                height: itemHeight,
              }}
            >
              {renderItem(item, index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default VirtualScroll
