import { useState, useMemo, useCallback } from 'react'
import type { JSX } from 'react'
import type { FavoriteDocItem } from '@/types'
import { useNotesStore, selectActiveDoc } from '@/store'
import { useFavoriteDocs } from '@/hooks/useFavoriteDocs'
import { uiActions, useUIState } from '@/hooks/useUIState'
import { recordRecentView } from '@/services/recentViews'
import { Editor } from '@/components/editor/Editor'
import { EmptyState } from '@/components/common/EmptyState'
import { IconClose, IconDocument, IconFolder, IconSearch, IconStar } from '@/components/common/Icon'

type SortType = 'updated' | 'created' | 'name' | 'notebook'
type GroupType = 'none' | 'notebook'

/**
 * 收藏视图。
 *
 * 字号 / 面板开关 / 版本历史 / 分享面板都改为自订阅 `useUIState`，
 * 不再由 App 一层层透传 —— 这些是全局 UI 状态，任何视图都能自取。
 */
interface FavoriteViewProps {
  activeDocId: string
  /**
   * 保留以兼容 MainContent 传参。视图内打开文档**不走它**：
   * App.handleViewDoc 会强制切回 notebooks 视图，把同屏的收藏列表替换掉。
   */
  onViewDoc: (notebookId: string, docId: string) => void
  activeNotebookId: string
  /** 空态引导：跳到文档树去收藏第一篇（空态必须给出下一步动作） */
  onGoToDocs?: () => void
}

export default function FavoriteView({
  activeDocId,
  activeNotebookId,
  onGoToDocs,
}: FavoriteViewProps): JSX.Element {
  const { fontSize, showOutlinePanel, showCommentsPanel } = useUIState()
  const { setFontSize, toggleShowOutlinePanel, toggleShowCommentsPanel, setShowVersionHistory, setShowSharePanel } = uiActions
  const activeDoc = useNotesStore(selectActiveDoc)
  const setActiveNotebookId = useNotesStore((s) => s.setActiveNotebookId)
  const setActiveDocId = useNotesStore((s) => s.setActiveDocId)

  /**
   * 收藏视图本地打开：只切换活动文档，不切视图。
   * 本视图是"左列表右编辑器"同屏布局；旧实现点列表项走 onViewDoc（App.handleViewDoc），
   * 会把 activeView 强制切回 notebooks —— 收藏列表瞬间消失，连续翻阅的动线被打断。
   */
  const handleOpenFavorite = useCallback((notebookId: string, docId: string): void => {
    // 记录最近浏览：与 App.handleViewDoc 共用同一份服务，
    // 否则在收藏里翻阅的文档不会进「最近」列表（视图不切换 ≠ 不算浏览）
    recordRecentView(notebookId, docId)
    setActiveNotebookId(notebookId)
    setActiveDocId(docId)
  }, [setActiveNotebookId, setActiveDocId])
  // 收藏列表订阅 notebooks（每次击键都会变），所以只在本视图里订阅，
  // 不能让 App 外壳代算 —— 否则整棵外壳跟着输入重渲染
  const favoriteDocs = useFavoriteDocs()
  /** P2-15：收藏多了只能肉眼扫 —— 补一个与最近/回收站同款的就地过滤 */
  const [favoriteQuery, setFavoriteQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortType>('updated')
  const [groupBy, setGroupBy] = useState<GroupType>('none')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // 过滤后的收藏文档（标题 / 所属知识库，大小写不敏感）
  const filteredDocs = useMemo(() => {
    const query = favoriteQuery.trim().toLowerCase();
    if (!query) return favoriteDocs;
    return favoriteDocs.filter(
      ({ doc, notebook }) =>
        doc.title.toLowerCase().includes(query) ||
        notebook.title.toLowerCase().includes(query),
    );
  }, [favoriteDocs, favoriteQuery]);

  // 排序后的收藏文档
  const sortedDocs = useMemo(() => {
    const sorted = [...filteredDocs]
    
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
  }, [filteredDocs, sortBy, sortOrder])

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
            <span className="docs-icon" aria-hidden="true"><IconStar size={16} /></span>
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

        {/* P2-15：收藏列表的就地过滤（最近/回收站早就有，这里补齐） */}
        {favoriteDocs.length > 0 && (
          <div className="favorite-search">
            <input
              type="text"
              className="favorite-search-input"
              placeholder="搜索收藏…"
              aria-label="搜索收藏文档"
              value={favoriteQuery}
              onChange={(e) => setFavoriteQuery(e.target.value)}
            />
          </div>
        )}

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
                        icon: <IconDocument size={14} />,
                        variant: 'primary',
                        onClick: onGoToDocs,
                      },
                    ]
                  // 显式空数组：没有 onGoToDocs 回调时无出口可给（而非省略整个字段）
                  : []
              }
            />
          ) : filteredDocs.length === 0 ? (
            // 有过滤就必须有过滤的空态，否则列表区一片空白，看不出是筛没了
            <EmptyState
              icon={<IconSearch size={32} />}
              title="没有匹配的收藏"
              description={
                '没有标题或知识库包含「' + favoriteQuery.trim() + '」的收藏'
              }
              actions={[
                {
                  label: '清除搜索',
                  icon: <IconClose size={14} />,
                  variant: 'secondary',
                  onClick: () => setFavoriteQuery(''),
                },
              ]}
            />
          ) : (
            Object.entries(groupedDocs).map(([groupName, docs]) => (
              <div key={groupName} className="favorite-group">
                {groupBy !== 'none' && (
                  <div className="favorite-group-header">
                    <span className="favorite-group-icon" aria-hidden="true"><IconFolder size={16} /></span>
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
                    onClick={() => handleOpenFavorite(notebook.id, doc.id)}
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
        onFontSizeChange={setFontSize}
        onShowVersionHistory={() => setShowVersionHistory(true)}
        onShowSharePanel={() => setShowSharePanel(true)}
        showOutlinePanel={showOutlinePanel}
        onToggleOutlinePanel={toggleShowOutlinePanel}
        showCommentsPanel={showCommentsPanel}
        onToggleCommentsPanel={toggleShowCommentsPanel}
        onViewDoc={handleOpenFavorite}
      />
    </>
  )
}
