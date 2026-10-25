import { useCallback, useMemo, useState, useEffect } from "react"
import type { JSX } from "react"
import { useShallow } from "zustand/react/shallow"
import type { RecentView, NoteDoc } from "@/types"
import { useNotesStore } from "@/store"
import { useAutoSave } from "@/hooks/useAutoSave"
import { useKeyboard } from "@/hooks/useKeyboard"
import { useUIState, uiActions, getUIState } from "@/hooks/useUIState"
import { useConfirmAction } from "@/hooks/useConfirmAction"
import { useAppInit } from "@/hooks/useAppInit"
import { useDraftSync } from "@/hooks/useDraftSync"
import { useUndoRedo } from "@/hooks/useUndoRedo"
import { debounce } from "@/utils/debounce"
import { copyToClipboard } from "@/utils/clipboard"
import { ToastContainer } from "@/components/common/ToastView"
import { useToast } from "@/components/common/Toast"
import { toast } from "@/services/toast"
import { Loading } from "@/components/common/Loading"
import { Sidebar } from "@/components/layout/Sidebar"
import { ResizeHandle } from "@/components/layout/ResizeHandle"
import { useResizableLayout } from "@/hooks/useResizableLayout"
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog"
import { LoadFailureDialog } from "@/components/dialogs/LoadFailureDialog"
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog"
import QuickOpenPanel from "@/components/search/QuickOpenPanel"
import HelpDialog from "@/components/help/HelpDialog"
import { findAdjacentDoc, flattenDocs, subscribeDocOpen } from "@/utils/docNavigation"
import { RECENT_VIEWS_KEY, shouldShowOnboarding, subscribeOnboardingRequest } from "@/utils/onboarding"
import { useFileDropImport } from "@/hooks/useFileDropImport"
import { onAppAction, updateRecents } from "@/services/storage"
import { markPerf } from "@/utils/perfMarks"
import { RecoveryDialog } from "@/components/dialogs/RecoveryDialog"
import { MainContent } from "@/components/app/MainContent"
import { AppPanels } from "@/components/app/AppPanels"
import "@/App.css"

const MAX_RECENT_VIEWS = 50

