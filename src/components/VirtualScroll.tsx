import React, { useState, useRef, useCallback } from 'react';

/**
 * 虚拟滚动组件属性
 * @template T 列表项类型
 */
interface VirtualScrollProps<T> {
  items: T[];                      // 列表数据
  itemHeight: number;              // 每项高度（固定）
  containerHeight: number;         // 容器高度
  renderItem: (item: T, index: number) => React.ReactNode; // 渲染函数
  overscan?: number;               // 预渲染数量（可视区域外前后各渲染几项）
  className?: string;              // 自定义类名
  style?: React.CSSProperties;     // 自定义样式
  onEndReached?: () => void;       // 滚动到底部回调
  endReachedThreshold?: number;    // 触底阈值（距离底部多少像素触发）
}

/**
 * 虚拟滚动组件
 * 只渲染可视区域内的列表项，大幅提升长列表性能
 */
export function VirtualScroll<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 3,
  className,
  style,
  onEndReached,
  endReachedThreshold = 200,
}: VirtualScrollProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);      // 当前滚动位置
  const containerRef = useRef<HTMLDivElement>(null);  // 容器引用
  const endReachedCalledRef = useRef(false);          // 触底回调防抖标记

  // 计算总高度和可见范围
  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
  );
  const offsetY = startIndex * itemHeight;

  // 获取可见项
  const visibleItems = items.slice(startIndex, endIndex + 1);

  /**
   * 处理滚动事件
   */
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    setScrollTop(newScrollTop);

    // 触底检测
    if (onEndReached) {
      const scrollBottom = newScrollTop + containerHeight;
      const distanceFromBottom = totalHeight - scrollBottom;

      if (distanceFromBottom < endReachedThreshold && !endReachedCalledRef.current) {
        endReachedCalledRef.current = true;
        onEndReached();
        
        // 500ms 后重置标记，允许再次触发
        setTimeout(() => {
          endReachedCalledRef.current = false;
        }, 500);
      }
    }
  }, [containerHeight, totalHeight, onEndReached, endReachedThreshold]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height: containerHeight,
        overflow: 'auto',
        position: 'relative',
        ...style,
      }}
      onScroll={handleScroll}
    >
      {/* 占位容器，用于计算滚动条 */}
      <div
        style={{
          height: totalHeight,
          position: 'relative',
        }}
      >
        {/* 可见区域内容，通过 translateY 定位 */}
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, index) => (
            <div
              key={startIndex + index}
              style={{
                height: itemHeight,
              }}
            >
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default VirtualScroll;