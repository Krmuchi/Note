import React, { useMemo, useRef } from 'react'
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

  /**
   * P1-10：标签栏的键盘语义。旧版只给当前标签 tabIndex=0、只处理 Enter/Space ——
   * 其余标签对键盘用户完全不可达（Tab 跳不到，方向键也没反应）。
   * 按 APG 的 tablist 自动激活模式：←/→ 在标签间移动并直接切换（与鼠标点击等价），
   * Home/End 跳首尾，Delete 关闭当前聚焦的标签（全局 Ctrl+W 的行内等价物）。
   *
   * ref 必须声明在下面的早退之前 —— hooks 不允许出现在条件返回之后。
   */
  const listRef = useRef<HTMLDivElement>(null);

  // 只有一个标签时不显示：此时标签栏没有切换价值，白占一行高度
  if (openTabs.length <= 1) return null

  /** DOM 顺序的标签元素 → store 里的标签（失效标签不渲染，两者未必一一对应） */
  const tabOfElement = (el: HTMLElement | undefined): OpenTab | null => {
    const key = el?.getAttribute('data-tab-key');
    if (!key) return null;
    return openTabs.find((tab) => tabKey(tab) === key) ?? null;
  };

  const handleListKeyDown = (e: React.KeyboardEvent): void => {
    const tabs = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [],
    );
    if (tabs.length === 0) return;
    const active = document.activeElement;
    const index = tabs.findIndex((tab) => tab === active);

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowLeft': {
        e.preventDefault();
        const current = index < 0 ? 0 : index;
        const next =
          e.key === 'ArrowRight'
            ? (current + 1) % tabs.length
            : (current - 1 + tabs.length) % tabs.length;
        tabs[next]?.focus();
        const target = tabOfElement(tabs[next]);
        if (target) onActivate(target.notebookId, target.docId);
        break;
      }
      case 'Home':
      case 'End': {
        e.preventDefault();
        const next = e.key === 'Home' ? 0 : tabs.length - 1;
        tabs[next]?.focus();
        const target = tabOfElement(tabs[next]);
        if (target) onActivate(target.notebookId, target.docId);
        break;
      }
      case 'Delete':
      case 'Backspace': {
        if (index < 0) return;
        e.preventDefault();
        const closing = tabOfElement(tabs[index]);
        if (!closing) return;
        const next = closeTab(closing);
        if (next) onActivate(next.notebookId, next.docId);
        // 焦点跟随到新的激活标签：关闭的元素即将卸载，
        // 不显式移动的话焦点掉到 body，方向键导航随之失效
        requestAnimationFrame(() => {
          const key = next ? tabKey(next) : null;
          const target = key
            ? listRef.current?.querySelector<HTMLElement>(`[data-tab-key="${key}"]`)
            : null;
          (target ?? listRef.current?.querySelector<HTMLElement>('[role="tab"]'))?.focus();
        });
        break;
      }
      default:
        break;
    }
  };

  return (
    <div
      className="doc-tab-bar"
      role="tablist"
      aria-label="已打开的文档"
      ref={listRef}
      onKeyDown={handleListKeyDown}
    >
      {openTabs.map((tab) => {
        const isActive = isSameTab(tab, activeTab)
        const meta = titleMap.get(tabKey(tab))
        // 文档已被删除：不渲染按钮，避免点出一篇幽灵文档
        if (!meta) return null

        return (
          <div
            key={tabKey(tab)}
            data-tab-key={tabKey(tab)}
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
              /* tablist 的 roving tabindex 模型：关闭钮不进 Tab 序，
                 键盘等价操作是聚焦标签后按 Delete */
              tabIndex={-1}
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
