import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/** .md 文件关联开关（P5）：默认关闭、可恢复原关联、不支持的系统不显示该开关。 */

vi.mock('@/hooks/useConfirmAction', () => ({ confirmAction: vi.fn() }))

vi.mock('@/services/storage', () => ({
  isWebMode: false,
  getAppInfo: vi.fn(async () => ({
    ok: true,
    info: { version: '0.1.0', dataPath: 'C:/u/notes-data.json', dataDir: 'C:/u', backupDir: 'C:/u/backups' },
  })),
  getAppSettings: vi.fn(async () => ({ ok: true, settings: { closeToTray: false, globalQuickNote: false, autoLaunch: false, notifyWhenBackground: true, zoomFactor: 1 } })),
  saveAppSettings: vi.fn(async (patch: Record<string, unknown>) => ({ ok: true, settings: patch })),
  openDataDir: vi.fn(async () => ({ ok: true })),
  openExternal: vi.fn(async () => ({ ok: true })),
  listLocalBackups: vi.fn(async () => ({ ok: true, backups: [] })),
  onBackupCreated: vi.fn(() => () => {}),
  readCrashLog: vi.fn(async () => ({ ok: true, latest: null })),
  clearCrashLog: vi.fn(async () => ({ ok: true })),
  checkForUpdate: vi.fn(async () => ({ ok: true, current: '0.1.0', hasUpdate: false })),
  migrateDataDir: vi.fn(),
  relaunchApp: vi.fn(),
  getFileAssociation: vi.fn(),
  setFileAssociation: vi.fn(),
}))

import SettingsPanel from '@/components/settings/SettingsPanel'
import { getFileAssociation, setFileAssociation } from '@/services/storage'

const mockedGet = getFileAssociation as unknown as ReturnType<typeof vi.fn>
const mockedSet = setFileAssociation as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockedGet.mockResolvedValue({ ok: true, supported: true, enabled: false, previous: 'Typora.md' })
  mockedSet.mockResolvedValue({ ok: true, supported: true, enabled: true, previous: 'Typora.md' })
})

const renderPanel = (): ReturnType<typeof render> =>
  render(<SettingsPanel isOpen onClose={vi.fn()}  />)

describe('.md 文件关联（P5）', () => {
  it('默认关闭，并显示当前记录的原关联', async () => {
    renderPanel()
    const toggle = await screen.findByRole('checkbox', { name: /把 \.md 文件关联到本应用/ })
    expect(toggle).not.toBeChecked()
    expect(screen.getByText(/Typora\.md/)).toBeInTheDocument()
  })

  it('开启时调用主进程并更新状态', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('checkbox', { name: /把 \.md 文件关联到本应用/ }))

    await waitFor(() => expect(mockedSet).toHaveBeenCalledWith(true))
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /把 \.md 文件关联到本应用/ })).toBeChecked(),
    )
  })

  it('系统不支持时不显示该开关', async () => {
    mockedGet.mockResolvedValue({ ok: true, supported: false, enabled: false })
    renderPanel()

    await waitFor(() => expect(mockedGet).toHaveBeenCalled())
    expect(screen.queryByRole('checkbox', { name: /把 \.md 文件关联到本应用/ })).toBeNull()
  })

  it('设置失败时保持原状态并提示', async () => {
    mockedSet.mockResolvedValue({ ok: false, supported: true, enabled: false, error: '写入系统设置失败：拒绝访问' })
    renderPanel()

    fireEvent.click(await screen.findByRole('checkbox', { name: /把 \.md 文件关联到本应用/ }))
    await waitFor(() => expect(mockedSet).toHaveBeenCalled())
    expect(screen.getByRole('checkbox', { name: /把 \.md 文件关联到本应用/ })).not.toBeChecked()
  })
})
