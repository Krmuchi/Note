import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useFileDropImport } from '@/hooks/useFileDropImport'

/** 拖文件到窗口导入：事件接线与"不抢编辑器拖放"的边界。 */

function dispatchWindowDrag(type: string, options: { files?: File[]; target?: EventTarget | null } = {}): Event {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], files: options.files ?? [], dropEffect: '' },
  })
  if (options.target) {
    // 模拟事件发生在某个元素上（用于验证 textarea 内的拖放会被忽略）
    options.target.dispatchEvent(event)
  } else {
    window.dispatchEvent(event)
  }
  return event
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('useFileDropImport', () => {
  it('拖入 .md 时读取内容并回调（标题取首个标题行）', async () => {
    const onImport = vi.fn()
    renderHook(() => useFileDropImport({ onImport }))

    dispatchWindowDrag('dragenter')
    dispatchWindowDrag('dragover')
    const file = new File(['# 标题\n\n正文'], 'note.md', { type: 'text/markdown' })
    dispatchWindowDrag('drop', { files: [file] })

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1))
    expect(onImport.mock.calls[0][0]).toEqual([{ title: '标题', content: '# 标题\n\n正文' }])
  })

  it('非文档文件不触发导入', async () => {
    const onImport = vi.fn()
    renderHook(() => useFileDropImport({ onImport }))

    dispatchWindowDrag('drop', { files: [new File(['x'], 'shot.png', { type: 'image/png' })] })
    await new Promise((r) => setTimeout(r, 0))
    expect(onImport).not.toHaveBeenCalled()
  })

  it('落在 textarea 上的拖放交给编辑器处理，不被这里抢走', async () => {
    const onImport = vi.fn()
    renderHook(() => useFileDropImport({ onImport }))

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    const file = new File(['# 标题'], 'note.md', { type: 'text/markdown' })
    dispatchWindowDrag('drop', { files: [file], target: textarea })

    await new Promise((r) => setTimeout(r, 0))
    expect(onImport).not.toHaveBeenCalled()
  })

  it('enabled=false 时完全不监听', async () => {
    const onImport = vi.fn()
    renderHook(() => useFileDropImport({ onImport, enabled: false }))

    dispatchWindowDrag('drop', { files: [new File(['# t'], 'a.md', { type: 'text/markdown' })] })
    await new Promise((r) => setTimeout(r, 0))
    expect(onImport).not.toHaveBeenCalled()
  })
})
