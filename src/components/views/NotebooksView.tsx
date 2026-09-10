import { DocsSidebar } from '@/components/layout/DocsSidebar'
import { Editor } from '@/components/editor/Editor'
import { ResizeHandle } from '@/components/layout/ResizeHandle'

interface NotebooksViewProps {
  searchText: string
  onSearchChange: (value: string) => void
  onViewDoc: (notebookId: string, docId: string) => void
  activeDoc: import('@/types').NoteDoc | null
  activeNotebookId: string
  activeDocId: string
  fontSize: string
  onFontSizeChange: (size: string) => void
  onShowVersionHistory?: () => void
  onShowSharePanel?: () => void
  showOutlinePanel?: boolean
  onToggleOutlinePanel?: () => void
  showCommentsPanel?: boolean
  onToggleCommentsPanel?: () => void
  docsSidebarWidth?: number
  onDocsResizeStart?: (e: React.MouseEvent) => void
  onDocsResizeReset?: () => void
  docsDragging?: boolean
  isMobile?: boolean
}

export default function NotebooksView({
  searchText,
  onSearchChange,
  onViewDoc,
  activeDoc,
  activeNotebookId,
  activeDocId,
  fontSize,
  onFontSizeChange,
  onShowVersionHistory,
  onShowSharePanel,
  showOutlinePanel,
  onToggleOutlinePanel,
  showCommentsPanel,
  onToggleCommentsPanel,
  docsSidebarWidth,
  onDocsResizeStart,
  onDocsResizeReset,
  docsDragging,
  isMobile = false,
}: NotebooksViewProps): import('react').ReactElement {
  return (
    <>
      <DocsSidebar
        searchText={searchText}
        onSearchChange={onSearchChange}
        onViewDoc={onViewDoc}
        width={docsSidebarWidth}
        mobile={isMobile}
      />
      {!isMobile && onDocsResizeStart && (
        <ResizeHandle
          variant="docs"
          onResizeStart={onDocsResizeStart}
          onDoubleClick={onDocsResizeReset}
          dragging={docsDragging}
          ariaLabel="调整文档列表与编辑器宽度"
        />
      )}
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