import { useCallback, useEffect, useMemo, useState, lazy } from "react";
import type { NoteDoc, Notebook } from "./types";
import { useNotesStore } from "./store/notesStore";
import { useAutoSave } from "./hooks/useAutoSave";
import { useKeyboard } from "./hooks/useKeyboard";
import { debounce } from "./utils/debounce";
import { saveDraft, loadLatestDraft, clearDrafts } from "./utils/autoSaveUtils";
import { ToastContainer, useToast } from "./components/Toast";
import { Loading } from "./components/Loading";
import { LazyLoader } from "./components/LazyLoader";
import { Sidebar } from "./components/layout/Sidebar";
import { DocsSidebar } from "./components/layout/DocsSidebar";
import { Editor } from "./components/editor/Editor";
import { ConfirmDialog } from "./components/dialogs/ConfirmDialog";
import { RecoveryDialog } from "./components/dialogs/RecoveryDialog";
import "./App.css";

const StartPage = lazy(() => import("./components/StartPage"));
const SharePanel = lazy(() => import("./components/SharePanel"));
const TagPanel = lazy(() => import("./components/TagPanel"));
const SearchPanel = lazy(() => import("./components/SearchPanel"));
const VersionHistoryPanel = lazy(() => import("./components/VersionHistoryPanel"));

interface RecentView {
  docId: string;
  notebookId: string;
  viewedAt: string;
}

