import { useState, useMemo } from 'react'
import { toast } from '@/components/common/Toast'
import type { JSX } from 'react'
import type { TrashDoc } from '@/types'
import { TRASH_RETENTION_DAYS } from '@/shared/constants'
import { EmptyState } from '@/components/common/EmptyState'
import { IconSearch } from '@/components/common/Icon'

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

export default function TrashView({ trash, onRestore, onDelete, onClearTrash }: TrashViewProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  /** P2-15：回收站此前只能逐条恢复 —— 误删一批要点 20 次「恢复」 */
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filteredTrash = useMemo(() => {
    if (!searchQuery.trim()) return trash
    const query = searchQuery.toLowerCase()
    return trash.filter(item =>
      item.title.toLowerCase().includes(query) ||
      item.notebookTitle.toLowerCase().includes(query)
    )
  }, [trash, searchQuery])

  const toggleSelect = (docId: string): void =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(docId)) next.delete(docId)
      else next.add(docId)
      return next
    })

  const allSelected =
    filteredTrash.length > 0 && filteredTrash.every((item) => selected.has(item.id))

  const toggleSelectAll = (): void =>
    setSelected(allSelected ? new Set() : new Set(filteredTrash.map((item) => item.id)))

  /**
   * P2-15 批量恢复：按当前**可见列表**取值 —— 搜索过滤下不会把
   * 用户看不见的项一并恢复（那会像是背着自己改了数据）。
   */
  const handleRestoreSelected = (): void => {
    const ids = filteredTrash.filter((item) => selected.has(item.id)).map((item) => item.id)
    if (ids.length === 0) return
    ids.forEach((id) => onRestore(id))
    setSelected(new Set())
    setSelectMode(false)
    toast.success(`已从回收站恢复 ${ids.length} 篇文档`)
  }

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
              {/* P2-15：多选 + 批量恢复（旧版只有逐条恢复，误删一批要按很多次） */}
              <button
                type="button"
                className="btn-clear-trash"
                onClick={() => {
                  setSelectMode((mode) => !mode);
                  setSelected(new Set());
                }}
              >
                {selectMode ? '退出多选' : '多选'}
              </button>
              {selectMode && (
                <>
                  <button type="button" className="btn-clear-trash" onClick={toggleSelectAll}>
                    {allSelected ? '取消全选' : '全选'}
                  </button>
                  <span className="trash-selected-count">已选 {selected.size} 篇</span>
                  <button
                    type="button"
                    className="btn-clear-trash btn-restore-selected"
                    disabled={selected.size === 0}
                    onClick={handleRestoreSelected}
                  >
                    恢复所选
                  </button>
                </>
              )}
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
            icon={<IconSearch size={32} />}
            title="未找到匹配的文档"
            description="试试其他关键词"
          />
        ) : (
          <div className="trash-list">
            {filteredTrash.map((item) => {
              const remaining = getRemainingDays(item.deletedAt)
              return (
                <div key={item.id} className="trash-item">
                  {selectMode && (
                    <input
                      type="checkbox"
                      className="trash-select-checkbox"
                      aria-label={`选择 ${item.title}`}
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                  )}
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