import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PdfExportDialog from '@/components/editor/PdfExportDialog'

/** 导出 PDF / 打印选项弹窗（C4 / C5）。 */

const setup = (): { onExport: ReturnType<typeof vi.fn>; onPrint: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } => {
  const onExport = vi.fn()
  const onPrint = vi.fn()
  const onClose = vi.fn()
  render(<PdfExportDialog isOpen onClose={onClose} onExport={onExport} onPrint={onPrint} />)
  return { onExport, onPrint, onClose }
}

describe('PdfExportDialog', () => {
  it('未打开时不渲染', () => {
    const { container } = render(
      <PdfExportDialog isOpen={false} onClose={vi.fn()} onExport={vi.fn()} onPrint={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('默认 A4 + 常规边距 + 不显示页码', () => {
    setup()
    expect(screen.getByLabelText('页面尺寸')).toHaveValue('A4')
    expect(screen.getByLabelText('页边距')).toHaveValue('normal')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('导出时把用户选的选项一起传出去', () => {
    const { onExport } = setup()

    fireEvent.change(screen.getByLabelText('页面尺寸'), { target: { value: 'A3' } })
    fireEvent.change(screen.getByLabelText('页边距'), { target: { value: 'narrow' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '导出为 PDF' }))

    expect(onExport).toHaveBeenCalledWith({ pageSize: 'A3', margin: 'narrow', headerFooter: true })
  })

  it('直接打印不经过导出，且关闭弹窗', () => {
    const { onPrint, onExport, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: '直接打印…' }))

    expect(onPrint).toHaveBeenCalled()
    expect(onExport).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('取消只关闭弹窗', () => {
    const { onClose, onExport, onPrint } = setup()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalled()
    expect(onExport).not.toHaveBeenCalled()
    expect(onPrint).not.toHaveBeenCalled()
  })
})
