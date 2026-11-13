import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { DocVersion, NoteDoc } from '@/types'
import { useNotesStore } from '@/store'
import { toast } from '@/services/toast'

// 版本导出改走统一 IPC 通道（缺陷 14）：保留真实模块，仅替换 exportDoc
vi.mock('@/services/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/storage')>()
  return { ...actual, exportDoc: vi.fn(async () => true) }
})
vi.mock('@/hooks/useConfirmAction', () => ({ confirmAction: vi.fn() }))

import VersionHistoryPanel from '@/components/version/VersionHistoryPanel'
import { exportDoc } from '@/services/storage'
import { confirmAction } from '@/hooks/useConfirmAction'

const mockedExport = exportDoc as unknown as ReturnType<typeof vi.fn>
const mockedConfirm = confirmAction as unknown as ReturnType<typeof vi.fn>

const ver = (id: string, type: DocVersion['type'], content: string): DocVersion => ({
  id,
  docId: 'd1',
  notebookId: 'n1',
  title: '标题',
  content,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  type,
})

const doc: NoteDoc = {
  id: 'd1',
  title: '文档',
  content: '当前内容',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  versions: [ver('v1', 'auto', 'aaa'), ver('v2', 'manual', 'bbb'), ver('v3', 'auto', 'ccc')],
}

beforeEach(() => {
  vi.clearAllMocks()
  useNotesStore.setState({
    notebooks: [{ id: 'n1', title: '知识库', docs: [doc] }],
    activeNotebookId: 'n1',
    activeDocId: 'd1',
  })
})

const renderPanel = (): ReturnType<typeof render> =>
  render(<VersionHistoryPanel notebookId="n1" docId="d1" onClose={() => {}} />)

describe('版本对比流程（缺陷 6）', () => {
  it('对比模式下点列表项只更新当前版本，绝不退出对比模式', () => {
    const { container } = renderPanel()
    fireEvent.click(screen.getByText('版本对比'))
    // 初始两侧都空：给出引导而不是空白
    expect(screen.getByText(/先在左侧列表选一个版本/)).toBeInTheDocument()

    fireEvent.click(container.querySelectorAll('.version-item')[0])
    // 仍在对比模式（对比基准按钮还在），且引导推进到「选对比版本」
    expect(screen.getByRole('button', { name: '设为对比基准' })).toBeInTheDocument()
    expect(screen.getByText(/已选当前版本/)).toBeInTheDocument()
    // 没有弹回「全部记录」的详情视图
    expect(screen.queryByText('选择一个版本查看详情')).toBeNull()
  })

  it('未选版本时「设为对比基准」禁用并有说明', () => {
    renderPanel()
    fireEvent.click(screen.getByText('版本对比'))
    const btn = screen.getByRole('button', { name: '设为对比基准' })
    expect(btn).toBeDisabled()
    expect(btn.getAttribute('title')).toContain('请先在左侧列表选择一个版本')
  })

  it('两侧齐备后渲染 diff', () => {
    const { container } = renderPanel()
    fireEvent.click(screen.getByText('版本对比'))
    const items = container.querySelectorAll('.version-item')
    fireEvent.click(items[0])
    fireEvent.click(screen.getByRole('button', { name: '设为对比基准' }))
    fireEvent.click(items[1])
    expect(container.querySelector('.diff-view')).not.toBeNull()
  })
})

describe('版本列表过滤（缺陷 7）', () => {
  it('默认显示全部版本；取消勾选只显示手动版本', () => {
    const { container } = renderPanel()
    expect(container.querySelectorAll('.version-item')).toHaveLength(3)

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
    // 只剩 v2（manual）
    expect(container.querySelectorAll('.version-item')).toHaveLength(1)
  })

  it('过滤后无手动版本时给出引导空态', () => {
    useNotesStore.setState({
      notebooks: [{ id: 'n1', title: '知识库', docs: [{ ...doc, versions: [ver('v1', 'auto', 'aaa')] }] }],
    })
    renderPanel()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByText(/暂无手动保存的版本/)).toBeInTheDocument()
  })
})

describe('版本导出走 IPC（缺陷 14）', () => {
  it('点导出调用 exportDoc 并提示成功', async () => {
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => '')
    const { container } = renderPanel()
    fireEvent.click(container.querySelectorAll('.version-item')[1]) // manual v2
    fireEvent.click(screen.getByRole('button', { name: /导出/ }))
    expect(mockedExport).toHaveBeenCalledWith({ title: '标题', content: 'bbb' })
    // 导出是 async：toast.success 在 await exportDoc 之后才触发，需等待
    await waitFor(() => expect(successSpy).toHaveBeenCalledWith('已导出版本为 Markdown 文件'))
    successSpy.mockRestore()
  })
})

describe('恢复版本确认', () => {
  it('恢复走 danger 确认，确认后才还原', () => {
    const { container } = renderPanel()
    fireEvent.click(container.querySelectorAll('.version-item')[0])
    fireEvent.click(screen.getByRole('button', { name: /恢复此版本/ }))
    expect(mockedConfirm).toHaveBeenCalledTimes(1)
    const config = mockedConfirm.mock.calls[0][0] as { variant: string; onConfirm: () => void }
    expect(config.variant).toBe('danger')
    config.onConfirm()
    expect(useNotesStore.getState().notebooks[0].docs[0].content).toBe('aaa')
  })
})
