import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/** 备份面板：状态展示 + 覆盖式恢复的调用链（侧栏与设置共用同一组件）。 */

vi.mock('@/services/storage', () => ({
  isWebMode: false,
  listLocalBackups: vi.fn(),
  restoreLocalBackup: vi.fn(),
  openDataDir: vi.fn(),
  onBackupCreated: vi.fn(() => () => {}),
  loadAppStore: vi.fn(async () => ({ ok: true, data: { notebooks: [], trash: [], tags: [], searchHistory: [] } })),
  saveAppStore: vi.fn(async (payload: unknown) => payload),
}))

vi.mock('@/hooks/useConfirmAction', () => ({
  confirmAction: vi.fn(),
}))

import BackupPanel from '@/components/settings/BackupPanel'
import { listLocalBackups, restoreLocalBackup, openDataDir } from '@/services/storage'
import { confirmAction } from '@/hooks/useConfirmAction'

const mockedList = listLocalBackups as unknown as ReturnType<typeof vi.fn>
const mockedRestore = restoreLocalBackup as unknown as ReturnType<typeof vi.fn>
const mockedOpenDir = openDataDir as unknown as ReturnType<typeof vi.fn>
const mockedConfirm = confirmAction as unknown as ReturnType<typeof vi.fn>

const backups = [
  { name: 'backup-2026-10-01.json', size: 2048, createdAt: '2026-10-01T10:00:00.000Z', auto: true },
  { name: 'prerestore-2026-09-30.json', size: 1024, createdAt: '2026-09-30T10:00:00.000Z', auto: false },
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockedList.mockResolvedValue({ ok: true, backups })
  mockedRestore.mockResolvedValue({ ok: true, restoredAt: '2026-10-01T12:00:00.000Z' })
  mockedOpenDir.mockResolvedValue({ ok: true })
})

describe('BackupPanel', () => {
  it('展示备份份数、时间与快照标记', async () => {
    render(<BackupPanel />)

    await waitFor(() => expect(screen.getByText('共 2 份')).toBeInTheDocument())
    expect(screen.getByText('恢复前快照')).toBeInTheDocument()
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
    expect(screen.getByText('1.0 KB')).toBeInTheDocument()
  })

  it('没有备份时给出说明而不是空白', async () => {
    mockedList.mockResolvedValue({ ok: true, backups: [] })
    render(<BackupPanel />)
    await waitFor(() => expect(screen.getByText(/暂无本地备份/)).toBeInTheDocument())
  })

  it('读取失败（浏览器模式）时不弹错，只显示空列表', async () => {
    mockedList.mockResolvedValue({ ok: false, error: '浏览器模式不支持本地自动备份' })
    render(<BackupPanel />)
    await waitFor(() => expect(screen.getByText(/暂无本地备份/)).toBeInTheDocument())
  })

  it('点击备份项先弹确认，确认后才覆盖恢复', async () => {
    const { container } = render(<BackupPanel />)
    await waitFor(() => expect(screen.getByText('共 2 份')).toBeInTheDocument())

    // 用 DOM 结构定位（备份项按时间倒序，第一个是最新那份），避免依赖日期本地化格式
    fireEvent.click(container.querySelectorAll('.backup-item')[0])

    expect(mockedConfirm).toHaveBeenCalledTimes(1)
    const config = mockedConfirm.mock.calls[0][0] as { variant: string; onConfirm: () => Promise<void> }
    expect(config.variant).toBe('danger')
    expect(mockedRestore).not.toHaveBeenCalled()

    await config.onConfirm()
    expect(mockedRestore).toHaveBeenCalledWith('backup-2026-10-01.json')
    expect(mockedList).toHaveBeenCalledTimes(2) // 初始加载 + 恢复后刷新
  })

  it('打开数据目录', async () => {
    render(<BackupPanel />)
    await waitFor(() => expect(screen.getByText('共 2 份')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '打开数据目录' }))
    expect(mockedOpenDir).toHaveBeenCalled()
  })
})
