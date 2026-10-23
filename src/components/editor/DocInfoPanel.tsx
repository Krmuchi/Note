import { useMemo } from 'react'
import type { JSX } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useNotesStore } from '@/store'
import { IconInfo } from '@/components/common/Icon'

/**
 * 文档信息面板（对齐语雀的"文档信息"）。
 *
 * 这些数据一直都有，但散落在版本面板、状态栏、标签面板里，没有一个地方
 * 能一次看全"这篇文档多大、什么时候建的、有多少版本和评论"。
 *
 * 直接从 store 读（而不是由父级传 props）：面板只在打开时挂载，订阅范围天然很小。
 */

interface DocInfoPanelProps {
  notebookId: string
  docId: string
  onClose: () => void
}

const formatSize = (chars: number): string => {
  // 按 UTF-8 大致字节数估算：中文 3 字节、其余 1 字节，用于提示存储占用
  const bytes = chars * 3
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const formatTime = (iso: string | undefined): string => {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN')
}

export function DocInfoPanel({ notebookId, docId, onClose }: DocInfoPanelProps): JSX.Element | null {
  const trapRef = useFocusTrap<HTMLDivElement>()

  const { doc, notebookTitle } = useNotesStore((s) => {
    const notebook = s.notebooks.find((nb) => nb.id === notebookId)
    const found = notebook?.docs.find((d) => d.id === docId)
    return { doc: found, notebookTitle: notebook?.title ?? '' }
  })

  const tagNames = useNotesStore((s) => s.tags)

  const stats = useMemo(() => {
    if (!doc) return null
    const content = doc.content || ''
    const chars = content.length
    const lines = content ? content.split('\n').length : 0
    const versions = doc.versions?.length ?? 0
    const manualVersions = (doc.versions ?? []).filter((v) => v.type === 'manual').length
    const comments = doc.comments?.length ?? 0
    const shareLinks = doc.shareLinks?.length ?? 0
    const tagLabels = (doc.tags ?? [])
      .map((id) => tagNames.find((t) => t.id === id)?.name)
      .filter((name): name is string => Boolean(name))

    return { chars, lines, versions, manualVersions, comments, shareLinks, tagLabels }
  }, [doc, tagNames])

  if (!doc || !stats) return null

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: '所属知识库', value: notebookTitle || '—' },
    { label: '创建时间', value: formatTime(doc.createdAt) },
    { label: '最后修改', value: formatTime(doc.updatedAt) },
    { label: '字数', value: `${stats.chars.toLocaleString('zh-CN')} 字符 · ${stats.lines.toLocaleString('zh-CN')} 行` },
    { label: '存储占用', value: `约 ${formatSize(stats.chars)}（含 Markdown 标记）` },
    {
      label: '版本',
      value: stats.versions > 0
        ? `${stats.versions} 个${stats.manualVersions > 0 ? `（含 ${stats.manualVersions} 个手动保存）` : ''}`
        : '暂无',
    },
    { label: '评论', value: stats.comments > 0 ? `${stats.comments} 条` : '暂无' },
    { label: '分享链接', value: stats.shareLinks > 0 ? `${stats.shareLinks} 个` : '暂无' },
    {
      label: '标签',
      value: stats.tagLabels.length > 0 ? stats.tagLabels.join('、') : '未打标签',
    },
    { label: '属性', value: [doc.favorite ? '已收藏' : '', doc.pinned ? '已置顶' : ''].filter(Boolean).join(' · ') || '无' },
  ]

  return (
    <div className="doc-info-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="文档信息">
      <div ref={trapRef} className="doc-info-panel" onClick={(e) => e.stopPropagation()}>
        <div className="doc-info-header">
          <h3 className="doc-info-title"><IconInfo size={16} /> 文档信息</h3>
          <button type="button" className="doc-info-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="doc-info-modal-title">{doc.title || '未命名文档'}</div>

        <div className="doc-info-body">
          {rows.map((row) => (
            <div key={row.label} className="doc-info-row">
              <span className="doc-info-label">{row.label}</span>
              <span className="doc-info-value">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default DocInfoPanel
