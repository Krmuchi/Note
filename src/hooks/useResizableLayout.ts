import { useState, useEffect, useCallback, useRef } from 'react';

export const PANEL_LIMITS = {
  sidebar: { min: 180, max: 350, default: 240, collapseAt: 150 },
  docsSidebar: { min: 220, max: 400, default: 280 },
} as const;

export const COLLAPSED_WIDTH = 48;
const STORAGE_KEY = 'notes-panel-layout';
const MOBILE_BREAKPOINT = 768;

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

export function useResizableLayout(): {
  sidebarWidth: number;
  docsSidebarWidth: number;
  sidebarCollapsed: boolean;
  dragging: DragTarget;
  isMobile: boolean;
  startSidebarResize: (e: React.MouseEvent) => void;
  startDocsResize: (e: React.MouseEvent) => void;
  resetSidebar: () => void;
  resetDocs: () => void;
  toggleSidebarCollapse: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
} {
  const [state, setState] = useState<LayoutState>(loadState);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false,
  );

  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    const onResize = (): void => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const attachDrag = useCallback(
    (onMove: (ev: MouseEvent) => void) => {
      document.body.classList.add('panel-resizing');
      const move = (ev: MouseEvent): void => onMove(ev);
      const up = (): void => {
        setDragging(null);
        document.body.classList.remove('panel-resizing');
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    },
    [],
  );

  const startSidebarResize = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      e.preventDefault();
      const startX = e.clientX;
      const current = stateRef.current;
      const startCollapsed = current.sidebarCollapsed;
      const startWidth = startCollapsed ? COLLAPSED_WIDTH : current.sidebarWidth;
      setDragging('sidebar');

      attachDrag((ev: MouseEvent) => {
        const delta = ev.clientX - startX;
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
    (e: React.MouseEvent) => {
      if (isMobile) return;
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = stateRef.current.docsSidebarWidth;
      setDragging('docs');

      attachDrag((ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const newWidth = clamp(startWidth + delta, PANEL_LIMITS.docsSidebar.min, PANEL_LIMITS.docsSidebar.max);
        setState((prev) =>
          prev.docsSidebarWidth !== newWidth ? { ...prev, docsSidebarWidth: newWidth } : prev,
        );
      });
    },
    [attachDrag, isMobile],
  );

  const resetSidebar = useCallback(() => {
    setState((prev) => ({ ...prev, sidebarCollapsed: false, sidebarWidth: PANEL_LIMITS.sidebar.default }));
  }, []);

  const resetDocs = useCallback(() => {
    setState((prev) => ({ ...prev, docsSidebarWidth: PANEL_LIMITS.docsSidebar.default }));
  }, []);

  const toggleSidebarCollapse = useCallback(() => {
    setState((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setState((prev) => ({ ...prev, sidebarCollapsed: collapsed }));
  }, []);

  return {
    sidebarWidth: state.sidebarWidth,
    docsSidebarWidth: state.docsSidebarWidth,
    sidebarCollapsed: state.sidebarCollapsed,
    dragging,
    isMobile,
    startSidebarResize,
    startDocsResize,
    resetSidebar,
    resetDocs,
    toggleSidebarCollapse,
    setSidebarCollapsed,
  };
}