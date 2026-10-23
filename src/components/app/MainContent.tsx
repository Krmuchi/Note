import { lazy } from 'react'
import type { JSX } from 'react'
import type { RecentView as RecentViewEntry } from '@/types'
import type { ViewType, LeftMenuType } from '@/hooks/useUIState'
import { LazyLoader } from '@/components/common/LazyLoader'
import TrashView from '@/components/views/TrashView'
import FavoriteView from '@/components/views/FavoriteView'
import RecentView from '@/components/views/RecentView'
import NotebooksView from '@/components/views/NotebooksView'

const StartPage = lazy(() => import('@/components/start/StartPage'))
const TagPanel = lazy(() => import('@/components/tags/TagPanel'))
const QuickNotePanel = lazy(() => import('@/components/notes/QuickNotePanel'))

interface MainContentProps {
  activeLeftMenu: LeftMenuType
  activeView: ViewType
  recentViews: RecentViewEntry[]
  activeNotebookId: string
  activeDocId: string
  searchText: string
  trash: import('@/types').TrashDoc[]
  fontSize: string
  isMobile: boolean
  /** 紧凑窗口：文档列表收起为窄条 */
  isCompact: boolean
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
  /** 空态引导：从收藏页跳到文档树 */
  onGoToDocs: () => void
  /** 鼠标或触摸都能发起调宽（A4） */
  onDocsResizeStart: (e: React.MouseEvent | React.TouchEvent) => void
  onDocsResizeReset: () => void
}

export function MainContent({
  activeLeftMenu,
  activeView,
  recentViews,
  activeNotebookId,
  activeDocId,
  searchText,
  trash,
  fontSize,
  isMobile,
  isCompact,
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
  onGoToDocs,
  onDocsResizeStart,
  onDocsResizeReset,
}: MainContentProps): JSX.Element {
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
        {/* LazyLoader 自带 Suspense 与统一加载态，不要再套一层内联 fallback（V1 四态一致性） */}
        <LazyLoader>
          <TagPanel key="tags-panel" isOpen={true} onClose={() => onSetActiveLeftMenu('notebooks')} />
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

  if (activeView === 'recent') {
    return (
      <RecentView
        recentViews={recentViews}
        onViewDoc={onViewDoc}
        onGoToDocs={onGoToDocs}
      />
    )
  }

  if (activeView === 'favorite') {
    return (
      <FavoriteView
        activeDocId={activeDocId}
        fontSize={fontSize}
        onFontSizeChange={onFontSizeChange}
        onViewDoc={onViewDoc}
        activeNotebookId={activeNotebookId}
        onGoToDocs={onGoToDocs}
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
      isMobile={isMobile}
      isCompact={isCompact}
    />
  )
}