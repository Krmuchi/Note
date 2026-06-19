import { useState, useCallback } from 'react'

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

const persistUIState = (state: Partial<UIState>) => {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state))
  } catch {
    // storage unavailable
  }
}

export const useUIState = () => {
  const persisted = loadPersistedUIState()

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