import type { StateCreator } from 'zustand'
import type { NotesStore } from '@/store/types'
import {
  closeTabInList,
  MAX_OPEN_TABS,
  openTabInList,
  pickTabAfterClose,
  pruneTabs,
  type OpenTab,
} from '@/utils/openTabs'

/**
 * 多标签页状态（对齐语雀：同时打开多篇文档横向切换）。
 *
 * 只存引用，不存正文 —— 正文永远只有 store 里的那一份。
 * 标签列表是**本机视图状态**，因此持久化到 localStorage（与 notes-doc-sort、
 * notes-ui-state 同一惯例），不写进 notes-data.json：它不属于用户数据，
 * 也不该被备份/导出带走到另一台机器上。
 */

const OPEN_TABS_KEY = 'notes-open-tabs'

export interface TabSlice {
  /** 已打开的文档（按打开顺序，末尾是最近使用） */
  openTabs: OpenTab[]
  /** 打开/激活一个标签 */
  openTab: (notebookId: string, docId: string) => void
  /**
   * 关闭标签，返回关闭后应激活的目标（null 表示没有剩余标签）。
   * 返回目标而不是在 slice 里直接改 activeDocId：调用方（App）需要在跳转时
   * 同步最近浏览记录与视图切换，那些属于 UI 层职责。
   */
  closeTab: (tab: OpenTab) => OpenTab | null
  /** 从持久化恢复标签列表 */
  loadOpenTabs: () => void
  /** 清理已不存在的文档标签（文档被删除/移动后调用） */
  pruneOpenTabs: () => void
}

type TabSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  TabSlice
>

function persistTabs(tabs: OpenTab[]): void {
  try {
    localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(tabs))
  } catch {
    // 存储不可用：标签是纯体验功能，失败不应影响使用
  }
}

export const createTabSlice: TabSliceCreator = (set, get) => ({
  openTabs: [],

  openTab: (notebookId, docId) => {
    if (!notebookId || !docId) return
    set((state) => {
      const next = openTabInList(state.openTabs, { notebookId, docId })
      // 无变化时保持原引用，避免每次点同一篇文档都触发订阅者重渲染
      if (
        next.length === state.openTabs.length &&
        next.every((t, i) => t.notebookId === state.openTabs[i].notebookId && t.docId === state.openTabs[i].docId)
      ) {
        return
      }
      state.openTabs = next
    })
    persistTabs(get().openTabs)
  },

  closeTab: (tab) => {
    const state = get()
    const activeTab: OpenTab | null =
      state.activeDocId && state.activeNotebookId
        ? { notebookId: state.activeNotebookId, docId: state.activeDocId }
        : null

    const remaining = closeTabInList(state.openTabs, tab)
    const nextActive = pickTabAfterClose(remaining, tab, activeTab)

    set((draft) => {
      draft.openTabs = remaining
    })
    persistTabs(remaining)

    return nextActive
  },

  loadOpenTabs: () => {
    try {
      const raw = localStorage.getItem(OPEN_TABS_KEY)
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return

      // 逐项校验结构：手改过的 localStorage 不该让标签栏崩掉
      const tabs: OpenTab[] = []
      for (const item of parsed) {
        if (
          item &&
          typeof item === 'object' &&
          typeof (item as OpenTab).notebookId === 'string' &&
          typeof (item as OpenTab).docId === 'string' &&
          (item as OpenTab).notebookId &&
          (item as OpenTab).docId
        ) {
          tabs.push({ notebookId: (item as OpenTab).notebookId, docId: (item as OpenTab).docId })
        }
        if (tabs.length >= MAX_OPEN_TABS) break
      }

      set((state) => {
        state.openTabs = tabs
      })
    } catch {
      // 数据损坏：从空标签开始，不影响正常使用
    }
  },

  pruneOpenTabs: () => {
    const { notebooks, openTabs } = get()
    const pruned = pruneTabs(openTabs, (notebookId, docId) => {
      const notebook = notebooks.find((nb) => nb.id === notebookId)
      return Boolean(notebook?.docs.some((doc) => doc.id === docId))
    })

    // 引用相等说明没有失效项，跳过写入避免无谓的 localStorage 写与重渲染
    if (pruned.length === openTabs.length) return

    set((state) => {
      state.openTabs = pruned
    })
    persistTabs(pruned)
  },
})