function App() {
  const {
    notebooks,
    activeNotebookId,
    activeDocId,
    searchText,
    trash,
    tags,
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
  } = useNotesStore();

  const { toasts, removeToast, error } = useToast();

  const [fontSize, setFontSize] = useState<string>("15px");
  const [activeView, setActiveView] = useState<string>("notebooks");
  const [activeLeftMenu, setActiveLeftMenu] = useState<string>("notebooks");
  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [recoveryDraftMeta, setRecoveryDraftMeta] = useState<{ timestamp: string; docTitle: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");
  

  useAutoSave(3000);

  useKeyboard({
    onSearch: () => setShowSearchPanel(true),
  });

  const debouncedSetSearchText = useCallback(debounce((value: string) => {
    setSearchText(value);
  }, 300), [setSearchText]);

  const handleViewDoc = (notebookId: string, docId: string) => {
    setRecentViews((prev) => {
      const filtered = prev.filter((v) => !(v.docId === docId && v.notebookId === notebookId));
      return [{ docId, notebookId, viewedAt: new Date().toISOString() }, ...filtered].slice(0, 50);
    });
    setActiveNotebookId(notebookId);
    setActiveDocId(docId);
    setActiveView("notebooks");
    setActiveLeftMenu("notebooks");
  };

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

    loadNotes().then(() => {
      setIsLoading(false);
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
  }, [error]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveNotes();
      clearDrafts();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

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

  const handleConfirm = () => {
    confirmAction?.();
    setConfirmAction(null);
    setConfirmMessage("");
  };

  const handleCancelConfirm = () => {
    setConfirmAction(null);
    setConfirmMessage("");
  };

  const handleRestoreFromTrash = (docId: string) => {
    restoreFromTrash(docId);
  };

  const handleDeleteFromTrash = (docId: string) => {
    setConfirmMessage(`确定要永久删除该文档吗？此操作无法撤销。`);
    setConfirmAction(() => () => {
      deleteFromTrash(docId);
    });
  };

  const handleClearTrash = () => {
    setConfirmMessage(`确定要清空回收站吗？此操作无法撤销。`);
    setConfirmAction(() => () => {
      clearTrash();
    });
  };

  const favoriteDocs = useMemo(() => {
    const favorites: { notebook: Notebook; doc: NoteDoc }[] = [];
    notebooks.forEach((notebook) => {
      notebook.docs.forEach((doc) => {
        if (doc.favorite) {
          favorites.push({ notebook, doc });
        }
      });
    });
    return favorites.sort((a, b) => new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime());
  }, [notebooks]);

  const renderTrashView = () => (
    <main className="editor-panel">
      <div className="trash-panel">
        <div className="trash-header">
          <h2>🗑️ 回收站</h2>
          {trash.length > 0 && (
            <button className="btn-clear-trash" onClick={handleClearTrash}>
              清空回收站
            </button>
          )}
        </div>
        {trash.length === 0 ? (
          <div className="empty-trash">
            <span className="empty-icon">🗑️</span>
            <span className="empty-text">回收站为空</span>
          </div>
        ) : (
          <div className="trash-list">
            {trash.map((item) => (
              <div key={item.id} className="trash-item">
                <span className="trash-item-title">{item.title}</span>
                <span className="trash-item-notebook">{item.notebookTitle}</span>
                <span className="trash-item-time">{new Date(item.updatedAt).toLocaleString()}</span>
                <button className="btn-restore" onClick={() => handleRestoreFromTrash(item.id)}>
                  恢复
                </button>
                <button className="btn-delete" onClick={() => handleDeleteFromTrash(item.id)}>
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );

  const renderFavoriteView = () => (
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
                  onClick={() => handleViewDoc(notebook.id, doc.id)}
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
        onFontSizeChange={setFontSize}
      />
    </>
  );

  const renderNotebooksView = () => (
    <>
      <DocsSidebar
        searchText={searchText}
        onSearchChange={debouncedSetSearchText}
        activeView={activeView}
        onViewChange={setActiveView}
        recentViews={recentViews}
        onViewDoc={handleViewDoc}
      />
      <Editor
        activeDoc={activeDoc}
        activeNotebookId={activeNotebookId}
        activeDocId={activeDocId}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
      />
    </>
  );

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
          />

          {activeLeftMenu === "start" ? (
            <main className="start-panel">
              <LazyLoader>
                <StartPage
                  notebooks={notebooks}
                  recentViews={recentViews}
                  onViewDoc={handleViewDoc}
                  onCreateDoc={createDoc}
                  onCreateNotebook={createNotebook}
                />
              </LazyLoader>
            </main>
          ) : activeLeftMenu === "note" ? (
            <main className="editor-panel">
              <div className="empty-editor">
                <div className="empty-icon">📝</div>
                <div className="empty-text">小记功能开发中</div>
              </div>
            </main>
          ) : activeLeftMenu === "tags" ? (
            <>
              <main className="editor-panel">
                <LazyLoader>
                  <TagPanel isOpen={activeLeftMenu === "tags"} onClose={() => setActiveLeftMenu("notebooks")} />
                </LazyLoader>
              </main>
            </>
          ) : activeView === "trash" ? (
            renderTrashView()
          ) : activeView === "favorite" ? (
            renderFavoriteView()
          ) : (
            renderNotebooksView()
          )}

          {showSharePanel && (
            <LazyLoader>
              <SharePanel
                isOpen={showSharePanel}
                onClose={() => setShowSharePanel(false)}
                docTitle={activeDoc?.title || ''}
                docId={activeDocId}
                notebookId={activeNotebookId}
                shareLinks={activeDoc?.shareLinks || []}
                onGenerateLink={() => {}}
                onDeleteLink={() => {}}
                onCopyLink={() => {}}
              />
            </LazyLoader>
          )}

          {showTagPanel && (
            <LazyLoader>
              <TagPanel isOpen={showTagPanel} onClose={() => setShowTagPanel(false)} />
            </LazyLoader>
          )}

          {showSearchPanel && (
            <LazyLoader>
              <SearchPanel isOpen={showSearchPanel} onClose={() => setShowSearchPanel(false)} />
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

      {confirmAction && (
        <ConfirmDialog
          title="确认操作"
          message={confirmMessage}
          onConfirm={handleConfirm}
          onCancel={handleCancelConfirm}
        />
      )}
    </>
  );
}

export default App;