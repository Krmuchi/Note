import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNotesStore } from '@/store'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { buildQuickOpenIndex, rankQuickOpenItems, type QuickOpenItem } from '@/utils/quickOpen'
import { loadPinyinEngine, prebuildPinyinForms } from '@/utils/fuzzyMatch'
import { requestDocOpen } from '@/utils/docNavigation'
import { formatDateTime } from '@/utils/formatters'

interface QuickOpenPanelProps {
  isOpen: boolean
  onClose: () => void
}

/** 拼音索引空闲预构建的每批条数：单批几十条标题，一个空闲片不阻塞输入 */
const PREBUILD_BATCH = 60

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
  // P1-3：浮层统一接 useFocusTrap（Tab 循环 + Esc 关闭 + 关闭归还焦点）
  const panelRef = useFocusTrap<HTMLDivElement>(true, onClose)

  const index = useMemo(() => buildQuickOpenIndex(notebooks), [notebooks])
  /**
   * 拼音索引版本：空闲预构建每完成一批 +1，让已输入的查询按更全的索引重排
   * （拼音命中会随索引补齐"长出来"，而不是等用户再敲一键才更新）。
   */
  const [pinyinIndexVersion, setPinyinIndexVersion] = useState(0)
  const items = useMemo(() => {
    /*
     * pinyinIndexVersion 是拼音缓存的"代数"（预构建每完成一批 +1）：缓存不是普通
     * 响应式状态，用版本号把「索引变全」传导进依赖，已输入的查询才会按更全的索引重排。
     */
    void pinyinIndexVersion
    return rankQuickOpenItems(index, query)
  }, [index, query, pinyinIndexVersion])

  /**
   * 打开面板即预构建拼音索引（S6 性能）：
   * 1) 动态加载 pinyin-pro —— 独立 chunk，既不进启动 preload 也不进本 chunk 的同步依赖；
   * 2) requestIdleCallback 分批补建标题与路径的拼音缓存（jsdom 等无空闲回调的环境
   *    回落到 setTimeout）。
   * 1000 篇标题全量同步建索引约 300~800ms，以前整段发生在首键击键路径上；现在首键
   * 最多只按 rankQuickOpenItems 的预算补建一小批，其余在空闲片里慢慢补齐。
   */
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    let idleId: number | null = null
    let usedIdleCallback = false

    const schedule = (fn: () => void): void => {
      if (typeof window.requestIdleCallback === 'function') {
        usedIdleCallback = true
        idleId = window.requestIdleCallback(fn)
      } else {
        usedIdleCallback = false
        idleId = window.setTimeout(fn, 32)
      }
    }
    const cancelIdle = (): void => {
      if (idleId === null) return
      if (usedIdleCallback) window.cancelIdleCallback(idleId)
      else window.clearTimeout(idleId)
      idleId = null
    }

    // 标题先于路径：标题命中权重更高，先建标题让最可能的结果先齐
    const texts: string[] = []
    for (const item of index) texts.push(item.title)
    for (const item of index) texts.push(item.context)

    const buildBatch = (): void => {
      idleId = null
      if (cancelled) return
      const processed = prebuildPinyinForms(texts, PREBUILD_BATCH)
      // 批次没吃满预算＝索引已建完；有产出才 bump 版本触发重排
      if (processed > 0) setPinyinIndexVersion((v) => v + 1)
      if (processed === PREBUILD_BATCH) schedule(buildBatch)
    }

    void loadPinyinEngine().then(() => {
      if (!cancelled) schedule(buildBatch)
    })

    return () => {
      cancelled = true
      cancelIdle()
    }
  }, [isOpen, index])
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
      // 阻断冒泡：面板自关后不再交给全局 Escape 链，避免一次 Esc 连带关掉下一层面板
      e.stopPropagation()
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="quick-open-overlay" onClick={onClose} ref={panelRef}>
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
