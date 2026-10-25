import { useSyncExternalStore } from 'react'

export type ViewType = 'notebooks' | 'trash' | 'favorite' | 'recent'
export type LeftMenuType = 'start' | 'note' | 'notebooks' | 'favorite' | 'tags' | 'recent'

export interface UIState {
  activeView: ViewType
  activeLeftMenu: LeftMenuType
  fontSize: string
  showSearchPanel: boolean
  showSharePanel: boolean
  showTagPanel: boolean
  showCommentsPanel: boolean
  showOutlinePanel: boolean
  showVersionHistory: boolean
  showShortcutHelp: boolean
  showSettings: boolean
}

const UI_STATE_KEY = 'notes-ui-state'

/** 会被持久化的字段（面板开关是临时的，重启后一律关闭） */
const PERSISTED_KEYS = ['activeView', 'activeLeftMenu', 'fontSize'] as const

const loadPersistedUIState = (): Partial<UIState> => {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // storage unavailable
  }
  return {}
}

const persistUIState = (patch: Partial<UIState>): void => {
  try {
    // 与已持久化的字段合并后再写，否则各处写各自字段会互相覆盖，
    // 重启后只有最后一次写入的那一项被恢复
    const merged = { ...loadPersistedUIState(), ...patch }
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(merged))
  } catch {
    // storage unavailable
  }
}

/* ============================================================
   外部 store（模块级单例）

   为什么不是 useState：这些状态（当前视图、各面板开关、字号）被
   App 外壳、MainContent、AppPanels 三处共同需要。旧实现把 11 个状态
   全部放在 App 里，再手工透传 —— MainContent 收 30 个 props、
   AppPanels 收 19 个，其中绝大多数是纯转发。改一个面板开关要动 3 个文件。

   改成外部 store 后：任何组件直接 `useUIState()` 或按字段订阅，
   App.tsx 不再需要持有这些状态，也就不再需要透传。
   ============================================================ */

const persisted = loadPersistedUIState()

let state: UIState = {
  activeView: (persisted.activeView as ViewType | undefined) ?? 'notebooks',
  activeLeftMenu: (persisted.activeLeftMenu as LeftMenuType | undefined) ?? 'start',
  fontSize: persisted.fontSize ?? '15px',
  showSearchPanel: false,
  showSharePanel: false,
  showTagPanel: false,
  showCommentsPanel: false,
  showOutlinePanel: false,
  showVersionHistory: false,
  showShortcutHelp: false,
  showSettings: false,
}

const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

function setState(patch: Partial<UIState>): void {
  state = { ...state, ...patch }

  /*
   * 只把 PERSISTED_KEYS 里出现过的字段落盘。
   * 用 `key in patch` 判断而不是真值判断：否则 `false` / `''` 这类合法值会被跳过。
   */
  const persistedPatch: Record<string, string> = {}
  for (const key of PERSISTED_KEYS) {
    const value = patch[key]
    if (value !== undefined) persistedPatch[key] = value
  }
  if (Object.keys(persistedPatch).length > 0) persistUIState(persistedPatch as Partial<UIState>)

  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): UIState {
  return state
}

/* ---------------- 命令式读写（供事件处理器 / 非组件代码使用） ---------------- */

export const uiActions = {
  setActiveView: (view: ViewType) => setState({ activeView: view }),
  setActiveLeftMenu: (menu: LeftMenuType) => setState({ activeLeftMenu: menu }),
  setFontSize: (size: string) => setState({ fontSize: size }),
  setShowSearchPanel: (v: boolean) => setState({ showSearchPanel: v }),
  setShowSharePanel: (v: boolean) => setState({ showSharePanel: v }),
  setShowTagPanel: (v: boolean) => setState({ showTagPanel: v }),
  setShowCommentsPanel: (v: boolean) => setState({ showCommentsPanel: v }),
  /** 面板开关取反（工具栏/快捷键用） */
  toggleShowCommentsPanel: () => setState({ showCommentsPanel: !state.showCommentsPanel }),
  setShowOutlinePanel: (v: boolean) => setState({ showOutlinePanel: v }),
  toggleShowOutlinePanel: () => setState({ showOutlinePanel: !state.showOutlinePanel }),
  setShowVersionHistory: (v: boolean) => setState({ showVersionHistory: v }),
  setShowShortcutHelp: (v: boolean) => setState({ showShortcutHelp: v }),
  setShowSettings: (v: boolean) => setState({ showSettings: v }),
  /** 供测试重置 */
  reset: () => {
    state = { ...state, showSearchPanel: false, showSharePanel: false, showTagPanel: false, showCommentsPanel: false, showOutlinePanel: false, showVersionHistory: false, showShortcutHelp: false, showSettings: false }
    emit()
  },
}

/** 命令式读取（事件处理器里用，避免闭包读到旧值） */
export const getUIState = (): UIState => state

/**
 * 订阅整个 UI 状态。
 *
 * 注意：订阅整对象会让调用方在**任何** UI 状态变化时重渲染。
 * 只需要单个字段时请用 `useUIStateSelector`。
 */
export function useUIState(): UIState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * 按字段订阅（推荐）。
 *
 * 选择器必须返回原始值（布尔/字符串），否则每次渲染都会得到新引用，
 * useSyncExternalStore 会判定为"变了"从而无限重渲染。
 */
export function useUIStateSelector<T extends string | number | boolean | null>(
  selector: (s: UIState) => T,
): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  )
}
