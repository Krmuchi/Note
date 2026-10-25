import type { JSX } from 'react'
import { useNotesStore, selectActiveDoc } from '@/store'
import { uiActions, useUIState } from '@/hooks/useUIState'
import { DocsSidebar } from '@/components/layout/DocsSidebar'
import { Editor } from '@/components/editor/Editor'
import { ResizeHandle } from '@/components/layout/ResizeHandle'

/**
 * 文档视图（文档树 + 编辑器）。
 *
 * 字号 / 面板开关 / 版本历史 / 分享面板改为自订阅 `useUIState`：
 * 它们是全局 UI 状态，让 App 逐层透传只会增加改一处动三处的成本。
 */
interface NotebooksViewProps {
  searchText: string
  onSearchChange: (value: string) => void
  onViewDoc: (notebookId: string, docId: string) => void
  activeNotebookId: string
  activeDocId: string
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
  docsSidebarWidth,
  onDocsResizeStart,
  onDocsResizeReset,
  docsDragging,
  isMobile = false,
  isCompact = false,
}: NotebooksViewProps): JSX.Element {
  const { fontSize, showOutlinePanel, showCommentsPanel } = useUIState()
  const { setFontSize, toggleShowOutlinePanel, toggleShowCommentsPanel, setShowVersionHistory, setShowSharePanel } = uiActions
  // 正文由本视图自己订阅：App 外壳因此不必跟着每次击键重渲染
  const activeDoc = useNotesStore(selectActiveDoc)
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
        onFontSizeChange={setFontSize}
        onShowVersionHistory={() => setShowVersionHistory(true)}
        onShowSharePanel={() => setShowSharePanel(true)}
        showOutlinePanel={showOutlinePanel}
        onToggleOutlinePanel={toggleShowOutlinePanel}
        showCommentsPanel={showCommentsPanel}
        onToggleCommentsPanel={toggleShowCommentsPanel}
        onViewDoc={onViewDoc}
      />
    </>
  )
}