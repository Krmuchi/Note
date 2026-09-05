import { useEffect, useCallback, useRef } from 'react'
import { useNotesStore } from '@/store'

export interface KeyboardHandlers {
  onSearch?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onSave?: () => void
  onNewDoc?: () => void
  onNewNotebook?: () => void
  onToggleSidebar?: () => void
  onToggleFavorite?: () => void
  onClose?: () => void
  onEscape?: () => void
  onBold?: () => void
  onItalic?: () => void
  onShortcutHelp?: () => void
}

/** 快捷键动作 id 集合（与 keyboardSlice 的 DEFAULT_SHORTCUTS 对应） */
type ActionId =
  | 'search'
  | 'save'
  | 'newDoc'
  | 'newNotebook'
  | 'toggleSidebar'
  | 'toggleFavorite'
  | 'shortcutHelp'
  | 'undo'
  | 'redo'
  | 'bold'
  | 'italic'

const normalize = (key: string): string => key.trim().toLowerCase()

/** 将键盘事件转换为规范化的按键组合（如 ['ctrl', 'shift', 'n']） */
function eventToKeys(e: KeyboardEvent): string[] {
  const key = e.key.toLowerCase()
  // 单独按下修饰键不触发任何快捷键
  if (key === 'control' || key === 'shift' || key === 'alt' || key === 'meta') return []

  const keys: string[] = []
  if (e.ctrlKey || e.metaKey) keys.push('ctrl')
  if (e.shiftKey) keys.push('shift')
  if (e.altKey) keys.push('alt')
  keys.push(normalize(key))
  return keys
}

/** 判断事件按键组合是否与快捷键配置完全匹配 */
function matchesKeys(eventKeys: string[], shortcutKeys: string[]): boolean {
  if (!Array.isArray(shortcutKeys) || shortcutKeys.length === 0) return false
  return [...eventKeys].sort().join('+') === [...shortcutKeys.map(normalize)].sort().join('+')
}

export const useKeyboard = (handlers: KeyboardHandlers): void => {
  // 持有最新 handlers 引用，使 handleKeyDown 稳定（空依赖），
  // 避免每次渲染都移除/重挂 window keydown 监听器
  const handlersRef = useRef(handlers)
  // 在提交后同步最新 handlers：渲染期写 ref 会违反 React 规范
  useEffect(() => {
    handlersRef.current = handlers
  })

  // 启动时加载用户自定义快捷键（若有）
  useEffect(() => {
    useNotesStore.getState().loadCustomShortcuts()
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const {
      onSearch,
      onUndo,
      onRedo,
      onSave,
      onNewDoc,
      onNewNotebook,
      onToggleSidebar,
      onToggleFavorite,
      onClose,
      onEscape,
      onBold,
      onItalic,
      onShortcutHelp,
    } = handlersRef.current

    if (e.key === 'Escape') {
      onEscape?.()
      onClose?.()
      return
    }

    const keys = eventToKeys(e)
    if (keys.length === 0) return

    const target = e.target as HTMLElement
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

    // 从 store 读取快捷键配置（含用户自定义覆盖），硬编码默认项作为回退
    const shortcuts = useNotesStore.getState().shortcuts
    const handlerMap: Partial<Record<ActionId, (() => void) | undefined>> = {
      search: onSearch,
      save: onSave,
      newDoc: onNewDoc,
      newNotebook: onNewNotebook,
      toggleSidebar: onToggleSidebar,
      toggleFavorite: onToggleFavorite,
      shortcutHelp: onShortcutHelp,
      undo: onUndo,
      redo: onRedo,
      bold: onBold,
      italic: onItalic,
    }

    for (const shortcut of shortcuts) {
      if (!matchesKeys(keys, shortcut.keys)) continue

      // 输入框内撤销/重做交由浏览器原生行为处理
      if (isInput && (shortcut.id === 'undo' || shortcut.id === 'redo')) return

      const handler = handlerMap[shortcut.id as ActionId]
      if (handler) {
        e.preventDefault()
        handler()
      }
      // 命中配置即停止匹配（无论是否有对应 handler），避免误触发其他动作
      return
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
