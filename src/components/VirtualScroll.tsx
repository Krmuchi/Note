import React, { useCallback, useMemo, useState } from 'react'

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
}: VirtualScrollProps<T>): import('react').ReactElement {
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

  return (
    <div
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
