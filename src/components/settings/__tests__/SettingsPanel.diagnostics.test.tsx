import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * 设置面板里的诊断与更新（D3 / D5）。
 * 只覆盖渲染层行为：主进程的网络请求与文件读写另有纯模块单测
 * （tests/unit/updateCheck.test.ts / crashLog.test.ts）。
 */

vi.mock('@/services/storage', () => ({
  isWebMode: false,
  getAppInfo: vi.fn(async () => ({
    ok: true,
    info: {
      version: '0.1.0',
      dataPath: 'C:/u/notes-data.json',
      dataDir: 'C:/u',
      backupDir: 'C:/u/backups',
    },
  })),
  getAppSettings: vi.fn(async () => ({
    ok: true,
    settings: {
      closeToTray: false,
      globalQuickNote: false,
      autoLaunch: false,
      notifyWhenBackground: true,
      zoomFactor: 1,
    },
  })),
  saveAppSettings: vi.fn(async (patch: Record<string, unknown>) => ({
    ok: true,
    settings: { closeToTray: false, globalQuickNote: false, autoLaunch: false, notifyWhenBackground: true, zoomFactor: 1, ...patch },
  })),
  openDataDir: vi.fn(async () => ({ ok: true })),
  openExternal: vi.fn(async () => ({ ok: true })),
  listLocalBackups: vi.fn(async () => ({ ok: true, backups: [] })),
  onBackupCreated: vi.fn(() => () => {}),
  readCrashLog: vi.fn(),
  clearCrashLog: vi.fn(),
  checkForUpdate: vi.fn(),
  copyToClipboard: vi.fn(async () => true),
  // P5：设置面板会读一次文件关联状态，未 mock 会让整个面板渲染失败
  getFileAssociation: vi.fn(async () => ({ ok: true, supported: false, enabled: false })),
  setFileAssociation: vi.fn(async () => ({ ok: true, supported: false, enabled: false })),
}))

vi.mock('@/hooks/useConfirmAction', () => ({ confirmAction: vi.fn() }))

import SettingsPanel from '@/components/settings/SettingsPanel'
import { checkForUpdate, clearCrashLog, openExternal, readCrashLog } from '@/services/storage'

const mockedCheck = checkForUpdate as unknown as ReturnType<typeof vi.fn>
const mockedReadCrash = readCrashLog as unknown as ReturnType<typeof vi.fn>
const mockedClearCrash = clearCrashLog as unknown as ReturnType<typeof vi.fn>
const mockedOpenExternal = openExternal as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockedReadCrash.mockResolvedValue({ ok: true, latest: null, entries: [], summary: '（无崩溃记录）' })
  mockedClearCrash.mockResolvedValue({ ok: true })
  mockedCheck.mockResolvedValue({ ok: true, current: '0.1.0', hasUpdate: false })
})

const renderPanel = (): ReturnType<typeof render> =>
  render(<SettingsPanel isOpen onClose={vi.fn()} fontSize="16px" onFontSizeChange={vi.fn()} />)

describe('设置 · 检查更新（D3）', () => {
  it('初始显示未检查，点击后显示已是最新', async () => {
    renderPanel()
    const button = await screen.findByRole('button', { name: '检查更新' })

    fireEvent.click(button)
    await waitFor(() => expect(screen.getByText('已是最新版本')).toBeInTheDocument())
    expect(mockedCheck).toHaveBeenCalled()
  })

  it('有新版本时显示版本号与更新说明，并可打开下载页', async () => {
    mockedCheck.mockResolvedValue({
      ok: true,
      current: '0.1.0',
      hasUpdate: true,
      latest: '0.2.0',
      url: 'https://example.com/notes-0.2.0.exe',
      notes: '- 修复了导出',
    })
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '检查更新' }))
    await waitFor(() => expect(screen.getByText('有新版本 0.2.0')).toBeInTheDocument())
    expect(screen.getByText('- 修复了导出')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打开下载页' }))
    await waitFor(() => expect(mockedOpenExternal).toHaveBeenCalledWith('https://example.com/notes-0.2.0.exe'))
  })

  it('检查失败时显示原因，不显示下载页', async () => {
    mockedCheck.mockResolvedValue({ ok: false, error: '网络请求失败' })
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '检查更新' }))
    await waitFor(() => expect(screen.getByText('网络请求失败')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '打开下载页' })).toBeNull()
  })
})

describe('设置 · 崩溃记录（D5）', () => {
  it('没有记录时崩溃行显示暂无记录', async () => {
    renderPanel()
    await waitFor(() => expect(mockedReadCrash).toHaveBeenCalled())
    // 诊断区里「错误日志」与「崩溃记录」都会显示"暂无记录"，因此这里按数量断言
    expect(screen.getAllByText('暂无记录').length).toBeGreaterThan(1)
  })

  it('有记录时显示摘要，清空后回到暂无', async () => {
    mockedReadCrash.mockResolvedValue({
      ok: true,
      latest: { type: 'renderer-gone', at: '2026-10-01T00:00:00.000Z', message: '渲染进程退出：crashed', stack: '', appVersion: '0.1.0', platform: 'win32' },
      entries: [],
      summary: '2026/10/1 08:00:00 [renderer-gone] 渲染进程退出：crashed',
    })
    renderPanel()

    await waitFor(() => expect(screen.getByText('渲染进程退出：crashed')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '清空崩溃记录' }))
    await waitFor(() => expect(mockedClearCrash).toHaveBeenCalled())
    // 清空后那条摘要不再出现
    await waitFor(() => expect(screen.queryByText('渲染进程退出：crashed')).toBeNull())
  })
})
