import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { RecentView as RecentViewEntry } from '@/types'
import { useNotesStore } from '@/store'
import { EmptyState } from '@/components/common/EmptyState'
import { IconSearch } from '@/components/common/Icon'
import { formatRelativeTime } from '@/utils/formatters'

interface RecentViewProps {
  recentViews: RecentViewEntry[]
  onViewDoc: (notebookId: string, docId: string) => void
  /** 空态引导：去文档树打开一篇（打开即进入最近列表） */
  onGoToDocs?: () => void
}

/**
 * 跨知识库「最近编辑」视图。
 *
 * 背景：`recentViews` 一直由 App 维护并持久化（最近 50 条，按浏览顺序），
 * 但此前只被开始页取了前几条展示，没有地方能完整查看 —— 数据早就有了，
 * 缺的是一个入口。这里把它做成独立视图：跨库、按最近打开排序、可搜索。
 *
 * 注意：列表里的文档可能已被删除或移动，因此渲染前要按 id 校验存在性，
 * 否则会点出一篇"幽灵文档"。
 */
export default function RecentView({ recentViews, onViewDoc, onGoToDocs }: RecentViewProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  const { notebooks, activeDocId } = useNotesStore(useShallow((s) => ({
    notebooks: s.notebooks,
    activeDocId: s.activeDocId,
  })))

  /** id → 文档与所属知识库；一次建表，避免每条最近记录都线性查找 */
  const lookup = useMemo(() => {
    const map = new Map<string, { docId: string; title: string; notebookId: string; notebookTitle: string; updatedAt: string }>()
    for (const notebook of notebooks) {
      for (const doc of notebook.docs) {
        map.set(`${notebook.id}:${doc.id}`, {
          docId: doc.id,
          title: doc.title || '未命名文档',
          notebookId: notebook.id,
          notebookTitle: notebook.title,
          updatedAt: doc.updatedAt,
        })
      }
    }
    return map
  }, [notebooks])

  /** 过滤掉已删除的文档（recentViews 是持久化的历史，不保证仍然有效） */
  const items = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const resolved: {
      key: string
      docId: string
      notebookId: string
      title: string
      notebookTitle: string
      updatedAt: string
      viewedAt: string
    }[] = []

    for (const view of recentViews) {
      const hit = lookup.get(`${view.notebookId}:${view.docId}`)
      if (!hit) continue
      if (query && !hit.title.toLowerCase().includes(query) && !hit.notebookTitle.toLowerCase().includes(query)) {
        continue
      }
      resolved.push({ key: `${view.notebookId}:${view.docId}`, viewedAt: view.viewedAt, ...hit })
    }
    return resolved
  }, [recentViews, lookup, searchQuery])

  const handleOpen = (notebookId: string, docId: string): void => {
    onViewDoc(notebookId, docId)
  }

  return (
    <main className="editor-panel">
      <div className="trash-panel">
        <div className="trash-header">
          <h2>🕘 最近编辑</h2>
          <span className="trash-hint">
            {recentViews.length > 0
              ? `跨知识库，按最近打开排序（保留最近 ${recentViews.length} 条）`
              : '打开过的文档会出现在这里'}
          </span>
          {items.length > 0 && (
            <div className="trash-search">
              <input
                type="text"
                className="trash-search-input"
                placeholder="搜索最近文档…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="搜索最近文档"
              />
            </div>
          )}
        </div>

        {items.length === 0 ? (
          recentViews.length === 0 ? (
            <EmptyState
              icon="🕘"
              title="还没有浏览记录"
              description="打开任意一篇文档，它就会出现在这里，方便快速回到刚才的位置"
              actions={
                onGoToDocs
                  ? [{ label: '去打开一篇文档', icon: '📄', variant: 'primary', onClick: onGoToDocs }]
                  : undefined
              }
            />
          ) : (
            <EmptyState
              icon={<IconSearch size={32} />}
              title="没有匹配的文档"
              description={`最近记录里没有包含「${searchQuery.trim()}」的文档`}
              actions={[{ label: '清除搜索', icon: '✕', variant: 'secondary', onClick: () => setSearchQuery('') }]}
            />
          )
        ) : (
          <div className="recent-list">
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`recent-item ${activeDocId === item.docId ? 'active' : ''}`}
                onClick={() => handleOpen(item.notebookId, item.docId)}
                title={`${item.notebookTitle} › ${item.title}`}
              >
                <span className="recent-item-icon" aria-hidden="true">📄</span>
                <span className="recent-item-main">
                  <span className="recent-item-title">{item.title}</span>
                  <span className="recent-item-meta">
                    {item.notebookTitle} · 打开于 {formatRelativeTime(item.viewedAt)}
                  </span>
                </span>
                <span className="recent-item-time">{formatRelativeTime(item.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
