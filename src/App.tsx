import { useCallback, useMemo, useState, useEffect } from "react"
import { useShallow } from "zustand/react/shallow"
import type { RecentView, NoteDoc } from "@/types"
import { useNotesStore, selectActiveDoc } from "@/store"
import { useAutoSave } from "@/hooks/useAutoSave"
import { useKeyboard } from "@/hooks/useKeyboard"
import { useUIState } from "@/hooks/useUIState"
import { useFavoriteDocs } from "@/hooks/useFavoriteDocs"
import { useConfirmAction } from "@/hooks/useConfirmAction"
import { useAppInit } from "@/hooks/useAppInit"
import { useDraftSync } from "@/hooks/useDraftSync"
import { useUndoRedo } from "@/hooks/useUndoRedo"
import { debounce } from "@/utils/debounce"
import { copyToClipboard } from "@/utils/clipboard"
import { ToastContainer, useToast } from "@/components/common/Toast"
import { Loading } from "@/components/common/Loading"
import { Sidebar } from "@/components/layout/Sidebar"
import { ResizeHandle } from "@/components/layout/ResizeHandle"
import { useResizableLayout } from "@/hooks/useResizableLayout"
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog"
import { RecoveryDialog } from "@/components/dialogs/RecoveryDialog"
import { MainContent } from "@/components/app/MainContent"
import { AppPanels } from "@/components/app/AppPanels"
import "@/App.css"

const MAX_RECENT_VIEWS = 50

