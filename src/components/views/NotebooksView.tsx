import type { JSX } from 'react'
import { useNotesStore } from '@/store'
import { DocsSidebar } from '@/components/layout/DocsSidebar'
import { Editor } from '@/components/editor/Editor'
import { ResizeHandle } from '@/components/layout/ResizeHandle'

interface NotebooksViewProps {
  searchText: string
  onSearchChange: (value: string) => void
  onViewDoc: (notebookId: string, docId: string) => void
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
  /** 鼠标或触摸都能发起调宽（A4） */
  onDocsResizeStart?: (e: React.MouseEvent | React.TouchEvent) => void
  onDocsResizeReset?: () => void
  docsDragging?: boolean
  isMobile?: boolean
  /** 紧凑窗口：文档列表收起为窄条，避免三栏挤压编辑区 */
  isCompact?: boolean
}

export default function NotebooksView({
  searchText,
  onSearchChange,
  onViewDoc,
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
  isCompact = false,
}: NotebooksViewProps): JSX.Element {
  // 正文由本视图自己订阅：App 外壳因此不必跟着每次击键重渲染
  const activeDoc = useNotesStore((s) => s.activeDoc)
  return (
    <>
      <DocsSidebar
        searchText={searchText}
        onSearchChange={onSearchChange}
        onViewDoc={onViewDoc}
        width={isMobile || isCompact ? undefined : docsSidebarWidth}
        mobile={isMobile}
        compact={isCompact}
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
      {/* 多标签页：有 2 个以上已打开文档时出现（单标签没有切换价值，不占高度） */}
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