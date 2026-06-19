import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { LazyImage } from '../src/components/LazyImage';

describe('LazyImage Component', () => {
  it('应该渲染占位图', () => {
    render(
      <LazyImage 
        src="https://example.com/image.jpg" 
        alt="测试图片" 
      />
    );
    
    const img = screen.getByAltText('测试图片');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('应该在加载完成后调用 onLoad 回调', async () => {
    const onLoad = vi.fn();
    render(
      <LazyImage 
        src="https://example.com/image.jpg" 
        alt="测试图片"
        onLoad={onLoad}
      />
    );

    const img = screen.getByAltText('测试图片');
    img.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalled();
    });
  });

  it('应该在加载失败时调用 onError 回调', async () => {
    const onError = vi.fn();
    render(
      <LazyImage 
        src="https://example.com/invalid.jpg" 
        alt="测试图片"
        onError={onError}
      />
    );

    const img = screen.getByAltText('测试图片');
    img.dispatchEvent(new Event('error'));

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
  });
});