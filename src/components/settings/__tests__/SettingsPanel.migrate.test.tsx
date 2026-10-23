import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * 数据目录迁移（O5）。
 * confirmAction 在本项目里是**回调式单例**，所以测试里要按调用顺序自动"点确认"，
 * 才能把"确认 → 迁移 → 再确认 → 重启"这条链走完。
 */

const confirmCalls: { title: string; onConfirm: () => void }[] = []
/** 默认自动确认；需要测"用户取消"时把它设为 false */
let autoConfirm = true

vi.mock('@/hooks/useConfirmAction', () => ({
  confirmAction: (config: { title: string; onConfirm: () => void }) => {
    confirmCalls.push(config)
    if (autoConfirm) config.onConfirm()
  },
}))

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
  // P5：设置面板会读一次文件关联状态
  getFileAssociation: vi.fn(async () => ({ ok: true, supported: false, enabled: false })),
  setFileAssociation: vi.fn(async () => ({ ok: true, supported: false, enabled: false })),
}))

import SettingsPanel from '@/components/settings/SettingsPanel'
import { migrateDataDir, relaunchApp } from '@/services/storage'

const mockedMigrate = migrateDataDir as unknown as ReturnType<typeof vi.fn>
const mockedRelaunch = relaunchApp as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  confirmCalls.length = 0
  autoConfirm = true
  mockedMigrate.mockResolvedValue({ ok: true, dataDir: 'D:/notes-data', copiedDataFile: true, copiedBackups: 3 })
  mockedRelaunch.mockResolvedValue({ ok: true })
})

const renderPanel = (): ReturnType<typeof render> =>
  render(<SettingsPanel isOpen onClose={vi.fn()} fontSize="16px" onFontSizeChange={vi.fn()} />)

describe('更换数据目录（O5）', () => {
  it('先确认再迁移，成功后二次确认并重启', async () => {
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '更换数据目录…' }))

    await waitFor(() => expect(mockedMigrate).toHaveBeenCalledTimes(1))
    // 第一次确认是"更换数据目录"，第二次是"迁移完成"
    await waitFor(() => expect(confirmCalls.map((c) => c.title)).toEqual(['更换数据目录', '迁移完成']))
    await waitFor(() => expect(mockedRelaunch).toHaveBeenCalledTimes(1))
  })

  it('用户取消时不调用迁移', async () => {
    autoConfirm = false
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '更换数据目录…' }))
    await waitFor(() => expect(confirmCalls).toHaveLength(1))
    expect(mockedMigrate).not.toHaveBeenCalled()
  })

  it('迁移失败（如目标目录已有数据）时不进入重启确认', async () => {
    mockedMigrate.mockResolvedValue({ ok: false, error: '目标目录里已经有一份 notes-data.json' })
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '更换数据目录…' }))
    await waitFor(() => expect(mockedMigrate).toHaveBeenCalled())
    expect(confirmCalls.map((c) => c.title)).toEqual(['更换数据目录'])
    expect(mockedRelaunch).not.toHaveBeenCalled()
  })

  it('用户在文件选择框里取消时静默返回（不报错、不提示重启）', async () => {
    mockedMigrate.mockResolvedValue({ ok: false, canceled: true })
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '更换数据目录…' }))
    await waitFor(() => expect(mockedMigrate).toHaveBeenCalled())
    expect(confirmCalls.map((c) => c.title)).toEqual(['更换数据目录'])
    expect(mockedRelaunch).not.toHaveBeenCalled()
  })
})
