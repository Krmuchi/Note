import { lazy, Suspense } from 'react'
import type { JSX } from 'react'
import { useNotesStore, selectActiveDoc } from '@/store'
import { uiActions, useUIState } from '@/hooks/useUIState'
import { LazyLoader } from '@/components/common/LazyLoader'
import { Loading } from '@/components/common/Loading'
import type { ShareLink } from '@/types'

/** 无分享链接时的稳定空数组：避免每次 selector 返回新 [] 触发无用重渲染 */
const EMPTY_SHARE_LINKS: ShareLink[] = []

/** 统一的面板懒加载 fallback：弹窗打开时不再短暂空白 */
const PanelFallback = (
  <div className="panel-suspense-fallback" style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
    <Loading type="spinner" size="medium" text="加载中..." />
  </div>
)

const SharePanel = lazy(() => import('@/components/share/SharePanel'))
const TagPanel = lazy(() => import('@/components/tags/TagPanel'))
const SearchPanel = lazy(() => import('@/components/search/SearchPanel'))
const VersionHistoryPanel = lazy(() => import('@/components/version/VersionHistoryPanel'))
const ShortcutHelp = lazy(() => import('@/components/common/ShortcutHelp'))
const SettingsPanel = lazy(() => import('@/components/settings/SettingsPanel'))

/**
 * 全局浮层面板集合。
 *
 * 面板开关（6 个）与字号改为**自订阅** `useUIState`：它们只是"开关状态"，
 * 由 App 逐个透传（旧版 19 个 props）没有任何收益，反而让每个新面板
 * 都要在 App、类型、实参三处同步。
 *
 * 保留为 props 的都是真正的动作回调（分享链接的增删复制需要 App 层的闭包
 * 上下文：toast、错误提示、状态刷新）。
 */
interface AppPanelsProps {
  activeDocId: string
  activeNotebookId: string
  onGenerateShareLink: (permission: string, password: string, expiresAt: string | null) => void
  onDeleteShareLink: (linkId: string) => void
  onCopyShareLink: (url: string) => Promise<void>
}

export function AppPanels({
  activeDocId,
  activeNotebookId,
  onGenerateShareLink,
  onDeleteShareLink,
  onCopyShareLink,
}: AppPanelsProps): JSX.Element {
  const {
    showSharePanel,
    showTagPanel,
    showSearchPanel,
    showVersionHistory,
    showShortcutHelp,
    showSettings,
  } = useUIState()
  const {
    setShowSharePanel,
    setShowTagPanel,
    setShowSearchPanel,
    setShowVersionHistory,
    setShowShortcutHelp,
    setShowSettings,
  } = uiActions

  /*
   * 分享面板需要的标题与链接由本组件自己订阅，而不是由 App 透传：
   * 这两个值都挂在 activeDoc 上，会随每次击键变化，透传会让 App 外壳
   * 在输入链路上重渲染。面板本身只在打开时才渲染，订阅范围足够小。
   */
  const activeDocTitle = useNotesStore((s) => selectActiveDoc(s)?.title ?? '')
  const shareLinks = useNotesStore((s) => selectActiveDoc(s)?.shareLinks) ?? EMPTY_SHARE_LINKS

  return (
    <>
      {showSharePanel && (
        <LazyLoader>
          <Suspense fallback={PanelFallback}>
            <SharePanel
              key={`share-${activeDocId}`}
              isOpen={showSharePanel}
              onClose={() => setShowSharePanel(false)}
              docTitle={activeDocTitle}
              docId={activeDocId}
              notebookId={activeNotebookId}
              shareLinks={shareLinks}
              onGenerateLink={onGenerateShareLink}
              onDeleteLink={onDeleteShareLink}
              onCopyLink={onCopyShareLink}
            />
          </Suspense>
        </LazyLoader>
      )}

      {showTagPanel && (
        <LazyLoader>
          <Suspense fallback={PanelFallback}>
            <TagPanel key="tag-panel-popup" isOpen={showTagPanel} onClose={() => setShowTagPanel(false)} />
          </Suspense>
        </LazyLoader>
      )}

      {showSearchPanel && (
        <LazyLoader>
          <Suspense fallback={PanelFallback}>
            <SearchPanel key="search-panel" isOpen={showSearchPanel} onClose={() => setShowSearchPanel(false)} />
          </Suspense>
        </LazyLoader>
      )}

      {showVersionHistory && (
        <LazyLoader>
          <Suspense fallback={PanelFallback}>
            <VersionHistoryPanel
              onClose={() => setShowVersionHistory(false)}
              notebookId={activeNotebookId}
              docId={activeDocId}
            />
          </Suspense>
        </LazyLoader>
      )}

      {showShortcutHelp && (
        <LazyLoader>
          <Suspense fallback={PanelFallback}>
            <ShortcutHelp
              isOpen={showShortcutHelp}
              onClose={() => setShowShortcutHelp(false)}
            />
          </Suspense>
        </LazyLoader>
      )}

      {showSettings && (
        <LazyLoader>
          <Suspense fallback={PanelFallback}>
            <SettingsPanel
              isOpen={showSettings}
              onClose={() => setShowSettings(false)}
            />
          </Suspense>
        </LazyLoader>
      )}
    </>
  )
}
