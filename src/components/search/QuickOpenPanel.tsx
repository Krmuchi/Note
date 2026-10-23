import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNotesStore } from '@/store'
import { buildQuickOpenIndex, rankQuickOpenItems, type QuickOpenItem } from '@/utils/quickOpen'
import { requestDocOpen } from '@/utils/docNavigation'
import { formatDateTime } from '@/utils/formatters'

interface QuickOpenPanelProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * 全局快速打开（N1，Ctrl+P）：输入几个字直达任意文档。
 *
 * 面板只在打开时挂载（App 条件渲染），因此可以放心订阅 notebooks：
 * 关闭期间零订阅成本，打开期间用户在输入框打字也不会改动 store。
 * 也因此不需要"打开时重置 query"的 effect（那会触发 set-state-in-effect）。
 */
export default function QuickOpenPanel({ isOpen, onClose }: QuickOpenPanelProps): React.JSX.Element | null {
  // 单个字段本身就是稳定引用，不需要 useShallow
  const notebooks = useNotesStore((s) => s.notebooks)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const index = useMemo(() => buildQuickOpenIndex(notebooks), [notebooks])
  const items = useMemo(() => rankQuickOpenItems(index, query), [index, query])
  const safeIndex = items.length === 0 ? -1 : Math.min(activeIndex, items.length - 1)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 高亮项滚动进可视区（纯 DOM 操作）
  useEffect(() => {
    const container = listRef.current
    if (!container || safeIndex < 0) return
    container.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [safeIndex])

  const openItem = useCallback(
    (item: QuickOpenItem | undefined) => {
      if (!item) return
      requestDocOpen({ notebookId: item.notebookId, docId: item.docId })
      onClose()
    },
    [onClose],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(items.length === 0 ? 0 : (safeIndex + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(items.length === 0 ? 0 : (safeIndex - 1 + items.length) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      openItem(items[safeIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="quick-open-overlay" onClick={onClose}>
      <div
        className="quick-open-panel"
        role="dialog"
        aria-modal="true"
        aria-label="快速打开"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="quick-open-input"
          value={query}
          placeholder="输入文档标题…"
          aria-label="快速打开文档"
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={handleKeyDown}
        />

        <div className="quick-open-list" ref={listRef} role="listbox">
          {items.length === 0 ? (
            <div className="quick-open-empty">没有匹配的文档</div>
          ) : (
            items.map((item, i) => (
              <button
                key={`${item.notebookId}:${item.docId}`}
                type="button"
                role="option"
                aria-selected={i === safeIndex}
                data-active={i === safeIndex}
                className={`quick-open-item ${i === safeIndex ? 'active' : ''}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => openItem(item)}
              >
                <span className="quick-open-title">{item.title}</span>
                {item.context && <span className="quick-open-context">{item.context}</span>}
                <span className="quick-open-time">
                  {formatDateTime(item.updatedAt, { prefixToday: true, prefixYesterday: true })}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="quick-open-footer">
          <span>{query.trim() ? `找到 ${items.length} 篇` : '最近编辑'}</span>
          <span className="quick-open-keys">
            <kbd>↑</kbd>
            <kbd>↓</kbd> 选择 · <kbd>Enter</kbd> 打开 · <kbd>Esc</kbd> 关闭
          </span>
        </div>
      </div>
    </div>
  )
}
