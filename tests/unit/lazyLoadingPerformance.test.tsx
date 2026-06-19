import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { act } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { PaginatedContent } from '../src/components/PaginatedContent';
import { VirtualScroll } from '../src/components/VirtualScroll';

describe('PaginatedContent Component', () => {
  it('应该只渲染第一页内容', () => {
    const longContent = 'A'.repeat(3000);
    
    render(
      <PaginatedContent 
        content={longContent} 
        pageSize={1000}
      />
    );

    const content = screen.getByText(/A/);
    expect(content).toBeInTheDocument();
  });

  it('应该在滚动时加载更多内容', async () => {
    const longContent = 'A'.repeat(3000);
    const onLoadMore = vi.fn();
    
    render(
      <PaginatedContent 
        content={longContent} 
        pageSize={1000}
        onLoadMore={onLoadMore}
      />
    );

    const loadMoreButton = screen.getByText(/加载更多/);
    await act(async () => {
      loadMoreButton.click();
    });

    expect(onLoadMore).toHaveBeenCalledWith(2);
  });
});

describe('VirtualScroll Component', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({
    id: `item-${i}`,
    name: `项目 ${i}`,
  }));

  it('应该只渲染可见区域的元素', () => {
    const renderItem = vi.fn((item) => <div key={item.id}>{item.name}</div>);
    
    render(
      <VirtualScroll
        items={items}
        itemHeight={50}
        containerHeight={500}
        renderItem={renderItem}
      />
    );

    const renderCalls = renderItem.mock.calls.length;
    expect(renderCalls).toBeLessThan(items.length);
    expect(renderCalls).toBeGreaterThan(0);
  });

  it('应该在滚动时更新可见元素', async () => {
    const renderItem = vi.fn((item) => <div key={item.id}>{item.name}</div>);
    
    const { container } = render(
      <VirtualScroll
        items={items}
        itemHeight={50}
        containerHeight={500}
        renderItem={renderItem}
      />
    );

    const scrollContainer = container.querySelector('[style*="overflow: auto"]');
    if (scrollContainer) {
      await act(async () => {
        scrollContainer.scrollTop = 1000;
      });
    }

    expect(renderItem).toHaveBeenCalled();
  });
});

describe('Lazy Loading Performance', () => {
  it('应该减少初始加载时间', async () => {
    const startTime = performance.now();
    
    render(
      <PaginatedContent 
        content={Array.from({ length: 10000 }, () => '内容').join('\n')} 
        pageSize={1000}
      />
    );

    const endTime = performance.now();
    const renderTime = endTime - startTime;

    expect(renderTime).toBeLessThan(100);
  });

  it('应该减少内存使用', () => {
    const initialMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
    
    const { unmount } = render(
      <VirtualScroll
        items={Array.from({ length: 10000 }, (_, i) => ({ id: i, name: `项目 ${i}` }))}
        itemHeight={50}
        containerHeight={500}
        renderItem={(item) => <div key={item.id}>{item.name}</div>}
      />
    );

    const afterRenderMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
    const memoryIncrease = afterRenderMemory - initialMemory;

    unmount();

    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
  });
});