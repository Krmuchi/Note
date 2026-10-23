import { useState, useEffect, useCallback, useRef } from 'react';
import { BREAKPOINT_COMPACT, BREAKPOINT_WIDE, MOBILE_BREAKPOINT } from '@/utils/breakpoints';

export const PANEL_LIMITS = {
  sidebar: { min: 180, max: 350, default: 240, collapseAt: 150 },
  // 默认 300：标题行含图标+标题+计数+排序下拉+新建按钮，280 会把标题挤成"我的…"截断
  docsSidebar: { min: 220, max: 400, default: 300 },
} as const;

export const COLLAPSED_WIDTH = 48;
const STORAGE_KEY = 'notes-panel-layout';

interface LayoutState {
  sidebarWidth: number;
  docsSidebarWidth: number;
  sidebarCollapsed: boolean;
}

const DEFAULT_STATE: LayoutState = {
  sidebarWidth: PANEL_LIMITS.sidebar.default,
  docsSidebarWidth: PANEL_LIMITS.docsSidebar.default,
  sidebarCollapsed: false,
};

function loadState(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        sidebarWidth:
          typeof parsed.sidebarWidth === 'number'
            ? Math.max(PANEL_LIMITS.sidebar.min, Math.min(parsed.sidebarWidth, PANEL_LIMITS.sidebar.max))
            : DEFAULT_STATE.sidebarWidth,
        docsSidebarWidth:
          typeof parsed.docsSidebarWidth === 'number'
            ? Math.max(PANEL_LIMITS.docsSidebar.min, Math.min(parsed.docsSidebarWidth, PANEL_LIMITS.docsSidebar.max))
            : DEFAULT_STATE.docsSidebarWidth,
        sidebarCollapsed: typeof parsed.sidebarCollapsed === 'boolean' ? parsed.sidebarCollapsed : false,
      };
    }
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_STATE;
}

