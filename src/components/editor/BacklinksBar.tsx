import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNotesStore } from '@/store'
import { collectBacklinks, type BacklinkRef } from '@/utils/wikiLinks'
import { requestDocOpen } from '@/utils/docNavigation'
import { IconLink } from '@/components/common/Icon'

/**
 * 反向链接条（K1）：显示"有哪些文档用 [[标题]] 引用了本文"。
 *
 * 位置选择：不新开一个侧栏面板（那要在 Editor 里再加一套开关与布局），
 * 而是在编辑器正文上方放一条可折叠的提示条 —— 只有真的被引用时才出现，平时不占空间。
 * 成本控制：标题解析走 utils/wikiLinks 里的 updatedAt 缓存，击键时只重解析改动的那篇。
 */
export default function BacklinksBar(): JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  const { notebooks, activeDocId } = useNotesStore(
    useShallow((s) => ({ notebooks: s.notebooks, activeDocId: s.activeDocId })),
  )

  /**
   * 索引计算放到空闲回调里：notebooks 的引用在每次击键时都会变，
   * 直接在渲染期算（实测 2000 篇约 11ms）会实打实拖慢输入。
   * 空闲回调天然会把连续击键合并成一次计算。
   */
  const [backlinks, setBacklinks] = useState<BacklinkRef[]>([])

  useEffect(() => {
    const run = (): void => setBacklinks(collectBacklinks(notebooks, activeDocId))
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 500 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(run, 120)
    return () => clearTimeout(id)
  }, [notebooks, activeDocId])

  if (backlinks.length === 0) return null

  return (
    <div className="backlinks-bar">
      <button
        type="button"
        className="backlinks-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="backlinks-icon" aria-hidden="true"><IconLink size={14} /></span>
        {backlinks.length} 篇文档引用了本文
        <span className="backlinks-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <ul className="backlinks-list">
          {backlinks.map((ref) => (
            <li key={ref.notebookId + ':' + ref.docId}>
              <button
                type="button"
                className="backlinks-item"
                onClick={() => requestDocOpen({ notebookId: ref.notebookId, docId: ref.docId })}
              >
                {ref.title || '未命名文档'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
