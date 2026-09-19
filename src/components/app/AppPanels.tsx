import { lazy, Suspense } from 'react'
import { LazyLoader } from '@/components/common/LazyLoader'
import { Loading } from '@/components/common/Loading'

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

interface AppPanelsProps {
  showSharePanel: boolean
  showTagPanel: boolean
  showSearchPanel: boolean
  showVersionHistory: boolean
  showShortcutHelp: boolean
  showSettings: boolean
  activeDocId: string
  activeNotebookId: string
  activeDocTitle: string
  shareLinks: import('@/types').ShareLink[]
  fontSize: string
  onCloseSharePanel: () => void
  onCloseTagPanel: () => void
  onCloseSearchPanel: () => void
  onCloseVersionHistory: () => void
  onCloseShortcutHelp: () => void
  onCloseSettings: () => void
  onGenerateShareLink: (permission: string, password: string, expiresAt: string | null) => void
  onDeleteShareLink: (linkId: string) => void
  onCopyShareLink: (url: string) => Promise<void>
  onFontSizeChange: (size: string) => void
}

export function AppPanels({
  showSharePanel,
  showTagPanel,
  showSearchPanel,
  showVersionHistory,
  showShortcutHelp,
  showSettings,
  activeDocId,
  activeNotebookId,
  activeDocTitle,
  shareLinks,
  fontSize,
  onCloseSharePanel,
  onCloseTagPanel,
  onCloseSearchPanel,
  onCloseVersionHistory,
  onCloseShortcutHelp,
  onCloseSettings,
  onGenerateShareLink,
  onDeleteShareLink,
  onCopyShareLink,
  onFontSizeChange,
}: AppPanelsProps) {
  return (
    <>
      {showSharePanel && (
        <LazyLoader>
          <Suspense fallback={PanelFallback}>
            <SharePanel
              key={`share-${activeDocId}`}
              isOpen={showSharePanel}
              onClose={onCloseSharePanel}
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
            <TagPanel key="tag-panel-popup" isOpen={showTagPanel} onClose={onCloseTagPanel} />
          </Suspense>
        </LazyLoader>
      )}

      {showSearchPanel && (
        <LazyLoader>
          <Suspense fallback={PanelFallback}>
            <SearchPanel key="search-panel" isOpen={showSearchPanel} onClose={onCloseSearchPanel} />
          </Suspense>
        </LazyLoader>
      )}

      {showVersionHistory && (
        <LazyLoader>
          <Suspense fallback={PanelFallback}>
            <VersionHistoryPanel
              onClose={onCloseVersionHistory}
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
              onClose={onCloseShortcutHelp}
            />
          </Suspense>
        </LazyLoader>
      )}

      {showSettings && (
        <LazyLoader>
          <Suspense fallback={PanelFallback}>
            <SettingsPanel
              isOpen={showSettings}
              onClose={onCloseSettings}
              fontSize={fontSize}
              onFontSizeChange={onFontSizeChange}
            />
          </Suspense>
        </LazyLoader>
      )}
    </>
  )
}