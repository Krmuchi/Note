import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNotesStore } from '@/store'
import { isSameTab, tabKey, type OpenTab } from '@/utils/openTabs'

interface TabBarProps {
  /** 点击标签时切过去（走 App 的 handleViewDoc，以便同步最近浏览与视图） */
  onActivate: (notebookId: string, docId: string) => void
}

/**
 * 文档标签栏（对齐语雀的多标签页）。
 *
 * 数据来自 `tabSlice.openTabs`，其中只存引用；标题每次渲染从 notebooks 里取，
 * 因此在别处改名后标签会立即跟着变 —— 不会出现"标签上是旧标题"的错位。
 *
 * 关闭当前标签时会自动切到相邻标签（规则见 utils/openTabs.pickTabAfterClose）。
 */
export const TabBar: React.FC<TabBarProps> = ({ onActivate }) => {
  const { openTabs, activeNotebookId, activeDocId, closeTab, notebooks } = useNotesStore(
    useShallow((s) => ({
      openTabs: s.openTabs,
      activeNotebookId: s.activeNotebookId,
      activeDocId: s.activeDocId,
      closeTab: s.closeTab,
      notebooks: s.notebooks,
    })),
  )

  /** docId → { title, notebookTitle }：一次建表，避免每个标签都做两次查找 */
  const titleMap = useMemo(() => {
    const map = new Map<string, { title: string; notebookTitle: string }>()
    for (const notebook of notebooks) {
      for (const doc of notebook.docs) {
        map.set(`${notebook.id}:${doc.id}`, {
          title: doc.title || '未命名文档',
          notebookTitle: notebook.title,
        })
      }
    }
    return map
  }, [notebooks])

  const activeTab: OpenTab = { notebookId: activeNotebookId, docId: activeDocId }

  const handleClose = (e: React.MouseEvent, tab: OpenTab): void => {
    // 阻止冒泡：点在关闭按钮上不应同时触发标签激活
    e.stopPropagation()
    const next = closeTab(tab)
    if (next) onActivate(next.notebookId, next.docId)
  }

  // 只有一个标签时不显示：此时标签栏没有切换价值，白占一行高度
  if (openTabs.length <= 1) return null

  return (
    <div className="doc-tab-bar" role="tablist" aria-label="已打开的文档">
      {openTabs.map((tab) => {
        const isActive = isSameTab(tab, activeTab)
        const meta = titleMap.get(tabKey(tab))
        // 文档已被删除：不渲染按钮，避免点出一篇幽灵文档
        if (!meta) return null

        return (
          <div
            key={tabKey(tab)}
            className={`doc-tab ${isActive ? 'active' : ''}`}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            title={`${meta.notebookTitle} › ${meta.title}`}
            onClick={() => onActivate(tab.notebookId, tab.docId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onActivate(tab.notebookId, tab.docId)
              }
            }}
          >
            <span className="doc-tab-title">{meta.title}</span>
            <button
              type="button"
              className="doc-tab-close"
              onClick={(e) => handleClose(e, tab)}
              aria-label={`关闭 ${meta.title}`}
              title="关闭标签"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default TabBar
