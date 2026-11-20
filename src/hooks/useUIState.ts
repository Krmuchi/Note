import { useSyncExternalStore } from 'react'

export type ViewType = 'notebooks' | 'trash' | 'favorite' | 'recent'
export type LeftMenuType = 'start' | 'note' | 'notebooks' | 'favorite' | 'tags' | 'recent' | 'trash'

/** 设置面板页签。定义在 hooks 层供 SettingsPanel 与「去设置」入口共用（组件不得被 hooks 反向依赖） */
export type SettingsTabId = 'general' | 'editor' | 'ai' | 'shortcuts'

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
  /** 设置面板当前页签（临时态，不持久化）。AI 错误条的「去设置」直接定位到 ai 页签 */
  settingsTab: SettingsTabId
  /** AI 设置存在未保存修改（草稿或密钥输入）。全局 Esc / 遮罩关闭前据此弹确认 */
  aiSettingsDirty: boolean
  /** 全局快速打开面板（Ctrl+P）。放进 store 让侧栏等入口可以直接打开，不必层层透传 */
  showQuickOpen: boolean
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

/*
 * activeView / activeLeftMenu 是一对必须同步的状态（MainContent 先判 leftMenu
 * 的 start/note/tags，再判 view）。历史实现两者独立写入，出现过
 * 「侧栏点回收站停在开始页」（footer 只写 view）。这里的归一化同时兜住
 * 旧版本持久化下来的脏组合：view 已是 trash/favorite/recent 而 leftMenu
 * 还停在 start/notebooks —— 以 view 为准对齐。
 * view 为 notebooks 时 leftMenu 可以合法地是 start/note/tags（开始页等），保持原值。
 */
const normalizedView = (persisted.activeView as ViewType | undefined) ?? 'notebooks'
const normalizedMenu: LeftMenuType =
  normalizedView !== 'notebooks'
    ? (normalizedView as LeftMenuType)
    : ((persisted.activeLeftMenu as LeftMenuType | undefined) ?? 'start')

let state: UIState = {
  activeView: normalizedView,
  activeLeftMenu: normalizedMenu,
  fontSize: persisted.fontSize ?? '15px',
  showSearchPanel: false,
  showSharePanel: false,
  showTagPanel: false,
  showCommentsPanel: false,
  showOutlinePanel: false,
  showVersionHistory: false,
  showShortcutHelp: false,
  showSettings: false,
  settingsTab: 'general',
  aiSettingsDirty: false,
  showQuickOpen: false,
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

/**
 * 左菜单 → 视图的**成对同步**（唯一实现，uiActions 与启动回位共用）。
 * 单写一侧会出现「点了回收站停在开始页」这类失配（MainContent 先判
 * leftMenu 的 start/note/tags，再判 view）：
 * - view=notebooks ⟹ leftMenu=notebooks（打开文档/文档库）
 * - view=trash/favorite/recent ⟹ leftMenu 同名（这两个值同时是合法 LeftMenuType）
 * - leftMenu=start/note/tags ⟹ view=notebooks（这三项有自己的渲染分支，view 取兜底值，
 *   同时避免 footer 的回收站高亮在开始页上残留）
 */
function applyActiveLeftMenu(menu: LeftMenuType): void {
  setState({
    activeLeftMenu: menu,
    activeView: menu === 'start' || menu === 'note' || menu === 'tags' ? 'notebooks' : menu,
  })
}

export const uiActions = {
  /*
   * 视图与左菜单是一对联动状态，两个 setter 都必须写全（成对同步的规则见
   * applyActiveLeftMenu 的说明）——单写一侧会出现「点了回收站停在开始页」这类失配。
   */
  setActiveView: (view: ViewType) =>
    setState({ activeView: view, activeLeftMenu: view }),
  setActiveLeftMenu: applyActiveLeftMenu,
  /*
   * 启动回位（「重启不回上次文档」修复）：数据加载完成后，若 store 里仍有上次的
   * 活动文档而界面却停在开始页（activeLeftMenu 的默认值 'start'），落回文档视图。
   *
   * 三重守卫：
   * - hasActiveDoc：没有活动文档时开始页本身就是正确落点，不回位；
   * - isFreshInstall：全新安装要弹新手引导，开始页是引导的背景（判定复用
   *   utils/onboarding.shouldShowOnboarding），回位会让新用户一上来就面对空文档树；
   * - 仅当 activeLeftMenu 仍是 'start' 才回位：小记/标签/回收站/收藏/最近是用户
   *   明确停留过的视图，由持久化恢复，不覆盖。
   *
   * 走成对同步的 applyActiveLeftMenu，activeView / activeLeftMenu 一起写，
   * 不会重演「只写一侧」的失配。
   */
  restoreLastSessionView: (hasActiveDoc: boolean, isFreshInstall = false) => {
    if (!hasActiveDoc || isFreshInstall) return
    if (state.activeLeftMenu !== 'start') return
    applyActiveLeftMenu('notebooks')
  },
  setShowQuickOpen: (v: boolean) => setState({ showQuickOpen: v }),
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
  setSettingsTab: (tab: SettingsTabId) => setState({ settingsTab: tab }),
  setAiSettingsDirty: (v: boolean) => setState({ aiSettingsDirty: v }),
  /** 打开设置并定位到指定页签（AI 错误条「去设置」等入口用） */
  openSettings: (tab: SettingsTabId = 'general') => setState({ showSettings: true, settingsTab: tab }),
  /** 供测试重置 */
  reset: () => {
    state = { ...state, showSearchPanel: false, showSharePanel: false, showTagPanel: false, showCommentsPanel: false, showOutlinePanel: false, showVersionHistory: false, showShortcutHelp: false, showSettings: false, settingsTab: 'general', aiSettingsDirty: false, showQuickOpen: false }
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
