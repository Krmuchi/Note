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

// 默认快捷键配置（单一数据源：全局快捷键、编辑器内快捷键、帮助面板均从此读取）
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
  { id: 'underline', name: '下划线', keys: ['Ctrl', 'U'], category: '编辑' },
  { id: 'strike', name: '删除线', keys: ['Ctrl', 'Shift', 'X'], category: '编辑' },
  { id: 'code', name: '行内代码', keys: ['Ctrl', 'E'], category: '编辑' },
  { id: 'heading1', name: '标题 1', keys: ['Ctrl', '1'], category: '编辑' },
  { id: 'heading2', name: '标题 2', keys: ['Ctrl', '2'], category: '编辑' },
  { id: 'heading3', name: '标题 3', keys: ['Ctrl', '3'], category: '编辑' },
  { id: 'heading4', name: '标题 4', keys: ['Ctrl', '4'], category: '编辑' },
  { id: 'heading5', name: '标题 5', keys: ['Ctrl', '5'], category: '编辑' },
  { id: 'heading6', name: '标题 6', keys: ['Ctrl', '6'], category: '编辑' },
  // 数字/句点键在 Shift 按下时 e.key 会变成符号（Shift+8 → '*'），故按实际字符登记
  { id: 'ulist', name: '无序列表', keys: ['Ctrl', 'Shift', '*'], category: '编辑' },
  { id: 'olist', name: '有序列表', keys: ['Ctrl', 'Shift', '('], category: '编辑' },
  { id: 'tasklist', name: '任务列表', keys: ['Ctrl', 'Shift', '>'], category: '编辑' },
  // 引用：Ctrl+Shift+> 在部分输入法下不可靠，改绑 Ctrl+Alt+Q
  { id: 'quote', name: '引用块', keys: ['Ctrl', 'Alt', 'Q'], category: '编辑' },
  // 链接：Ctrl+K 已被搜索占用
  { id: 'link', name: '插入链接', keys: ['Ctrl', 'Shift', 'L'], category: '编辑' },
  { id: 'plainTextPaste', name: '纯文本粘贴', keys: ['Ctrl', 'Shift', 'V'], category: '编辑' },
  { id: 'copyAsMarkdown', name: '复制为 Markdown', keys: ['Ctrl', 'Alt', 'C'], category: '编辑' },
  { id: 'duplicateLine', name: '复制当前行', keys: ['Ctrl', 'D'], category: '编辑' },
  { id: 'moveLineUp', name: '上移当前行', keys: ['Alt', 'ArrowUp'], category: '编辑' },
  { id: 'moveLineDown', name: '下移当前行', keys: ['Alt', 'ArrowDown'], category: '编辑' },
  { id: 'deleteLine', name: '删除当前行', keys: ['Ctrl', 'Shift', 'K'], category: '编辑' },
  { id: 'indent', name: '增加缩进', keys: ['Ctrl', ']'], category: '编辑' },
  { id: 'outdent', name: '减少缩进', keys: ['Ctrl', '['], category: '编辑' },
  { id: 'insertLineBelow', name: '下方插入行', keys: ['Ctrl', 'Enter'], category: '编辑' },
  { id: 'insertLineAbove', name: '上方插入行', keys: ['Ctrl', 'Shift', 'Enter'], category: '编辑' },
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
