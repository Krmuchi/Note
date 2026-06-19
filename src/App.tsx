import { useCallback, useEffect, useMemo, useState, lazy } from "react";
import { useShallow } from "zustand/react/shallow";
import type { RecentView } from "@/types";
import { useNotesStore } from "@/store";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useUIState } from "@/hooks/useUIState";
import { useFavoriteDocs } from "@/hooks/useFavoriteDocs";
import { useConfirmAction } from "@/hooks/useConfirmAction";
import { debounce } from "@/utils/debounce";
import { copyToClipboard } from "@/utils/clipboard";
import { saveDraft, loadLatestDraft, clearDrafts } from "@/utils/autoSaveUtils";
import { ToastContainer, useToast } from "@/components/common/Toast";
import { Loading } from "@/components/common/Loading";
import { LazyLoader } from "@/components/common/LazyLoader";
import { Sidebar } from "@/components/layout/Sidebar";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableLayout } from "@/hooks/useResizableLayout";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { RecoveryDialog } from "@/components/dialogs/RecoveryDialog";
import TrashView from "@/components/views/TrashView";
import FavoriteView from "@/components/views/FavoriteView";
import NotebooksView from "@/components/views/NotebooksView";
import "@/App.css";

const StartPage = lazy(() => import("@/components/start/StartPage"));
const SharePanel = lazy(() => import("@/components/share/SharePanel"));
const TagPanel = lazy(() => import("@/components/tags/TagPanel"));
const SearchPanel = lazy(() => import("@/components/search/SearchPanel"));
const VersionHistoryPanel = lazy(() => import("@/components/version/VersionHistoryPanel"));
const ShortcutHelp = lazy(() => import("@/components/common/ShortcutHelp"));
const SettingsPanel = lazy(() => import("@/components/settings/SettingsPanel"));
const QuickNotePanel = lazy(() => import("@/components/notes/QuickNotePanel"));

