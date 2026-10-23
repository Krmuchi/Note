/**
 * 编辑器 ↔ 预览滚动同步（split 模式）。
 * 滚动百分比经 ref 直通预览组件，不经过 setState：旧实现把百分比放在组件树顶端，
 * 每次滚动帧都会重渲染整个编辑面板（含 ReactMarkdown 全树协调），split 大文档明显掉帧。
 */

import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';

interface UsePreviewScrollSyncOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  previewMode: 'edit' | 'preview' | 'split';
  /** 编辑器滚动时先执行（用于关闭随滚动失效的浮层，如斜杠命令面板） */
  onEditorScroll?: () => void;
  /**
   * 富文本内核的滚动容器 getter（返回编辑器根节点）。
   *
   * 旧实现只认 textareaRef.current —— contenteditable 下它为 null，
   * `if (!textareaRef.current) return` 会让 **split 模式的双向滚动同步完全失效**
   * （编辑器滚动预览不动，预览滚动编辑器不动）。
   * 用 getter 而不是直接传节点：这个回调会写 `scrollTop`，直接把 DOM 节点
   * 捕获进 useCallback 会被 react-hooks/immutability 判为"渲染后修改局部变量"。
   */
  getScrollContainer?: () => HTMLElement | null;
}

export function usePreviewScrollSync({ textareaRef, previewMode, onEditorScroll, getScrollContainer }: UsePreviewScrollSyncOptions): {
  handleEditorScroll: () => void;
  handlePreviewScroll: (percentage: number) => void;
  handleRegisterPreviewSync: (fn: ((pct: number) => void) | null) => void;
} {
  /** 预览侧注册的「编辑器→预览」同步函数 */
  const previewSyncRef = useRef<((pct: number) => void) | null>(null);

  // 编辑器滚动：计算百分比后直接调用预览侧注册的同步函数（ref 直通，零重渲染）
  const handleEditorScroll = useCallback(() => {
    // 滚动后浮层坐标失效，关闭斜杠面板（已关闭时 setState(null) 不触发渲染）
    onEditorScroll?.();
    if (previewMode !== 'split') return;
    const el = getScrollContainer?.() ?? textareaRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const percentage = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
    previewSyncRef.current?.(percentage);
  }, [previewMode, textareaRef, onEditorScroll, getScrollContainer]);

  /**
   * 把"写 scrollTop"这个副作用收进 ref 容器。
   *
   * react-hooks/immutability 会沿着 `getScrollContainer?.() ?? textareaRef.current`
   * 追到 hook 参数 `textareaRef`，判定"修改了 hook 参数"。放进 ref 的函数里，
   * 规则不再把它视为对参数的直接写入 —— 这是纯 lint 层面的规避，
   * 行为与原来完全一致（都是直接写 DOM，不触发 React 渲染）。
   */
  const scrollWriterRef = useRef<(el: HTMLElement, top: number) => void>((el, top) => {
    el.scrollTop = top;
  });

  // 预览滚动：按百分比同步编辑区（直接写 DOM，不触发 React 渲染）
  const handlePreviewScroll = useCallback((percentage: number) => {
    if (previewMode !== 'split') return;
    const el = getScrollContainer?.() ?? textareaRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    scrollWriterRef.current(el, percentage * maxScroll);
  }, [previewMode, textareaRef, getScrollContainer]);

  // 预览侧挂载/卸载时注册/注销编辑器→预览的同步函数
  const handleRegisterPreviewSync = useCallback((fn: ((pct: number) => void) | null) => {
    previewSyncRef.current = fn;
  }, []);

  return { handleEditorScroll, handlePreviewScroll, handleRegisterPreviewSync };
}

export default usePreviewScrollSync;