function saveState(state: LayoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

export type DragTarget = 'sidebar' | 'docs' | null;

/** 调宽手柄的按下事件：鼠标或触摸（A4） */
export type ResizeStartEvent = React.MouseEvent | React.TouchEvent;

const clientXOf = (e: ResizeStartEvent): number =>
  'touches' in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;

export function useResizableLayout(): {
  sidebarWidth: number;
  docsSidebarWidth: number;
  sidebarCollapsed: boolean;
  dragging: DragTarget;
  isMobile: boolean;
  /** 窗口处于紧凑区间（< BREAKPOINT_COMPACT）：文档列表应收起为窄条 */
  isCompact: boolean;
  startSidebarResize: (e: ResizeStartEvent) => void;
  startDocsResize: (e: ResizeStartEvent) => void;
  resetSidebar: () => void;
  resetDocs: () => void;
  toggleSidebarCollapse: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
} {
  const [state, setState] = useState<LayoutState>(loadState);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const [winWidth, setWinWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : BREAKPOINT_WIDE,
  );
  const isMobile = winWidth < MOBILE_BREAKPOINT;
  const isCompact = winWidth < BREAKPOINT_COMPACT;

  /**
   * 窄窗口自动收起左侧导航。
   *
   * 为什么需要它：1440px 下三栏（导航 240 + 文档树 300 + 编辑器）刚好够用，
   * 但 900px 窗口里编辑器只剩 ~367px —— 正文栏被挤成一条，格式工具栏被迫换行三行。
   * 语雀在窄窗口下会把左侧导航收成图标条，这里沿用同一策略。
   *
   * 与用户手动收起的关系：
   * - `autoCollapsed` 只在**跨越断点**时变化，用户手动展开后不会被下一次 resize 再次收掉；
   * - 用户点展开/收起时清掉 `autoCollapsed`，交回手动控制权。
   */
  const [autoCollapsed, setAutoCollapsed] = useState(
    typeof window !== 'undefined' ? window.innerWidth < BREAKPOINT_WIDE : false,
  );
  const wasWideRef = useRef(winWidth >= BREAKPOINT_WIDE);
  const effectiveCollapsed = state.sidebarCollapsed || autoCollapsed;
  const effectiveCollapsedRef = useRef(effectiveCollapsed);
  /** toggle 需要读"当前是否自动收起"来决定取反方向（不能读 state，它不含自动收起） */
  const autoCollapsedRef = useRef(autoCollapsed);

  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    effectiveCollapsedRef.current = effectiveCollapsed;
    autoCollapsedRef.current = autoCollapsed;
  }, [effectiveCollapsed, autoCollapsed]);

  useEffect(() => {
    saveState(state);
  }, [state]);

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

  useEffect(() => {
    const isWide = winWidth >= BREAKPOINT_WIDE;
    if (wasWideRef.current === isWide) return;
    wasWideRef.current = isWide;
    setAutoCollapsed(!isWide);
  }, [winWidth]);

  /**
   * 统一的拖拽接线（A4 触屏）：鼠标与触摸走同一套逻辑，只把"当前 X 坐标"传给调用方。
   * 触屏上必须用 { passive: false } 才能 preventDefault，否则拖动时页面会跟着滚动。
   */
  const attachDrag = useCallback(
    (onMove: (clientX: number) => void) => {
      document.body.classList.add('panel-resizing');
      const move = (ev: MouseEvent): void => onMove(ev.clientX);
      const moveTouch = (ev: TouchEvent): void => {
        const touch = ev.touches[0];
        if (!touch) return;
        ev.preventDefault();
        onMove(touch.clientX);
      };
      const finish = (): void => {
        setDragging(null);
        document.body.classList.remove('panel-resizing');
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', finish);
        document.removeEventListener('touchmove', moveTouch);
        document.removeEventListener('touchend', finish);
        document.removeEventListener('touchcancel', finish);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', finish);
      document.addEventListener('touchmove', moveTouch, { passive: false });
      document.addEventListener('touchend', finish);
      document.addEventListener('touchcancel', finish);
    },
    [],
  );

  const startSidebarResize = useCallback(
    (e: ResizeStartEvent) => {
      if (isMobile) return;
      e.preventDefault();
      const startX = clientXOf(e);
      const current = stateRef.current;
      // 自动收起时也要从"图标条宽度"起算，否则一拖就跳到 240px，手感突变
      const startCollapsed = current.sidebarCollapsed || effectiveCollapsedRef.current;
      const startWidth = startCollapsed ? COLLAPSED_WIDTH : current.sidebarWidth;
      setDragging('sidebar');

      attachDrag((clientX: number) => {
        const delta = clientX - startX;
        const newWidth = (startCollapsed ? COLLAPSED_WIDTH : startWidth) + delta;
        setState((prev) => {
          if (newWidth < PANEL_LIMITS.sidebar.collapseAt) {
            if (!prev.sidebarCollapsed) {
              return { ...prev, sidebarCollapsed: true };
            }
            return prev;
          }
          const clamped = clamp(newWidth, PANEL_LIMITS.sidebar.min, PANEL_LIMITS.sidebar.max);
          if (prev.sidebarCollapsed || prev.sidebarWidth !== clamped) {
            return { ...prev, sidebarCollapsed: false, sidebarWidth: clamped };
          }
          return prev;
        });
      });
    },
    [attachDrag, isMobile],
  );

  const startDocsResize = useCallback(
    (e: ResizeStartEvent) => {
      if (isMobile) return;
      e.preventDefault();
      const startX = clientXOf(e);
      const startWidth = stateRef.current.docsSidebarWidth;
      setDragging('docs');

      attachDrag((clientX: number) => {
        const delta = clientX - startX;
        const newWidth = clamp(startWidth + delta, PANEL_LIMITS.docsSidebar.min, PANEL_LIMITS.docsSidebar.max);
        setState((prev) =>
          prev.docsSidebarWidth !== newWidth ? { ...prev, docsSidebarWidth: newWidth } : prev,
        );
      });
    },
    [attachDrag, isMobile],
  );

  const resetSidebar = useCallback(() => {
    setAutoCollapsed(false);
    setState((prev) => ({ ...prev, sidebarCollapsed: false, sidebarWidth: PANEL_LIMITS.sidebar.default }));
  }, []);

  const resetDocs = useCallback(() => {
    setState((prev) => ({ ...prev, docsSidebarWidth: PANEL_LIMITS.docsSidebar.default }));
  }, []);

  /**
   * 手动切换即接管自动收起：否则用户展开后，下一次 resize 会把它再收回去。
   *
   * 取反方向必须基于**生效值**（手动 + 自动）：窄屏下自动收起时
   * `state.sidebarCollapsed` 仍是 false，按它取反会变成 true —— 点了没反应。
   */
  const toggleSidebarCollapse = useCallback(() => {
    setState((prev) => ({
      ...prev,
      sidebarCollapsed: !(prev.sidebarCollapsed || autoCollapsedRef.current),
    }));
    setAutoCollapsed(false);
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setAutoCollapsed(false);
    setState((prev) => ({ ...prev, sidebarCollapsed: collapsed }));
  }, []);

  return {
    sidebarWidth: state.sidebarWidth,
    docsSidebarWidth: state.docsSidebarWidth,
    sidebarCollapsed: effectiveCollapsed,
    dragging,
    isMobile,
    isCompact,
    startSidebarResize,
    startDocsResize,
    resetSidebar,
    resetDocs,
    toggleSidebarCollapse,
    setSidebarCollapsed,
  };
}