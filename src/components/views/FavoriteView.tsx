import type { FavoriteDocItem } from '@/types'
import { Editor } from '@/components/editor/Editor'

interface FavoriteViewProps {
  favoriteDocs: FavoriteDocItem[]
  activeDocId: string
  fontSize: string
  onFontSizeChange: (size: string) => void
  onViewDoc: (notebookId: string, docId: string) => void
  activeDoc: import('@/types').NoteDoc | null
  activeNotebookId: string
  onShowVersionHistory?: () => void
  onShowSharePanel?: () => void
  showOutlinePanel?: boolean
  onToggleOutlinePanel?: () => void
  showCommentsPanel?: boolean
  onToggleCommentsPanel?: () => void
}

export default function FavoriteView({
  favoriteDocs,
  activeDocId,
  fontSize,
  onFontSizeChange,
  onViewDoc,
  activeDoc,
  activeNotebookId,
  onShowVersionHistory,
  onShowSharePanel,
  showOutlinePanel,
  onToggleOutlinePanel,
  showCommentsPanel,
  onToggleCommentsPanel,
}: FavoriteViewProps) {
  return (
    <>
      <aside className="docs-sidebar">
        <div className="docs-header">
          <div className="docs-title-row">
            <span className="docs-icon">⭐</span>
            <span className="docs-title">收藏</span>
          </div>
        </div>
        <div className="docs-list">
          {favoriteDocs.length === 0 ? (
            <div className="empty-favorite">
              <span className="empty-icon">⭐</span>
              <span className="empty-text">暂无收藏</span>
              <span className="empty-hint">点击文档上的星标进行收藏</span>
            </div>
          ) : (
            <>
              <div className="favorite-list-header">
                <span className="favorite-col-name">名称</span>
                <span className="favorite-col-belong">归属</span>
                <span className="favorite-col-time">更新时间</span>
              </div>
              {favoriteDocs.map(({ notebook, doc }) => (
                <div
                  key={doc.id}
                  className={`favorite-item ${activeDocId === doc.id ? "active" : ""}`}
                  onClick={() => onViewDoc(notebook.id, doc.id)}
                >
                  <span className="favorite-item-name">{doc.title}</span>
                  <span className="favorite-item-belong">{notebook.title}</span>
                  <span className="favorite-item-time">
                    {new Date(doc.updatedAt).toLocaleString("zh-CN")}
                  </span>
                </div>
              ))}
            </>
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
      />
    </>
  )
}