import type { StateCreator } from 'zustand'
import type { NotesStore } from '@/store/types'

export interface KeyboardShortcut {
  id: string
  name: string
  keys: string[]
  category: string
}

export interface KeyboardSlice {
  shortcuts: KeyboardShortcut[]
  customShortcuts: Record<string, string[]>
  updateShortcut: (id: string, keys: string[]) => void
  resetShortcuts: () => void
  loadCustomShortcuts: () => void
  saveCustomShortcuts: () => void
}

type KeyboardSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  KeyboardSlice
>

// 默认快捷键配置
const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { id: 'search', name: '打开搜索', keys: ['Ctrl', 'K'], category: '通用' },
  { id: 'save', name: '保存', keys: ['Ctrl', 'S'], category: '通用' },
  { id: 'newDoc', name: '新建文档', keys: ['Ctrl', 'N'], category: '通用' },
  { id: 'newNotebook', name: '新建知识库', keys: ['Ctrl', 'Shift', 'N'], category: '通用' },
  { id: 'toggleSidebar', name: '切换侧边栏', keys: ['Ctrl', '\\'], category: '通用' },
  { id: 'toggleFavorite', name: '收藏/取消收藏', keys: ['Ctrl', 'Shift', 'F'], category: '通用' },
  { id: 'shortcutHelp', name: '快捷键帮助', keys: ['Ctrl', '/'], category: '通用' },
  { id: 'undo', name: '撤销', keys: ['Ctrl', 'Z'], category: '编辑' },
  { id: 'redo', name: '重做', keys: ['Ctrl', 'Y'], category: '编辑' },
  { id: 'bold', name: '粗体', keys: ['Ctrl', 'B'], category: '编辑' },
  { id: 'italic', name: '斜体', keys: ['Ctrl', 'I'], category: '编辑' },
]

const CUSTOM_SHORTCUTS_KEY = 'notes-custom-shortcuts'

export const createKeyboardSlice: KeyboardSliceCreator = (set, get) => ({
  shortcuts: DEFAULT_SHORTCUTS,
  customShortcuts: {},

  updateShortcut: (id, keys) => {
    set((state) => {
      state.customShortcuts[id] = keys
      // 更新 shortcuts 数组中的对应项
      const shortcut = state.shortcuts.find(s => s.id === id)
      if (shortcut) {
        shortcut.keys = keys
      }
    })
    get().saveCustomShortcuts()
  },

  resetShortcuts: () => {
    set((state) => {
      state.customShortcuts = {}
      state.shortcuts = DEFAULT_SHORTCUTS
    })
    get().saveCustomShortcuts()
  },

  loadCustomShortcuts: () => {
    try {
      const saved = localStorage.getItem(CUSTOM_SHORTCUTS_KEY)
      if (saved) {
        const customShortcuts = JSON.parse(saved)
        set((state) => {
          state.customShortcuts = customShortcuts
          // 应用自定义快捷键到 shortcuts 数组
          Object.entries(customShortcuts).forEach(([id, keys]) => {
            const shortcut = state.shortcuts.find(s => s.id === id)
            if (shortcut) {
              shortcut.keys = keys as string[]
            }
          })
        })
      }
    } catch {
      // ignore
    }
  },

  saveCustomShortcuts: () => {
    try {
      const { customShortcuts } = get()
      localStorage.setItem(CUSTOM_SHORTCUTS_KEY, JSON.stringify(customShortcuts))
    } catch {
      // ignore
    }
  },
})
