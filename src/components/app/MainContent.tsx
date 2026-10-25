import { lazy } from 'react'
import type { JSX } from 'react'
import type { RecentView as RecentViewEntry } from '@/types'
import { useUIState } from '@/hooks/useUIState'
import { LazyLoader } from '@/components/common/LazyLoader'
import TrashView from '@/components/views/TrashView'
import FavoriteView from '@/components/views/FavoriteView'
import RecentView from '@/components/views/RecentView'
import NotebooksView from '@/components/views/NotebooksView'

const StartPage = lazy(() => import('@/components/start/StartPage'))
const TagPanel = lazy(() => import('@/components/tags/TagPanel'))
const QuickNotePanel = lazy(() => import('@/components/notes/QuickNotePanel'))

/**
 * 视图切换。
 *
 * `activeLeftMenu` / `activeView` / `fontSize` 与三个面板开关**不再由 props 传入**，
 * 改为从 `useUIState` 的外部 store 自订阅 —— 这些状态 App 自己也用不上，
 * 透传只会让每次改动都要同步修改 App → MainContent 两处的类型与实参
 * （旧版这里收 30 个 props，其中 20 个是纯转发）。
 *
 * 剩下的 props 都是真正的**动作回调**：它们需要 App 里的闭包上下文
 * （最近浏览记录、toast、确认弹窗），不属于"可自取的状态"。
 */
interface MainContentProps {
  recentViews: RecentViewEntry[]
  activeNotebookId: string
  activeDocId: string
  searchText: string
  trash: import('@/types').TrashDoc[]
  isMobile: boolean
  /** 紧凑窗口：文档列表收起为窄条 */
  isCompact: boolean
  docsSidebarWidth: number | undefined
  dragging: string | null
  onViewDoc: (notebookId: string, docId: string) => void
  onSearchChange: (value: string) => void
  onCreateDoc: (notebookId: string, parentId: string | null) => void
  onCreateNotebook: (title: string) => void
  onRestoreFromTrash: (docId: string) => void
  onDeleteFromTrash: (docId: string) => void
  onClearTrash: () => void
  /** 空态引导：从收藏页跳到文档树 */
  onGoToDocs: () => void
  /** 鼠标或触摸都能发起调宽（A4） */
  onDocsResizeStart: (e: React.MouseEvent | React.TouchEvent) => void
  onDocsResizeReset: () => void
}

export function MainContent({
  recentViews,
  activeNotebookId,
  activeDocId,
  searchText,
  trash,
  isMobile,
  isCompact,
  docsSidebarWidth,
  dragging,
  onViewDoc,
  onSearchChange,
  onCreateDoc,
  onCreateNotebook,
  onRestoreFromTrash,
  onDeleteFromTrash,
  onClearTrash,
  onGoToDocs,
  onDocsResizeStart,
  onDocsResizeReset,
}: MainContentProps): JSX.Element {
  const { activeLeftMenu, activeView } = useUIState()

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
          <TagPanel key="tags-panel" isOpen={true} />
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
        activeNotebookId={activeNotebookId}
        onViewDoc={onViewDoc}
        onGoToDocs={onGoToDocs}
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
      docsSidebarWidth={isMobile ? undefined : docsSidebarWidth}
      onDocsResizeStart={onDocsResizeStart}
      onDocsResizeReset={onDocsResizeReset}
      docsDragging={dragging === 'docs'}
      isMobile={isMobile}
      isCompact={isCompact}
    />
  )
}
