import type { PdfExportOptions, PdfMarginPreset, PdfPageSize } from '@/types'

/**
 * PDF 导出 / 打印的界面选项（C4）。
 *
 * 取值必须与主进程的 electron/ipc/export-options.cjs 一致 ——
 * 主进程会丢弃它不认识的取值，两边漂移的话用户选了也没用。
 * 这层对应关系由 tests/unit/pdfOptions.test.ts 交叉断言。
 */
export const PDF_PAGE_SIZES: { value: PdfPageSize; label: string }[] = [
  { value: 'A4', label: 'A4（默认）' },
  { value: 'A3', label: 'A3' },
  { value: 'A5', label: 'A5' },
  { value: 'Letter', label: 'Letter' },
]

export const PDF_MARGIN_PRESETS: { value: PdfMarginPreset; label: string }[] = [
  { value: 'narrow', label: '窄' },
  { value: 'normal', label: '常规（默认）' },
  { value: 'wide', label: '宽' },
]

export const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  pageSize: 'A4',
  margin: 'normal',
  headerFooter: false,
}
