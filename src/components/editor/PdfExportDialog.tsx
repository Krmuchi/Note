import { useState } from 'react'
import type { JSX } from 'react'
import type { PdfExportOptions, PdfMarginPreset, PdfPageSize } from '@/types'
import { DEFAULT_PDF_OPTIONS, PDF_MARGIN_PRESETS, PDF_PAGE_SIZES } from '@/utils/pdfOptions'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface PdfExportDialogProps {
  isOpen: boolean
  onClose: () => void
  onExport: (options: PdfExportOptions) => void
  onPrint: () => void
}

/**
 * 导出 PDF / 打印的选项弹窗（C4 / C5）。
 *
 * 此前导出 PDF 是固定 A4 + 固定边距，打印功能则完全没有。
 * 两者共用同一份选项：打印走系统对话框，导出走 Chromium 的 printToPDF。
 * 样式复用既有的 .confirm-dialog / .link-dialog-field / .settings-toggle-row，不新增 CSS。
 */
export default function PdfExportDialog({ isOpen, onClose, onExport, onPrint }: PdfExportDialogProps): JSX.Element | null {
  const trapRef = useFocusTrap<HTMLDivElement>()
  const [options, setOptions] = useState<PdfExportOptions>(DEFAULT_PDF_OPTIONS)

  if (!isOpen) return null

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div
        ref={trapRef}
        className="confirm-dialog pdf-export-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="导出 PDF 与打印"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-dialog-header">
          <h3>导出 PDF / 打印</h3>
        </div>

        <div className="link-dialog-field">
          <label htmlFor="pdf-page-size">页面尺寸</label>
          <select
            id="pdf-page-size"
            value={options.pageSize}
            onChange={(e) => setOptions((prev) => ({ ...prev, pageSize: e.target.value as PdfPageSize }))}
          >
            {PDF_PAGE_SIZES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="link-dialog-field">
          <label htmlFor="pdf-margin">页边距</label>
          <select
            id="pdf-margin"
            value={options.margin}
            onChange={(e) => setOptions((prev) => ({ ...prev, margin: e.target.value as PdfMarginPreset }))}
          >
            {PDF_MARGIN_PRESETS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={options.headerFooter}
            onChange={(e) => setOptions((prev) => ({ ...prev, headerFooter: e.target.checked }))}
          />
          <span>
            每页显示页眉页码
            <em>页眉为文档标题，页脚为「第 x / y 页」；开启后上下边距会自动留出空间</em>
          </span>
        </label>

        <div className="confirm-dialog-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              onPrint()
              onClose()
            }}
          >
            直接打印…
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onExport(options)
              onClose()
            }}
          >
            导出为 PDF
          </button>
        </div>
      </div>
    </div>
  )
}
