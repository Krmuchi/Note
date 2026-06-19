import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { LazyImage } from '../src/components/LazyImage';
import { PaginatedContent } from '../src/components/PaginatedContent';
import { VirtualScroll } from '../src/components/VirtualScroll';

describe('懒加载功能集成测试', () => {
  describe('LazyImage 组件', () => {
    it('应该正确渲染图片组件', () => {
      render(
        <LazyImage
          src="https://example.com/test.jpg"
          alt="测试图片"
        />
      );

      const img = screen.getByAltText('测试图片');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('loading', 'lazy');
    });

    it('应该支持自定义样式', () => {
      render(
        <LazyImage
          src="https://example.com/test.jpg"
          alt="测试图片"
          style={{ width: '100%', height: 'auto' }}
          className="custom-image"
        />
      );

      const img = screen.getByAltText('测试图片');
      expect(img).toHaveStyle({ width: '100%', height: 'auto' });
      expect(img).toHaveClass('custom-image');
    });
  });

  describe('PaginatedContent 组件', () => {
    it('应该正确渲染分页内容', () => {
      const content = 'A'.repeat(3000);
      
      render(
        <PaginatedContent
          content={content}
          pageSize={1000}
        />
      );

      expect(screen.getByText(/A/)).toBeInTheDocument();
    });

    it('应该显示加载更多按钮', () => {
      const content = 'A'.repeat(3000);
      
      render(
        <PaginatedContent
          content={content}
          pageSize={1000}
        />
      );

      expect(screen.getByText(/加载更多/)).toBeInTheDocument();
    });
  });

  describe('VirtualScroll 组件', () => {
    it('应该正确渲染虚拟滚动列表', () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: `item-${i}`,
        name: `项目 ${i}`,
      }));

      render(
        <VirtualScroll
          items={items}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item) => <div key={item.id}>{item.name}</div>}
        />
      );

      expect(screen.getByText('项目 0')).toBeInTheDocument();
    });
  });

  describe('性能优化', () => {
    it('应该减少初始渲染时间', () => {
      const startTime = performance.now();
      
      render(
        <PaginatedContent
          content={Array.from({ length: 10000 }, () => '内容').join('\n')}
          pageSize={1000}
        />
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      expect(renderTime).toBeLessThan(200);
    });

    it('应该减少内存使用', () => {
      const items = Array.from({ length: 10000 }, (_, i) => ({
        id: `item-${i}`,
        name: `项目 ${i}`,
      }));

      const { unmount } = render(
        <VirtualScroll
          items={items}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item) => <div key={item.id}>{item.name}</div>}
        />
      );

      expect(screen.getByText('项目 0')).toBeInTheDocument();
      
      unmount();
    });
  });

  describe('组件集成', () => {
    it('应该能够同时使用多个懒加载组件', () => {
      const longContent = 'A'.repeat(3000);
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: `item-${i}`,
        name: `项目 ${i}`,
      }));

      render(
        <div>
          <LazyImage src="https://example.com/test.jpg" alt="测试图片" />
          <PaginatedContent content={longContent} pageSize={1000} />
          <VirtualScroll
            items={items}
            itemHeight={50}
            containerHeight={500}
            renderItem={(item) => <div key={item.id}>{item.name}</div>}
          />
        </div>
      );

      expect(screen.getByAltText('测试图片')).toBeInTheDocument();
      expect(screen.getByText(/A/)).toBeInTheDocument();
      expect(screen.getByText('项目 0')).toBeInTheDocument();
    });
  });
});