import React, { useRef, useState, useEffect } from 'react';

/**
 * 懒加载图片组件属性
 */
interface LazyImageProps {
  src: string;                        // 图片地址
  alt?: string;                       // 替代文本
  className?: string;                 // 自定义类名
  style?: React.CSSProperties;        // 自定义样式
  placeholder?: string;               // 占位图（默认灰色占位SVG）
  threshold?: number;                 // 交叉检测阈值（0-1）
  onLoad?: () => void;                // 加载成功回调
  onError?: () => void;               // 加载失败回调
}

/**
 * 懒加载图片组件
 * 使用 IntersectionObserver 实现图片懒加载，进入视口后才加载真实图片
 */
export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt = '',
  className,
  style,
  placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23f0f0f0" width="100" height="100"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%23999"%3E加载中...%3C/text%3E%3C/svg%3E',
  threshold = 0.1,
  onLoad,
  onError,
}) => {
  const imgRef = useRef<HTMLImageElement>(null);  // 图片元素引用
  const [isLoaded, setIsLoaded] = useState(false); // 是否已加载完成
  const [isInView, setIsInView] = useState(false); // 是否进入视口
  const [_hasError, setHasError] = useState(false); // 是否加载失败

  // 使用 IntersectionObserver 检测图片是否进入视口
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect(); // 进入视口后停止观察
          }
        });
      },
      { threshold }
    );

    const currentImg = imgRef.current;
    if (currentImg) {
      observer.observe(currentImg);
    }

    return () => {
      if (currentImg) {
        observer.unobserve(currentImg);
      }
    };
  }, [threshold]);

  /**
   * 图片加载成功处理
   */
  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  /**
   * 图片加载失败处理
   */
  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  return (
    <img
      ref={imgRef}
      src={isInView ? src : placeholder}  // 进入视口后才加载真实图片
      alt={alt}
      className={className}
      style={{
        opacity: isLoaded ? 1 : 0.5,      // 加载完成后渐显
        transition: 'opacity 0.3s ease',
        ...style,
      }}
      onLoad={handleLoad}
      onError={handleError}
      loading="lazy"                      // 浏览器原生懒加载
    />
  );
};

export default LazyImage;