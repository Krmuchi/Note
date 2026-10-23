import { useState, useEffect } from 'react';

/**
 * EditorHeader 格式工具栏的响应式宽度与展开/收缩状态。
 * 从 EditorHeader.tsx 纯拆分而来：rAF 节流 resize 监听 + localStorage 持久化，逻辑逐行保持不变。
 */

const STORAGE_KEY = 'toolbarExpanded';

export const useResponsiveToolbar = (): {
  toolbarExpanded: boolean;
  setToolbarExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  isMobile: boolean;
  effectiveExpanded: boolean;
  hideRedo: boolean;
  hideTableAndDivider: boolean;
} => {
  const [toolbarExpanded, setToolbarExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [winWidth, setWinWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(toolbarExpanded));
    } catch {
      /* ignore */
    }
  }, [toolbarExpanded]);

  useEffect(() => {
    // rAF 节流：resize 高频触发时避免每帧多次 setState
    let rafId: number | null = null;
    const onResize = (): void => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setWinWidth(window.innerWidth);
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // 与 useResizableLayout 的 MOBILE_BREAKPOINT(768) 保持一致，避免中间宽度行为不一致
  const isMobile = winWidth < 768;
  const effectiveExpanded = !isMobile && toolbarExpanded;

  // 渐进隐藏阈值
  const hideRedo = winWidth < 1000;
  const hideTableAndDivider = winWidth < 800;

  return {
    toolbarExpanded,
    setToolbarExpanded,
    isMobile,
    effectiveExpanded,
    hideRedo,
    hideTableAndDivider,
  };
};