function App() {
  const {
    notebooks,
    activeNotebookId,
    activeDocId,
    searchText,
    trash,
    tags,
  } = useNotesStore(useShallow((s) => ({
    notebooks: s.notebooks,
    activeNotebookId: s.activeNotebookId,
    activeDocId: s.activeDocId,
    searchText: s.searchText,
    trash: s.trash,
    tags: s.tags,
  })));

  const {
    loadNotes,
    saveNotes,
    setActiveNotebookId,
    setActiveDocId,
    setSearchText,
    createNotebook,
    createDoc,
    restoreFromTrash,
    deleteFromTrash,
    clearTrash,
    setSaveStatus,
    generateShareLink,
    deleteShareLink,
  } = useNotesStore(useShallow((s) => ({
    loadNotes: s.loadNotes,
    saveNotes: s.saveNotes,
    setActiveNotebookId: s.setActiveNotebookId,
    setActiveDocId: s.setActiveDocId,
    setSearchText: s.setSearchText,
    createNotebook: s.createNotebook,
    createDoc: s.createDoc,
    restoreFromTrash: s.restoreFromTrash,
    deleteFromTrash: s.deleteFromTrash,
    clearTrash: s.clearTrash,
    setSaveStatus: s.setSaveStatus,
    generateShareLink: s.generateShareLink,
    deleteShareLink: s.deleteShareLink,
  })));

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
  } = useUIState();

  const favoriteDocs = useFavoriteDocs();
  const { confirmConfig, confirm, handleConfirm, handleCancel } = useConfirmAction();
  const { toasts, removeToast, error } = useToast();

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
  } = useResizableLayout();

  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [recoveryDraftMeta, setRecoveryDraftMeta] = useState<{ timestamp: string; docTitle: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useAutoSave(3000);

  useKeyboard({
    onSearch: () => setShowSearchPanel(true),
    onSave: () => saveNotes(),
    onNewDoc: () => {
      if (activeNotebookId) createDoc(activeNotebookId, null);
    },
    onNewNotebook: () => createNotebook("新建知识库"),
    onToggleSidebar: () => {
      setActiveLeftMenu(activeLeftMenu === "notebooks" ? "start" : "notebooks");
    },
    onToggleFavorite: () => {
      if (activeNotebookId && activeDocId) {
        useNotesStore.getState().toggleFavorite(activeNotebookId, activeDocId);
      }
    },
    onClose: () => {
      if (showSearchPanel) setShowSearchPanel(false);
      else if (showSharePanel) setShowSharePanel(false);
      else if (showTagPanel) setShowTagPanel(false);
      else if (showVersionHistory) setShowVersionHistory(false);
    },
    onEscape: () => {
      if (showShortcutHelp) setShowShortcutHelp(false);
      else if (showSearchPanel) setShowSearchPanel(false);
      else if (showSharePanel) setShowSharePanel(false);
      else if (showTagPanel) setShowTagPanel(false);
      else if (showVersionHistory) setShowVersionHistory(false);
    },
    onShortcutHelp: () => setShowShortcutHelp(!showShortcutHelp),
  });

  const debouncedSetSearchText = useMemo(
    () => debounce((value: string) => {
      setSearchText(value);
    }, 300),
    [setSearchText]
  );

  const handleViewDoc = useCallback((notebookId: string, docId: string) => {
    setRecentViews((prev) => {
      const filtered = prev.filter((v) => !(v.docId === docId && v.notebookId === notebookId));
      return [{ docId, notebookId, viewedAt: new Date().toISOString() }, ...filtered].slice(0, 50);
    });
    setActiveNotebookId(notebookId);
    setActiveDocId(docId);
    setActiveView("notebooks");
    setActiveLeftMenu("notebooks");
  }, [setActiveNotebookId, setActiveDocId, setActiveView, setActiveLeftMenu]);

  const activeNotebook = useMemo(
    () => notebooks.find((item) => item.id === activeNotebookId) ?? null,
    [activeNotebookId, notebooks]
  );

  const activeDoc = useMemo(
    () => activeNotebook?.docs.find((item) => item.id === activeDocId) ?? null,
    [activeDocId, activeNotebook]
  );

  useEffect(() => {
    const draft = loadLatestDraft();
    const { autoCleanTrash: cleanTrash } = useNotesStore.getState();

    loadNotes().then(() => {
      setIsLoading(false);
      cleanTrash();
      if (draft) {
        const current = useNotesStore.getState();
        const draftNotebooks = JSON.stringify(draft.data.notebooks);
        const currentNotebooks = JSON.stringify(current.notebooks);
        const draftTrash = JSON.stringify(draft.data.trash);
        const currentTrash = JSON.stringify(current.trash);

        if (draftNotebooks !== currentNotebooks || draftTrash !== currentTrash) {
          setRecoveryDraftMeta({
            timestamp: draft.meta.timestamp,
            docTitle: draft.meta.docTitle,
          });
          setShowRecoveryDialog(true);
        }
      }
    }).catch((err) => {
      console.error("Failed to load notes:", err);
      setIsLoading(false);
      error("加载笔记失败，请检查数据文件");
    });
  }, [error, loadNotes]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveNotes();
      clearDrafts();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [saveNotes]);

  useEffect(() => {
    if (activeDoc) {
      const state = useNotesStore.getState();
      saveDraft(
        { notebooks: state.notebooks, trash: state.trash, tags: state.tags, searchHistory: state.searchHistory },
        activeDoc.title,
      );
    }
  }, [notebooks, trash, tags, activeDoc]);

  const handleRecoverDraft = useCallback(() => {
    const draft = loadLatestDraft();
    if (!draft) return;

    const state = useNotesStore.getState();
    state.updateStore(draft.data);

    if (draft.data.notebooks.length > 0) {
      const nb = draft.data.notebooks[0];
      state.setActiveNotebookId(nb.id);
      if (nb.docs.length > 0) {
        state.setActiveDocId(nb.docs[0].id);
      }
    }

    setSaveStatus("saved");
    setShowRecoveryDialog(false);
    clearDrafts();
  }, [setSaveStatus]);

  const handleDiscardDraft = useCallback(() => {
    clearDrafts();
    setShowRecoveryDialog(false);
  }, []);

  const handleDeleteFromTrash = useCallback((docId: string) => {
    confirm({
      title: "确认操作",
      message: "确定要永久删除该文档吗？此操作无法撤销。",
      confirmText: "确认删除",
      variant: "danger",
      onConfirm: () => deleteFromTrash(docId),
    });
  }, [confirm, deleteFromTrash]);

  const handleClearTrash = useCallback(() => {
    confirm({
      title: "确认操作",
      message: "确定要清空回收站吗？此操作无法撤销。",
      confirmText: "清空回收站",
      variant: "danger",
      onConfirm: () => clearTrash(),
    });
  }, [confirm, clearTrash]);

  const handleGenerateShareLink = useCallback((permission: string, password: string, expiresAt: string | null) => {
    generateShareLink(activeNotebookId, activeDocId, permission as 'view' | 'comment' | 'edit' | 'manage', password, expiresAt);
  }, [activeNotebookId, activeDocId, generateShareLink]);

  const handleDeleteShareLink = useCallback((linkId: string) => {
    deleteShareLink(activeNotebookId, activeDocId, linkId);
  }, [activeNotebookId, activeDocId, deleteShareLink]);

  const handleCopyShareLink = useCallback(async (url: string) => {
    await copyToClipboard(url);
  }, []);

  const renderMainContent = () => {
    if (activeLeftMenu === "start") {
      return (
        <main className="start-panel">
          <LazyLoader>
            <StartPage
              notebooks={notebooks}
              recentViews={recentViews}
              onViewDoc={handleViewDoc}
              onCreateDoc={createDoc}
              onCreateNotebook={createNotebook}
              onOpenTemplates={() => {}}
            />
          </LazyLoader>
        </main>
      );
    }

    if (activeLeftMenu === "note") {
      return (
        <main className="editor-panel">
          <LazyLoader>
            <QuickNotePanel />
          </LazyLoader>
        </main>
      );
    }

    if (activeLeftMenu === "tags") {
      return (
        <main className="editor-panel">
          <LazyLoader>
            <TagPanel key="tags-panel" isOpen={activeLeftMenu === "tags"} onClose={() => setActiveLeftMenu("notebooks")} />
          </LazyLoader>
        </main>
      );
    }

    if (activeView === "trash") {
      return (
        <TrashView
          trash={trash}
          onRestore={restoreFromTrash}
          onDelete={handleDeleteFromTrash}
          onClearTrash={handleClearTrash}
        />
      );
    }

    if (activeView === "favorite") {
      return (
        <FavoriteView
          favoriteDocs={favoriteDocs}
          activeDocId={activeDocId}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          onViewDoc={handleViewDoc}
          activeDoc={activeDoc}
          activeNotebookId={activeNotebookId}
          onShowVersionHistory={() => setShowVersionHistory(true)}
          onShowSharePanel={() => setShowSharePanel(true)}
          showOutlinePanel={showOutlinePanel}
          onToggleOutlinePanel={() => setShowOutlinePanel(!showOutlinePanel)}
          showCommentsPanel={showCommentsPanel}
          onToggleCommentsPanel={() => setShowCommentsPanel(!showCommentsPanel)}
        />
      );
    }

    return (
      <NotebooksView
        searchText={searchText}
        onSearchChange={debouncedSetSearchText}
        onViewDoc={handleViewDoc}
        activeDoc={activeDoc}
        activeNotebookId={activeNotebookId}
        activeDocId={activeDocId}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        onShowVersionHistory={() => setShowVersionHistory(true)}
        onShowSharePanel={() => setShowSharePanel(true)}
        showOutlinePanel={showOutlinePanel}
        onToggleOutlinePanel={() => setShowOutlinePanel(!showOutlinePanel)}
        showCommentsPanel={showCommentsPanel}
        onToggleCommentsPanel={() => setShowCommentsPanel(!showCommentsPanel)}
        docsSidebarWidth={isMobile ? undefined : docsSidebarWidth}
        onDocsResizeStart={startDocsResize}
        onDocsResizeReset={resetDocs}
        docsDragging={dragging === "docs"}
      />
    );
  };

  return (
    <>
      {isLoading ? (
        <div className="app-loading">
          <Loading type="spinner" size="large" text="正在加载笔记..." />
        </div>
      ) : (
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

          {renderMainContent()}

          {showSharePanel && (
            <LazyLoader>
              <SharePanel
                key={`share-${activeDocId}`}
                isOpen={showSharePanel}
                onClose={() => setShowSharePanel(false)}
                docTitle={activeDoc?.title || ''}
                docId={activeDocId}
                notebookId={activeNotebookId}
                shareLinks={activeDoc?.shareLinks || []}
                onGenerateLink={handleGenerateShareLink}
                onDeleteLink={handleDeleteShareLink}
                onCopyLink={handleCopyShareLink}
              />
            </LazyLoader>
          )}

          {showTagPanel && (
            <LazyLoader>
              <TagPanel key="tag-panel-popup" isOpen={showTagPanel} onClose={() => setShowTagPanel(false)} />
            </LazyLoader>
          )}

          {showSearchPanel && (
            <LazyLoader>
              <SearchPanel key="search-panel" isOpen={showSearchPanel} onClose={() => setShowSearchPanel(false)} />
            </LazyLoader>
          )}

          {showVersionHistory && (
            <LazyLoader>
              <VersionHistoryPanel
                onClose={() => setShowVersionHistory(false)}
                notebookId={activeNotebookId}
                docId={activeDocId}
              />
            </LazyLoader>
          )}

          {showShortcutHelp && (
            <LazyLoader>
              <ShortcutHelp
                isOpen={showShortcutHelp}
                onClose={() => setShowShortcutHelp(false)}
              />
            </LazyLoader>
          )}

          {showSettings && (
            <LazyLoader>
              <SettingsPanel
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                fontSize={fontSize}
                onFontSizeChange={setFontSize}
              />
            </LazyLoader>
          )}
        </div>
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />

      {showRecoveryDialog && recoveryDraftMeta && (
        <RecoveryDialog
          timestamp={recoveryDraftMeta.timestamp}
          docTitle={recoveryDraftMeta.docTitle}
          onRecover={handleRecoverDraft}
          onDiscard={handleDiscardDraft}
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
  );
}

export default App;