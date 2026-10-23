import { useState, useMemo } from 'react'
import type { JSX } from 'react'
import type { FavoriteDocItem } from '@/types'
import { useNotesStore } from '@/store'
import { useFavoriteDocs } from '@/hooks/useFavoriteDocs'
import { Editor } from '@/components/editor/Editor'
import { EmptyState } from '@/components/common/EmptyState'
import { IconStar } from '@/components/common/Icon'

type SortType = 'updated' | 'created' | 'name' | 'notebook'
type GroupType = 'none' | 'notebook'

interface FavoriteViewProps {
  activeDocId: string
  fontSize: string
  onFontSizeChange: (size: string) => void
  onViewDoc: (notebookId: string, docId: string) => void
  activeNotebookId: string
  /** 空态引导：跳到文档树去收藏第一篇（空态必须给出下一步动作） */
  onGoToDocs?: () => void
  onShowVersionHistory?: () => void
  onShowSharePanel?: () => void
  showOutlinePanel?: boolean
  onToggleOutlinePanel?: () => void
  showCommentsPanel?: boolean
  onToggleCommentsPanel?: () => void
}

export default function FavoriteView({
  activeDocId,
  fontSize,
  onFontSizeChange,
  onViewDoc,
  activeNotebookId,
  onGoToDocs,
  onShowVersionHistory,
  onShowSharePanel,
  showOutlinePanel,
  onToggleOutlinePanel,
  showCommentsPanel,
  onToggleCommentsPanel,
}: FavoriteViewProps): JSX.Element {
  const activeDoc = useNotesStore((s) => s.activeDoc)
  // 收藏列表订阅 notebooks（每次击键都会变），所以只在本视图里订阅，
  // 不能让 App 外壳代算 —— 否则整棵外壳跟着输入重渲染
  const favoriteDocs = useFavoriteDocs()
  const [sortBy, setSortBy] = useState<SortType>('updated')
  const [groupBy, setGroupBy] = useState<GroupType>('none')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // 排序后的收藏文档
  const sortedDocs = useMemo(() => {
    const sorted = [...favoriteDocs]
    
    sorted.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'updated':
          comparison = new Date(a.doc.updatedAt).getTime() - new Date(b.doc.updatedAt).getTime()
          break
        case 'created':
          comparison = new Date(a.doc.createdAt).getTime() - new Date(b.doc.createdAt).getTime()
          break
        case 'name':
          comparison = a.doc.title.localeCompare(b.doc.title, 'zh-CN')
          break
        case 'notebook':
          comparison = a.notebook.title.localeCompare(b.notebook.title, 'zh-CN')
          break
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })
    
    return sorted
  }, [favoriteDocs, sortBy, sortOrder])

  // 分组后的收藏文档
  const groupedDocs = useMemo(() => {
    if (groupBy === 'none') {
      return { '全部收藏': sortedDocs }
    }

    const groups: Record<string, FavoriteDocItem[]> = {}
    
    for (const item of sortedDocs) {
      const key = item.notebook.title
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(item)
    }
    
    return groups
  }, [sortedDocs, groupBy])

  const toggleSortOrder = (): void => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
  }

  return (
    <>
      <aside className="docs-sidebar">
        <div className="docs-header">
          <div className="docs-title-row">
            <span className="docs-icon">⭐</span>
            <span className="docs-title">收藏</span>
            <span className="docs-count">{favoriteDocs.length}</span>
          </div>
        </div>
        
        {/* 排序和分组控制 */}
        <div className="favorite-controls">
          <div className="favorite-sort-group">
            <label className="favorite-control-label">排序:</label>
            <select 
              className="favorite-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortType)}
            >
              <option value="updated">更新时间</option>
              <option value="created">创建时间</option>
              <option value="name">名称</option>
              <option value="notebook">所属知识库</option>
            </select>
            <button 
              className="favorite-sort-order-btn"
              onClick={toggleSortOrder}
              title={sortOrder === 'asc' ? '升序' : '降序'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
          
          <div className="favorite-sort-group">
            <label className="favorite-control-label">分组:</label>
            <select 
              className="favorite-select"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupType)}
            >
              <option value="none">不分组</option>
              <option value="notebook">按知识库</option>
            </select>
          </div>
        </div>

        <div className="docs-list">
          {favoriteDocs.length === 0 ? (
            <EmptyState
              icon={<IconStar size={32} />}
              title="暂无收藏"
              description="在文档树里点标题旁的星标，就能把常用文档固定到这里"
              actions={
                onGoToDocs
                  ? [
                      {
                        label: '去文档树收藏',
                        icon: '📄',
                        variant: 'primary',
                        onClick: onGoToDocs,
                      },
                    ]
                  : undefined
              }
            />
          ) : (
            Object.entries(groupedDocs).map(([groupName, docs]) => (
              <div key={groupName} className="favorite-group">
                {groupBy !== 'none' && (
                  <div className="favorite-group-header">
                    <span className="favorite-group-icon">📁</span>
                    <span className="favorite-group-name">{groupName}</span>
                    <span className="favorite-group-count">{docs.length}</span>
                  </div>
                )}
                {groupBy === 'none' && (
                  <div className="favorite-list-header">
                    <span className="favorite-col-name">名称</span>
                    <span className="favorite-col-belong">归属</span>
                    <span className="favorite-col-time">更新时间</span>
                  </div>
                )}
                {docs.map(({ notebook, doc }) => (
                  <div
                    key={doc.id}
                    className={`favorite-item ${activeDocId === doc.id ? "active" : ""}`}
                    onClick={() => onViewDoc(notebook.id, doc.id)}
                  >
                    <span className="favorite-item-name">{doc.title}</span>
                    {groupBy === 'none' && (
                      <>
                        <span className="favorite-item-belong">{notebook.title}</span>
                        <span className="favorite-item-time">
                          {new Date(doc.updatedAt).toLocaleString("zh-CN")}
                        </span>
                      </>
                    )}
                    {groupBy !== 'none' && (
                      <span className="favorite-item-time">
                        {new Date(doc.updatedAt).toLocaleString("zh-CN")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>
      <Editor
        activeDoc={activeDoc}
        activeNotebookId={activeNotebookId}
        activeDocId={activeDocId}
        fontSize={fontSize}
        onFontSizeChange={onFontSizeChange}
        onShowVersionHistory={onShowVersionHistory}
        onShowSharePanel={onShowSharePanel}
        showOutlinePanel={showOutlinePanel}
        onToggleOutlinePanel={onToggleOutlinePanel}
        showCommentsPanel={showCommentsPanel}
        onToggleCommentsPanel={onToggleCommentsPanel}
        onViewDoc={onViewDoc}
      />
    </>
  )
}