function App(): JSX.Element {
  const {
    activeNotebookId,
    activeDocId,
    searchText,
    trash,
    tags,
    loadError,
  } = useNotesStore(useShallow((s) => ({
    activeNotebookId: s.activeNotebookId,
    activeDocId: s.activeDocId,
    searchText: s.searchText,
    trash: s.trash,
    tags: s.tags,
    loadError: s.loadError,
  })))
  /*
   * 刻意不订阅 activeDoc。
   *
   * activeDoc 是编辑器里的受控对象，每次击键都会换新引用；App 一旦订阅它，
   * 输入链路上每次按键都会把整个外壳（侧栏 / 文档树 / 面板 / 弹窗）重渲染一遍。
   * 现在由真正需要正文的 MainContent / Editor 自己订阅，外壳只保留上面这些
   * 低频状态（切库、切文档、搜索词、回收站、标签、加载错误）。
   */

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

  /*
   * UI 状态改由 `@/hooks/useUIState` 的模块级外部 store 持有。
   *
   * 旧实现把这 11 个状态放在 App 里，再逐个下传给 MainContent（30 个 props）
   * 与 AppPanels（19 个 props），绝大多数是纯转发 —— 加一个面板开关要改 3 个文件。
   * 现在 App 只保留它自己真的要用的字段，其余组件按需自行订阅。
   */
  const { activeView, activeLeftMenu } = useUIState()
  const { setActiveView, setActiveLeftMenu, setShowSettings } = uiActions

  const { confirmConfig, confirm, handleConfirm, handleCancel } = useConfirmAction()
  const { toasts, removeToast, error } = useToast()

  const {
    sidebarWidth,
    docsSidebarWidth,
    sidebarCollapsed,
    dragging,
    isMobile,
    isCompact,
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
      const saved = localStorage.getItem(RECENT_VIEWS_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // 启动度量（F1）：应用外壳挂载完成
  useEffect(() => {
    markPerf('appMounted')
  }, [])

  /*
   * 多标签页：恢复上次打开的标签列表。
   * 只在挂载时读一次；标签本身是"本机视图状态"，存在 localStorage 而不是
   * notes-data.json（它不属于用户数据，不该随备份/导出跑到别的机器上）。
   */
  useEffect(() => {
    useNotesStore.getState().loadOpenTabs()
  }, [])

  /*
   * 清理失效标签：文档被删除/移走后，标签里可能留着已不存在的引用。
   * 依赖 activeDocId 而不是 notebooks：删除文档一定会伴随 activeDocId 变化，
   * 而订阅 notebooks 会让外壳重新回到"每次击键都重渲染"的老问题。
   */
  useEffect(() => {
    useNotesStore.getState().pruneOpenTabs()
  }, [activeDocId])

  // P10：把最近文档同步给主进程，用于任务栏跳转列表（最近 5 篇）
  useEffect(() => {
    const titles = new Map<string, string>()
    for (const notebook of useNotesStore.getState().notebooks) {
      for (const doc of notebook.docs) titles.set(doc.id, doc.title)
    }
    const payload = recentViews
      .slice(0, 5)
      .map((view) => ({ id: view.docId, title: titles.get(view.docId) ?? '' }))
      .filter((item) => item.id)
    void updateRecents(payload)
  }, [recentViews])

  // 持久化最近浏览记录
  useEffect(() => {
    try {
      localStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify(recentViews))
    } catch {
      // storage unavailable
    }
  }, [recentViews])

  // 拖 .md 文件到窗口＝导入成新文档（P6）；编辑器内的拖放由 useEditorPasteDrop 负责，两者互不抢
  const handleImportDroppedFiles = useCallback((docs: { title: string; content: string }[]) => {
    const state = useNotesStore.getState()
    const active = state.notebooks.find((nb) => nb.id === state.activeNotebookId)
    const notebookId = active ? active.id : state.notebooks[0]?.id ?? state.createNotebook('我的知识库')
    if (!notebookId) return
    docs.forEach((doc) => {
      state.createDoc(notebookId, null, { title: doc.title, content: doc.content })
    })
    toast.success('已导入 ' + docs.length + ' 个文档')
  }, [])

  const { isDraggingFiles } = useFileDropImport({ onImport: handleImportDroppedFiles })

  // 上次异常退出的提示：只告诉用户"可以去哪找回"，不制造恐慌
  const handleAbnormalExit = useCallback(() => {
    toast.warning('上次未正常退出。数据已重新加载，如有内容缺失可在「更多 → 从备份恢复」里找回。')
  }, [])

  const {
    isLoading,
    showRecoveryDialog,
    recoveryDraftMeta,
    handleRecoverDraft,
    handleDiscardDraft,
    handleDismissDraft,
  } = useAppInit({ onError: error, onAbnormalExit: handleAbnormalExit })

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
    onSearch: () => uiActions.setShowSearchPanel(true),
    onSave: () => saveNotes(),
    onUndo: () => {
      if (undo()) toast.info('已撤销', 1500)
      else toast.warning('没有可撤销的操作', 1500)
    },
    onRedo: () => {
      if (redo()) toast.info('已重做', 1500)
      else toast.warning('没有可重做的操作', 1500)
    },
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
      // 从 store 读取实时状态，而不是闭包里的变量 —— 这些开关不再由 App 持有
      const ui = getUIState()
      if (showQuickOpen) setShowQuickOpen(false)
      else if (showHelp) setShowHelp(false)
      else if (ui.showShortcutHelp) uiActions.setShowShortcutHelp(false)
      else if (ui.showSearchPanel) uiActions.setShowSearchPanel(false)
      else if (ui.showSharePanel) uiActions.setShowSharePanel(false)
      else if (ui.showTagPanel) uiActions.setShowTagPanel(false)
      else if (ui.showVersionHistory) uiActions.setShowVersionHistory(false)
      else if (ui.showSettings) uiActions.setShowSettings(false)
    },
    onShortcutHelp: () => uiActions.setShowShortcutHelp(!getUIState().showShortcutHelp),
    onQuickOpen: () => setShowQuickOpen(true),
    onPrevDoc: () => navigateAdjacent('prev'),
    onNextDoc: () => navigateAdjacent('next'),
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
    const result = generateShareLink(activeNotebookId, activeDocId, permission as 'view' | 'comment' | 'edit' | 'manage', password, expiresAt)
    if (!result.ok) error(result.error)
  }, [activeNotebookId, activeDocId, generateShareLink, error])

  const handleDeleteShareLink = useCallback((linkId: string) => {
    const result = deleteShareLink(activeNotebookId, activeDocId, linkId)
    if (!result.ok) error(result.error)
  }, [activeNotebookId, activeDocId, deleteShareLink, error])

  const handleCopyShareLink = useCallback(async (url: string) => {
    await copyToClipboard(url)
  }, [])

  // 首次启动引导：只在"全新安装"时自动弹一次（判定见 utils/onboarding）。
  // 用派生值而不是「effect 里 setState」：既避免级联渲染（eslint react-hooks/set-state-in-effect），
  // 也让判定天然跟随 isLoading 翻转，只在加载完成那一刻计算一次。
  const [showQuickOpen, setShowQuickOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  // 托盘菜单 / 全局速记快捷键触发的动作（P3 / P4）。
  // 必须在 setShowQuickOpen 声明之后：编译器规则不允许在声明前引用（TDZ 检查）
  useEffect(() => onAppAction(({ type, docId, title, content, reason }) => {
    if (type === 'quickNote') setActiveLeftMenu('note')
    else if (type === 'quickOpen') setShowQuickOpen(true)
    else if (type === 'openFile') {
      // P5：双击 .md 打开 → 作为新文档落进当前知识库（不覆盖任何已有内容）
      const state = useNotesStore.getState()
      const targetNotebookId = state.activeNotebookId || state.notebooks[0]?.id
      if (!targetNotebookId) {
        toast.warning('没有可用的知识库，请先创建一个知识库')
        return
      }
      const created = state.createDoc(targetNotebookId, null, {
        title: title || '导入的文档',
        content: content || '',
      })
      toast.success('已打开「' + (title || '导入的文档') + '」')
      if (created && typeof created === 'object' && 'id' in created) {
        handleViewDoc(targetNotebookId, (created as { id: string }).id)
      }
    } else if (type === 'openFileFailed') {
      toast.error(reason || '打开文件失败')
    }
    else if (type === 'openDoc' && docId) {
      // P10：从任务栏「最近文档」进来。按 id 找文档而不是提前记下标题 ——
      // 标题可能在两次启动之间被改过，id 才是稳定的
      const state = useNotesStore.getState()
      for (const notebook of state.notebooks) {
        if (notebook.docs.some((doc) => doc.id === docId)) {
          handleViewDoc(notebook.id, docId)
          return
        }
      }
      toast.warning('这篇文档已被删除或移动')
    }
  }), [setActiveLeftMenu, handleViewDoc])
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)
  const [onboardingForced, setOnboardingForced] = useState(false)

  // 设置里的「重看新手引导」通过全局事件唤起，避免为此层层透传 props
  useEffect(() => subscribeOnboardingRequest(() => setOnboardingForced(true)), [])

  // 面包屑 / 上一篇下一篇 / 快速打开都通过同一个通道请求打开文档，
  // 统一走 handleViewDoc：记录最近浏览 + 切回文档视图（否则停在开始页时点了没反应）
  useEffect(() => {
    const unsubscribe = subscribeDocOpen(({ notebookId, docId }) => handleViewDoc(notebookId, docId))
    return unsubscribe
  }, [handleViewDoc])

  // 刻意不包 useCallback：内部读的是 store 快照（getState），
  // 手工 memo 会让 react-hooks 的编译器规则无法保留记忆化（preserve-manual-memoization），
  // 而且这个函数每次渲染重建也没有额外代价（useKeyboard 用 ref 持有最新 handler）
  const navigateAdjacent = (direction: 'prev' | 'next'): void => {
    const state = useNotesStore.getState()
    const target = findAdjacentDoc(
      flattenDocs(state.notebooks),
      state.activeNotebookId,
      state.activeDocId,
      direction,
    )
    if (target) handleViewDoc(target.notebookId, target.docId)
  }

  const isFreshInstall = useMemo(
    // 直接读快照而不是订阅 notebooks：App 订阅 notebooks 会让每次击键都重渲染整个外壳
    () => !isLoading && shouldShowOnboarding({ notebooks: useNotesStore.getState().notebooks }),
    [isLoading],
  )

  const showOnboarding = (onboardingForced || isFreshInstall) && !onboardingDismissed && !loadError

  // 依赖里显式列出 setState 函数：React Compiler 会推断它们被使用，
  // 空的依赖数组会被判为"手工记忆化无法保留"（setState 本身是稳定引用，无额外代价）
  const handleCloseOnboarding = useCallback(() => {
    setOnboardingForced(false)
    setOnboardingDismissed(true)
  }, [setOnboardingForced, setOnboardingDismissed])

  const handleCreateFirstDoc = useCallback((title: string) => {
    const state = useNotesStore.getState()
    const active = state.notebooks.find((nb) => nb.id === state.activeNotebookId)
    const notebookId = active ? active.id : state.notebooks[0]?.id ?? state.createNotebook('我的知识库')
    if (notebookId) {
      handleCreateDoc(notebookId, null, { title, content: '# ' + title + '\n\n' })
    }
    handleCloseOnboarding()
  }, [handleCreateDoc, handleCloseOnboarding])

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
          onSearchPanelOpen={() => uiActions.setShowSearchPanel(true)}
          activeLeftMenu={activeLeftMenu}
          onLeftMenuChange={setActiveLeftMenu}
          activeView={activeView}
          onViewChange={setActiveView}
          tags={tags}
          trash={trash}
          onOpenSettings={() => setShowSettings(true)}
          onOpenHelp={() => setShowHelp(true)}
          onOpenDoc={handleViewDoc}
          width={isMobile ? undefined : sidebarWidth}
          collapsed={isMobile ? false : sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          mobile={isMobile}
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
          recentViews={recentViews}
          activeNotebookId={activeNotebookId}
          activeDocId={activeDocId}
          searchText={searchText}
          trash={trash}
          isMobile={isMobile}
          isCompact={isCompact}
          docsSidebarWidth={docsSidebarWidth}
          dragging={dragging}
          onViewDoc={handleViewDoc}
          onSearchChange={debouncedSetSearchText}
          onCreateDoc={handleCreateDoc}
          onCreateNotebook={createNotebook}
          onRestoreFromTrash={restoreFromTrash}
          onDeleteFromTrash={handleDeleteFromTrash}
          onClearTrash={handleClearTrash}
          onGoToDocs={() => {
            setActiveView("notebooks")
            setActiveLeftMenu("notebooks")
          }}
          onDocsResizeStart={startDocsResize}
          onDocsResizeReset={resetDocs}
        />

        <AppPanels
          activeDocId={activeDocId}
          activeNotebookId={activeNotebookId}
          onGenerateShareLink={handleGenerateShareLink}
          onDeleteShareLink={handleDeleteShareLink}
          onCopyShareLink={handleCopyShareLink}
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

      {/* 拖文件到窗口：提示会导入成新文档 */}
      {isDraggingFiles && (
        <div className="file-drop-overlay" aria-hidden="true">
          <div className="file-drop-hint">松开以导入 Markdown 文件</div>
        </div>
      )}

      {/* 帮助中心（O6）：上手 / 数据与安全 / 效率 / 反馈与诊断 */}
      <HelpDialog
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        onOpenShortcuts={() => {
          setShowHelp(false)
          uiActions.setShowShortcutHelp(true)
        }}
      />

      {/* 全局快速打开（Ctrl+P） */}
      {showQuickOpen && <QuickOpenPanel isOpen onClose={() => setShowQuickOpen(false)} />}

      {/* 首次启动引导（加载失败时不弹，先把问题解决掉） */}
      {showOnboarding && (
        <OnboardingDialog onClose={handleCloseOnboarding} onCreateFirstDoc={handleCreateFirstDoc} />
      )}

      {/* 数据加载失败：唯一恢复出口（重试 / 从备份恢复 / 打开数据目录 / 复制诊断） */}
      {loadError && <LoadFailureDialog message={loadError} />}

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