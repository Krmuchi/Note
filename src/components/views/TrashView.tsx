import { useState, useMemo } from 'react'
import type { TrashDoc } from '@/types'
import { TRASH_RETENTION_DAYS } from '@/shared/constants'
import { EmptyState } from '@/components/common/EmptyState'

interface TrashViewProps {
  trash: TrashDoc[]
  onRestore: (docId: string) => void
  onDelete: (docId: string) => void
  onClearTrash: () => void
}

const getRemainingDays = (deletedAt: string): number => {
  const deletedDate = new Date(deletedAt)
  const now = new Date()
  const diffMs = now.getTime() - deletedDate.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return Math.max(0, TRASH_RETENTION_DAYS - diffDays)
}

export default function TrashView({ trash, onRestore, onDelete, onClearTrash }: TrashViewProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTrash = useMemo(() => {
    if (!searchQuery.trim()) return trash
    const query = searchQuery.toLowerCase()
    return trash.filter(item =>
      item.title.toLowerCase().includes(query) ||
      item.notebookTitle.toLowerCase().includes(query)
    )
  }, [trash, searchQuery])

  return (
    <main className="editor-panel">
      <div className="trash-panel">
        <div className="trash-header">
          <h2>🗑️ 回收站</h2>
          <span className="trash-hint">文档将在 {TRASH_RETENTION_DAYS} 天后自动清理</span>
          {trash.length > 0 && (
            <>
              <div className="trash-search">
                <input
                  type="text"
                  className="trash-search-input"
                  placeholder="搜索回收站文档..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="trash-search-clear" onClick={() => setSearchQuery('')}>
                    ×
                  </button>
                )}
              </div>
              <button className="btn-clear-trash" onClick={onClearTrash}>
                清空回收站
              </button>
            </>
          )}
        </div>
        {trash.length === 0 ? (
          <EmptyState
            icon="🗑️"
            title="回收站为空"
            description={`删除的文档会在这里显示，${TRASH_RETENTION_DAYS} 天后自动清理`}
          />
        ) : filteredTrash.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="未找到匹配的文档"
            description="试试其他关键词"
          />
        ) : (
          <div className="trash-list">
            {filteredTrash.map((item) => {
              const remaining = getRemainingDays(item.deletedAt)
              return (
                <div key={item.id} className="trash-item">
                  <span className="trash-item-title">{item.title}</span>
                  <span className="trash-item-notebook">{item.notebookTitle}</span>
                  <span className="trash-item-time">{new Date(item.deletedAt).toLocaleString()}</span>
                  <span className={`trash-item-remaining ${remaining <= 3 ? 'expiring' : ''}`}>
                    {remaining > 0 ? `${remaining}天后清理` : '即将清理'}
                  </span>
                  <button className="btn-restore" onClick={() => onRestore(item.id)}>
                    恢复
                  </button>
                  <button className="btn-delete" onClick={() => onDelete(item.id)}>
                    删除
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}