import { useState, useCallback, useMemo } from 'react'

export type ViewType = 'notebooks' | 'trash' | 'favorite'
export type LeftMenuType = 'start' | 'note' | 'notebooks' | 'favorite' | 'tags'

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
}

const UI_STATE_KEY = 'notes-ui-state'

const loadPersistedUIState = (): Partial<UIState> => {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // storage unavailable
  }
  return {}
}

const persistUIState = (state: Partial<UIState>): void => {
  try {
    // 与已持久化的字段合并后再写，否则各处写各自字段会互相覆盖，
    // 重启后只有最后一次写入的那一项被恢复
    const merged = { ...loadPersistedUIState(), ...state }
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(merged))
  } catch {
    // storage unavailable
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const useUIState = () => {
  // 只在首次渲染读取一次 localStorage，避免每次渲染都同步执行 getItem + JSON.parse
  const persisted = useMemo(() => loadPersistedUIState(), [])

  const [activeView, setActiveView] = useState<ViewType>((persisted.activeView as ViewType) ?? 'notebooks')
  const [activeLeftMenu, setActiveLeftMenu] = useState<LeftMenuType>((persisted.activeLeftMenu as LeftMenuType) ?? 'start')
  const [fontSize, setFontSize] = useState<string>(persisted.fontSize ?? '15px')
  const [showSearchPanel, setShowSearchPanel] = useState(false)
  const [showSharePanel, setShowSharePanel] = useState(false)
  const [showTagPanel, setShowTagPanel] = useState(false)
  const [showCommentsPanel, setShowCommentsPanel] = useState(false)
  const [showOutlinePanel, setShowOutlinePanel] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showShortcutHelp, setShowShortcutHelp] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const handleActiveViewChange = useCallback((view: ViewType) => {
    setActiveView(view)
    persistUIState({ activeView: view })
  }, [])

  const handleActiveLeftMenuChange = useCallback((menu: LeftMenuType) => {
    setActiveLeftMenu(menu)
    persistUIState({ activeLeftMenu: menu })
  }, [])

  const handleFontSizeChange = useCallback((size: string) => {
    setFontSize(size)
    persistUIState({ fontSize: size })
  }, [])

  return {
    activeView,
    setActiveView: handleActiveViewChange,
    activeLeftMenu,
    setActiveLeftMenu: handleActiveLeftMenuChange,
    fontSize,
    setFontSize: handleFontSizeChange,
    showSearchPanel,
    setShowSearchPanel,
    showSharePanel,
    setShowSharePanel,
    showTagPanel,
    setShowTagPanel,
    showCommentsPanel,
    setShowCommentsPanel,
    showOutlinePanel,
    setShowOutlinePanel,
    showVersionHistory,
    setShowVersionHistory,
    showShortcutHelp,
    setShowShortcutHelp,
    showSettings,
    setShowSettings,
  }
}