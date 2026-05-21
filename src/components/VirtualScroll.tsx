import React, { useState, useRef } from 'react';

interface VirtualScrollProps<T> {
  items: T[];
  itemHeight?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
}

export function VirtualScroll<T>({
  items,
  itemHeight = 40,
  renderItem,
  className = '',
}: VirtualScrollProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleEnd = Math.min(
    visibleStart + Math.ceil((containerRef.current?.clientHeight || 0) / itemHeight) + 1,
    items.length
  );

  const offsetTop = visibleStart * itemHeight;

  return (
    <div
      ref={containerRef}
      className={`virtual-scroll-container ${className}`}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      style={{ overflowY: 'auto' }}
    >
      <div style={{ height: items.length * itemHeight }}>
        <div style={{ transform: `translateY(${offsetTop}px)` }}>
          {items.slice(visibleStart, visibleEnd).map((item, idx) =>
            renderItem(item, visibleStart + idx)
          )}
        </div>
      </div>
    </div>
  );
}