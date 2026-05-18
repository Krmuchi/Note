import React from "react";

/**
 * Loading 加载组件属性
 */
export interface LoadingProps {
  type?: "spinner" | "pulse" | "dots" | "wave" | "skeleton"; // 加载动画类型
  size?: "small" | "medium" | "large"; // 尺寸大小
  text?: string; // 加载提示文字
  color?: string; // 颜色
}

/**
 * 加载动画组件
 * 支持多种动画类型：spinner(旋转器)、pulse(脉冲)、dots(点跳动)、wave(波浪)、skeleton(骨架屏)
 */
export function Loading({ type = "spinner", size = "medium", text, color = "#2385bb" }: LoadingProps) {
  const sizeClasses = {
    small: "loading-small",
    medium: "loading-medium",
    large: "loading-large",
  };

  // 渲染旋转器动画
  const renderSpinner = () => (
    <div className={`loading-spinner ${sizeClasses[size]}`} style={{ borderColor: color }}>
      <div className="spinner-inner" style={{ borderTopColor: color }} />
    </div>
  );

  // 渲染脉冲动画
  const renderPulse = () => (
    <div className={`loading-pulse-container ${sizeClasses[size]}`}>
      <div className="pulse-dot" style={{ background: color }} />
    </div>
  );

  // 渲染点跳动动画
  const renderDots = () => (
    <div className={`loading-dots ${sizeClasses[size]}`}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="dot"
          style={{
            background: color,
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );

  // 渲染波浪动画
  const renderWave = () => (
    <div className={`loading-wave-container ${sizeClasses[size]}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="wave-bar"
          style={{
            background: color,
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );

  // 渲染骨架屏
  const renderSkeleton = () => (
    <div className="loading-skeleton">
      <div className="skeleton-line" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
    </div>
  );

  // 根据类型渲染对应动画
  const renderLoading = () => {
    switch (type) {
      case "spinner":
        return renderSpinner();
      case "pulse":
        return renderPulse();
      case "dots":
        return renderDots();
      case "wave":
        return renderWave();
      case "skeleton":
        return renderSkeleton();
      default:
        return renderSpinner();
    }
  };

  return (
    <div className="loading-wrapper">
      {renderLoading()}
      {text && <span className="loading-text">{text}</span>}
    </div>
  );
}

/**
 * 骨架屏组件属性
 */
export interface SkeletonProps {
  lines?: number; // 行数
}

/**
 * 骨架屏组件
 */
export function Skeleton({ lines = 3 }: SkeletonProps) {
  return (
    <div className="skeleton-wrapper">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${80 - i * 15}%` }} />
      ))}
    </div>
  );
}

/**
 * 按钮加载状态组件属性
 */
export interface ButtonLoaderProps {
  loading?: boolean; // 是否加载中
  children: React.ReactNode; // 按钮内容
}

/**
 * 按钮加载状态组件
 * 加载时显示加载动画，否则显示原内容
 */
export function ButtonLoader({ loading, children }: ButtonLoaderProps) {
  if (!loading) {
    return <>{children}</>;
  }

  return (
    <span className="button-loader">
      <span className="button-spinner" />
    </span>
  );
}