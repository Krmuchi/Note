import { lazy, Suspense } from 'react'
import type { RecentView, NoteDoc } from '@/types'
import type { ViewType, LeftMenuType } from '@/hooks/useUIState'
import { LazyLoader } from '@/components/common/LazyLoader'
import TrashView from '@/components/views/TrashView'
import FavoriteView from '@/components/views/FavoriteView'
import NotebooksView from '@/components/views/NotebooksView'

const StartPage = lazy(() => import('@/components/start/StartPage'))
const TagPanel = lazy(() => import('@/components/tags/TagPanel'))
const QuickNotePanel = lazy(() => import('@/components/notes/QuickNotePanel'))

interface MainContentProps {
  activeLeftMenu: LeftMenuType
  activeView: ViewType
  recentViews: RecentView[]
  activeDoc: NoteDoc | null
  activeNotebookId: string
  activeDocId: string
  searchText: string
  trash: import('@/types').TrashDoc[]
  fontSize: string
  favoriteDocs: import('@/types').FavoriteDocItem[]
  isMobile: boolean
  docsSidebarWidth: number | undefined
  dragging: string | null
  showOutlinePanel: boolean
  showCommentsPanel: boolean
  onViewDoc: (notebookId: string, docId: string) => void
  onSearchChange: (value: string) => void
  onCreateDoc: (notebookId: string, parentId: string | null) => void
  onCreateNotebook: (title: string) => void
  onRestoreFromTrash: (docId: string) => void
  onDeleteFromTrash: (docId: string) => void
  onClearTrash: () => void
  onFontSizeChange: (size: string) => void
  onSetActiveLeftMenu: (menu: LeftMenuType) => void
  onShowVersionHistory: () => void
  onShowSharePanel: () => void
  onToggleOutlinePanel: () => void
  onToggleCommentsPanel: () => void
  onDocsResizeStart: (e: React.MouseEvent) => void
  onDocsResizeReset: () => void
}

export function MainContent({
  activeLeftMenu,
  activeView,
  recentViews,
  activeDoc,
  activeNotebookId,
  activeDocId,
  searchText,
  trash,
  fontSize,
  favoriteDocs,
  isMobile,
  docsSidebarWidth,
  dragging,
  showOutlinePanel,
  showCommentsPanel,
  onViewDoc,
  onSearchChange,
  onCreateDoc,
  onCreateNotebook,
  onRestoreFromTrash,
  onDeleteFromTrash,
  onClearTrash,
  onFontSizeChange,
  onSetActiveLeftMenu,
  onShowVersionHistory,
  onShowSharePanel,
  onToggleOutlinePanel,
  onToggleCommentsPanel,
  onDocsResizeStart,
  onDocsResizeReset,
}: MainContentProps) {
  if (activeLeftMenu === 'start') {
    return (
      <main className="start-panel">
        <LazyLoader>
          <StartPage
            recentViews={recentViews}
            onViewDoc={onViewDoc}
            onCreateDoc={onCreateDoc}
            onCreateNotebook={onCreateNotebook}
          />
        </LazyLoader>
      </main>
    )
  }

  if (activeLeftMenu === 'note') {
    return (
      <main className="editor-panel">
        <LazyLoader>
          <QuickNotePanel />
        </LazyLoader>
      </main>
    )
  }

  if (activeLeftMenu === 'tags') {
    return (
      <main className="editor-panel">
        <LazyLoader>
          <Suspense fallback={<div style={{ padding: 20, textAlign: 'center', color: '#999' }}>加载中...</div>}>
            <TagPanel key="tags-panel" isOpen={true} onClose={() => onSetActiveLeftMenu('notebooks')} />
          </Suspense>
        </LazyLoader>
      </main>
    )
  }

  if (activeView === 'trash') {
    return (
      <TrashView
        trash={trash}
        onRestore={onRestoreFromTrash}
        onDelete={onDeleteFromTrash}
        onClearTrash={onClearTrash}
      />
    )
  }

  if (activeView === 'favorite') {
    return (
      <FavoriteView
        favoriteDocs={favoriteDocs}
        activeDocId={activeDocId}
        fontSize={fontSize}
        onFontSizeChange={onFontSizeChange}
        onViewDoc={onViewDoc}
        activeDoc={activeDoc}
        activeNotebookId={activeNotebookId}
        onShowVersionHistory={onShowVersionHistory}
        onShowSharePanel={onShowSharePanel}
        showOutlinePanel={showOutlinePanel}
        onToggleOutlinePanel={onToggleOutlinePanel}
        showCommentsPanel={showCommentsPanel}
        onToggleCommentsPanel={onToggleCommentsPanel}
      />
    )
  }

  return (
    <NotebooksView
      searchText={searchText}
      onSearchChange={onSearchChange}
      onViewDoc={onViewDoc}
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
      docsSidebarWidth={isMobile ? undefined : docsSidebarWidth}
      onDocsResizeStart={onDocsResizeStart}
      onDocsResizeReset={onDocsResizeReset}
      docsDragging={dragging === 'docs'}
    />
  )
}