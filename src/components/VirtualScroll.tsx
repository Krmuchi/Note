import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

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

  /*
   * scroll → setState 的 rAF 节流（P2-1）。
   *
   * 拖动滚动条时一帧内能派发几十个 scroll 事件，逐个 setScrollTop 会把
   * 渲染窗口计算（slice + 绝对定位重排）放大几十倍。这里只把**最新** scrollTop
   * 记进 pendingScrollTopRef；scrollRafRef 非 null 即表示本帧已排队，
   * 后续事件只覆盖 ref 不再重复排队，rAF 回调执行时统一 setState 一次。
   */
  const scrollRafRef = useRef<number | null>(null)
  const pendingScrollTopRef = useRef(0)

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
      // 只记最新值：同帧内的后续事件覆盖这里，不重复排队 rAF
      pendingScrollTopRef.current = el.scrollTop
      if (scrollRafRef.current === null) {
        scrollRafRef.current = requestAnimationFrame(() => {
          scrollRafRef.current = null
          setScrollTop(pendingScrollTopRef.current)
        })
      }
      // 触底回调仍逐事件触发：它不在渲染热路径上，且改节流会改变"何时加载下一批"的行为
      if (onScrollToBottom && el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
        onScrollToBottom()
      }
    },
    [onScrollToBottom],
  )

  // 卸载时撤掉挂起的 rAF，否则回调会在组件消失后 setState（对已卸载组件的无谓渲染）
  useEffect(
    () => () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    },
    [],
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
      /*
       * 命令式滚动必须**同步**生效（键盘导航要立刻看到目标项），所以这里绕过
       * rAF 节流直接 setScrollTop；同时撤掉挂起的 rAF —— 否则它回放的是
       * 排队那一刻的旧 scrollTop，会把这次结果覆盖回旧位置。
       */
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
      pendingScrollTopRef.current = next
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