function App() {
  const {
    activeNotebookId,
    activeDocId,
    searchText,
    trash,
    tags,
  } = useNotesStore(useShallow((s) => ({
    activeNotebookId: s.activeNotebookId,
    activeDocId: s.activeDocId,
    searchText: s.searchText,
    trash: s.trash,
    tags: s.tags,
  })))
  const activeDoc = useNotesStore(selectActiveDoc) as NoteDoc | null

  const {
    saveNotes,
    setActiveNotebookId,
    setActiveDocId,
    setSearchText,
    createNotebook,
    createDoc,
    restoreFromTrash,
    deleteFromTrash,
    clearTrash,
    generateShareLink,
    deleteShareLink,
  } = useNotesStore(useShallow((s) => ({
    saveNotes: s.saveNotes,
    setActiveNotebookId: s.setActiveNotebookId,
    setActiveDocId: s.setActiveDocId,
    setSearchText: s.setSearchText,
    createNotebook: s.createNotebook,
    createDoc: s.createDoc,
    restoreFromTrash: s.restoreFromTrash,
    deleteFromTrash: s.deleteFromTrash,
    clearTrash: s.clearTrash,
    generateShareLink: s.generateShareLink,
    deleteShareLink: s.deleteShareLink,
  })))

  const {
    activeView,
    setActiveView,
    activeLeftMenu,
    setActiveLeftMenu,
    fontSize,
    setFontSize,
    showSearchPanel,
    setShowSearchPanel,
    showSharePanel,
    setShowSharePanel,
    showTagPanel,
    setShowTagPanel,
    showCommentsPanel,
    setShowCommentsPanel,
    showOutlinePanel,
    setShowOutlinePanel,
    showVersionHistory,
    setShowVersionHistory,
    showShortcutHelp,
    setShowShortcutHelp,
    showSettings,
    setShowSettings,
  } = useUIState()

  const favoriteDocs = useFavoriteDocs()
  const { confirmConfig, confirm, handleConfirm, handleCancel } = useConfirmAction()
  const { toasts, removeToast, error } = useToast()

  const {
    sidebarWidth,
    docsSidebarWidth,
    sidebarCollapsed,
    dragging,
    isMobile,
    startSidebarResize,
    startDocsResize,
    resetSidebar,
    resetDocs,
    toggleSidebarCollapse,
    setSidebarCollapsed,
  } = useResizableLayout()

  // 从 localStorage 加载最近浏览记录
  const [recentViews, setRecentViews] = useState<RecentView[]>(() => {
    try {
      const saved = localStorage.getItem('notes-recent-views')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // 持久化最近浏览记录
  useEffect(() => {
    try {
      localStorage.setItem('notes-recent-views', JSON.stringify(recentViews))
    } catch {
      // storage unavailable
    }
  }, [recentViews])

  const {
    isLoading,
    showRecoveryDialog,
    recoveryDraftMeta,
    handleRecoverDraft,
    handleDiscardDraft,
    handleDismissDraft,
  } = useAppInit({ onError: error })

  useAutoSave(3000)
  useDraftSync()

  const { undo, redo } = useUndoRedo()

  const debouncedSetSearchText = useMemo(
    () => debounce((value: string) => {
      setSearchText(value)
    }, 300),
    [setSearchText]
  )

  const handleViewDoc = useCallback((notebookId: string, docId: string) => {
    setRecentViews((prev) => {
      const filtered = prev.filter((v) => !(v.docId === docId && v.notebookId === notebookId))
      return [{ docId, notebookId, viewedAt: new Date().toISOString() }, ...filtered].slice(0, MAX_RECENT_VIEWS)
    })
    setActiveNotebookId(notebookId)
    setActiveDocId(docId)
    setActiveView("notebooks")
    setActiveLeftMenu("notebooks")
  }, [setActiveNotebookId, setActiveDocId, setActiveView, setActiveLeftMenu])

  // 新建文档并立即进入编辑器：任何入口（快捷键/侧栏/开始页）都应有可见反馈，
  // 否则用户停留在"开始"页时点击"新建文档"界面毫无变化
  const handleCreateDoc = useCallback((notebookId: string, parentId: string | null = null, docData?: Partial<NoteDoc>) => {
    const docId = createDoc(notebookId, parentId, docData)
    if (docId) handleViewDoc(notebookId, docId)
    return docId
  }, [createDoc, handleViewDoc])

  useKeyboard({
    onSearch: () => setShowSearchPanel(true),
    onSave: () => saveNotes(),
    onUndo: () => undo(),
    onRedo: () => redo(),
    onNewDoc: () => {
      if (activeNotebookId) handleCreateDoc(activeNotebookId, null)
    },
    onNewNotebook: () => createNotebook("新建知识库"),
    onToggleSidebar: toggleSidebarCollapse,
    onToggleFavorite: () => {
      if (activeNotebookId && activeDocId) {
        useNotesStore.getState().toggleFavorite(activeNotebookId, activeDocId)
      }
    },
    // Escape 每次只关闭一个面板（按优先级），避免一次按键把多个面板同时关掉
    onEscape: () => {
      if (showShortcutHelp) setShowShortcutHelp(false)
      else if (showSearchPanel) setShowSearchPanel(false)
      else if (showSharePanel) setShowSharePanel(false)
      else if (showTagPanel) setShowTagPanel(false)
      else if (showVersionHistory) setShowVersionHistory(false)
      else if (showSettings) setShowSettings(false)
    },
    onShortcutHelp: () => setShowShortcutHelp(!showShortcutHelp),
  })

  const handleDeleteFromTrash = useCallback((docId: string) => {
    confirm({
      title: "确认操作",
      message: "确定要永久删除该文档吗？此操作无法撤销。",
      confirmText: "确认删除",
      variant: "danger",
      onConfirm: () => deleteFromTrash(docId),
    })
  }, [confirm, deleteFromTrash])

  const handleClearTrash = useCallback(() => {
    confirm({
      title: "确认操作",
      message: "确定要清空回收站吗？此操作无法撤销。",
      confirmText: "清空回收站",
      variant: "danger",
      onConfirm: () => clearTrash(),
    })
  }, [confirm, clearTrash])

  const handleGenerateShareLink = useCallback((permission: string, password: string, expiresAt: string | null) => {
    generateShareLink(activeNotebookId, activeDocId, permission as 'view' | 'comment' | 'edit' | 'manage', password, expiresAt)
  }, [activeNotebookId, activeDocId, generateShareLink])

  const handleDeleteShareLink = useCallback((linkId: string) => {
    deleteShareLink(activeNotebookId, activeDocId, linkId)
  }, [activeNotebookId, activeDocId, deleteShareLink])

  const handleCopyShareLink = useCallback(async (url: string) => {
    await copyToClipboard(url)
  }, [])

  if (isLoading) {
    return (
      <div className="app-loading">
        <Loading type="spinner" size="large" text="正在加载笔记..." />
      </div>
    )
  }

  return (
    <>
      <div className="app-shell">
        <Sidebar
          searchText={searchText}
          onSearchChange={debouncedSetSearchText}
          onSearchPanelOpen={() => setShowSearchPanel(true)}
          activeLeftMenu={activeLeftMenu}
          onLeftMenuChange={setActiveLeftMenu}
          activeView={activeView}
          onViewChange={setActiveView}
          tags={tags}
          trash={trash}
          onOpenSettings={() => setShowSettings(true)}
          onOpenShortcutHelp={() => setShowShortcutHelp(true)}
          onOpenDoc={handleViewDoc}
          width={isMobile ? undefined : sidebarWidth}
          collapsed={isMobile ? false : sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />

        {!isMobile && (
          <ResizeHandle
            variant="sidebar"
            onResizeStart={startSidebarResize}
            onDoubleClick={resetSidebar}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebarCollapse}
            dragging={dragging === "sidebar"}
            ariaLabel="调整侧栏宽度"
          />
        )}

        <MainContent
          activeLeftMenu={activeLeftMenu}
          activeView={activeView}
          recentViews={recentViews}
          activeDoc={activeDoc}
          activeNotebookId={activeNotebookId}
          activeDocId={activeDocId}
          searchText={searchText}
          trash={trash}
          fontSize={fontSize}
          favoriteDocs={favoriteDocs}
          isMobile={isMobile}
          docsSidebarWidth={docsSidebarWidth}
          dragging={dragging}
          showOutlinePanel={showOutlinePanel}
          showCommentsPanel={showCommentsPanel}
          onViewDoc={handleViewDoc}
          onSearchChange={debouncedSetSearchText}
          onCreateDoc={handleCreateDoc}
          onCreateNotebook={createNotebook}
          onRestoreFromTrash={restoreFromTrash}
          onDeleteFromTrash={handleDeleteFromTrash}
          onClearTrash={handleClearTrash}
          onFontSizeChange={setFontSize}
          onSetActiveLeftMenu={setActiveLeftMenu}
          onShowVersionHistory={() => setShowVersionHistory(true)}
          onShowSharePanel={() => setShowSharePanel(true)}
          onToggleOutlinePanel={() => setShowOutlinePanel(!showOutlinePanel)}
          onToggleCommentsPanel={() => setShowCommentsPanel(!showCommentsPanel)}
          onDocsResizeStart={startDocsResize}
          onDocsResizeReset={resetDocs}
        />

        <AppPanels
          showSharePanel={showSharePanel}
          showTagPanel={showTagPanel}
          showSearchPanel={showSearchPanel}
          showVersionHistory={showVersionHistory}
          showShortcutHelp={showShortcutHelp}
          showSettings={showSettings}
          activeDocId={activeDocId}
          activeNotebookId={activeNotebookId}
          activeDocTitle={activeDoc?.title || ''}
          shareLinks={activeDoc?.shareLinks || []}
          fontSize={fontSize}
          onCloseSharePanel={() => setShowSharePanel(false)}
          onCloseTagPanel={() => setShowTagPanel(false)}
          onCloseSearchPanel={() => setShowSearchPanel(false)}
          onCloseVersionHistory={() => setShowVersionHistory(false)}
          onCloseShortcutHelp={() => setShowShortcutHelp(false)}
          onCloseSettings={() => setShowSettings(false)}
          onGenerateShareLink={handleGenerateShareLink}
          onDeleteShareLink={handleDeleteShareLink}
          onCopyShareLink={handleCopyShareLink}
          onFontSizeChange={setFontSize}
        />
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />

      {showRecoveryDialog && recoveryDraftMeta && (
        <RecoveryDialog
          timestamp={recoveryDraftMeta.timestamp}
          docTitle={recoveryDraftMeta.docTitle}
          onRecover={handleRecoverDraft}
          onDiscard={handleDiscardDraft}
          onClose={handleDismissDraft}
        />
      )}

      {confirmConfig && (
        <ConfirmDialog
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmText={confirmConfig.confirmText}
          variant={confirmConfig.variant}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  )
}

export default App