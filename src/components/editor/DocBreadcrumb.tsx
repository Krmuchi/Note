import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNotesStore } from '@/store'
import { buildDocBreadcrumb, requestDocOpen } from '@/utils/docNavigation'

/**
 * 编辑器面包屑：知识库 › 父文档 › 当前文档（N2）。
 *
 * 订阅写法注意：**不要**把派生数组直接交给 useShallow ——
 * 数组里是每次新建的对象，浅比较永远不相等，getSnapshot 每次都返回新引用，
 * React 会报 "The result of getSnapshot should be cached" 并陷入死循环。
 * 这里改成本项目其它地方的惯用写法：订阅原始字段（引用/原始值稳定），
 * 再用 useMemo 派生，依赖都是渲染里真正用到的值。
 */
export const DocBreadcrumb: React.FC = () => {
  const { notebooks, notebookId, docId } = useNotesStore(
    useShallow((s) => ({
      notebooks: s.notebooks,
      notebookId: s.activeNotebookId,
      docId: s.activeDocId,
    })),
  )

  const crumbs = useMemo(
    () => buildDocBreadcrumb(notebooks, notebookId, docId),
    [notebooks, notebookId, docId],
  )

  if (crumbs.length <= 1) return null

  // 知识库 id 以面包屑第一级为准（与文档当前所属知识库一致，避免用到过期字段）
  const rootNotebookId = crumbs[0].id

  return (
    <nav className="doc-breadcrumb" aria-label="文档路径">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1
        const isNotebook = index === 0
        return (
          <React.Fragment key={crumb.id}>
            {index > 0 && (
              <span className="doc-breadcrumb-sep" aria-hidden="true">
                ›
              </span>
            )}
            {isLast || isNotebook ? (
              <span
                className={`doc-breadcrumb-item ${isLast ? 'current' : 'root'}`}
                title={crumb.title}
              >
                {crumb.title}
              </span>
            ) : (
              <button
                type="button"
                className="doc-breadcrumb-item link"
                title={`跳到「${crumb.title}」`}
                onClick={() => requestDocOpen({ notebookId: rootNotebookId, docId: crumb.id })}
              >
                {crumb.title}
              </button>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}

export default DocBreadcrumb
