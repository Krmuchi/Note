import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// 设置面板在 jsdom（isWebMode=true）下会渲染 BackupPanel 并走 IndexedDB，
// 这里把 storage 服务整体替成轻量 stub，只保留面板用到的导出。
vi.mock('@/services/storage', () => ({
  isWebMode: true,
  getAppInfo: vi.fn(async () => ({ ok: true, info: { version: '0.1.0', dataPath: '', dataDir: '', backupDir: '' } })),
  getAppSettings: vi.fn(async () => ({ ok: false })),
  openDataDir: vi.fn(async () => ({ ok: true })),
  setAppSettings: vi.fn(async () => ({ ok: true, settings: {} })),
  listLocalBackups: vi.fn(async () => ({ ok: true, backups: [] })),
  restoreLocalBackup: vi.fn(async () => ({ ok: true, restoredAt: '' })),
  onBackupCreated: vi.fn(() => () => {}),
  getFileAssociation: vi.fn(async () => ({ supported: false })),
  setFileAssociation: vi.fn(async () => ({ supported: false })),
  migrateDataDir: vi.fn(async () => ({ ok: true })),
  relaunchApp: vi.fn(async () => ({ ok: true })),
  readCrashLog: vi.fn(async () => ({ ok: true, latest: null, entries: [] })),
  clearCrashLog: vi.fn(async () => ({ ok: true })),
  checkForUpdate: vi.fn(async () => ({ ok: true, hasUpdate: false })),
  openExternal: vi.fn(async () => {}),
}))
vi.mock('@/hooks/useConfirmAction', () => ({ confirmAction: vi.fn() }))

import SettingsPanel from '@/components/settings/SettingsPanel'
import { confirmAction } from '@/hooks/useConfirmAction'
import { uiActions, getUIState } from '@/hooks/useUIState'
import { aiClient } from '@/services/ai'
import type { AiConfigView } from '@/types/ai'

const confirmMock = confirmAction as unknown as Mock

const view: AiConfigView = {
  configured: true,
  hasKey: true,
  encryptionAvailable: true,
  sessionOnlyKey: false,
  keyInvalid: false,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 1600,
  timeoutMs: 60000,
  stream: true,
  maxTokensParam: 'max_tokens',
  disableStreamOptions: false,
  concurrency: 3,
  maxInputTokens: 8000,
  cacheEnabled: true,
  consent: true,
}

beforeEach(() => {
  uiActions.reset()
  vi.restoreAllMocks()
  confirmMock.mockClear()
})

describe('SettingsPanel - 初始页签（缺陷7）', () => {
  it('uiActions.openSettings("ai") 打开即定位 AI 页签并加载配置', async () => {
    vi.spyOn(aiClient.config, 'get').mockResolvedValue(view)
    uiActions.openSettings('ai')

    render(<SettingsPanel isOpen onClose={vi.fn()} />)

    // AI 页签内容出现（接口地址输入框带已保存值）
    await waitFor(() =>
      expect((screen.getByLabelText('接口地址（baseUrl）') as HTMLInputElement).value).toBe(
        'https://api.deepseek.com',
      ),
    )
    // 冲刷 BackupPanel 等异步加载 effect，避免 act 警告
    await act(async () => {})
    expect(aiClient.config.get).toHaveBeenCalled()
  })
})

describe('SettingsPanel - 关闭守卫（缺陷10）', () => {
  it('AI 有未保存修改时点 × 先弹确认，确认后才真正关闭', async () => {
    vi.spyOn(aiClient.config, 'get').mockResolvedValue(view)
    const onClose = vi.fn()
    uiActions.openSettings('ai')
    render(<SettingsPanel isOpen onClose={onClose} />)

    // 编辑 AI 表单制造 dirty
    const tempInput = await screen.findByLabelText('temperature（0-2）')
    await act(async () => {})
    fireEvent.change(tempInput, { target: { value: '0.8' } })
    expect(getUIState().aiSettingsDirty).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '×' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(confirmMock.mock.calls[0][0].title).toContain('未保存')

    confirmMock.mock.calls[0][0].onConfirm()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(getUIState().aiSettingsDirty).toBe(false)
  })

  it('无未保存修改时点遮罩直接关闭，不弹确认', async () => {
    const onClose = vi.fn()
    render(<SettingsPanel isOpen onClose={onClose} />)
    // 冲刷面板/BackupPanel 的异步加载 effect，避免 act 警告
    await act(async () => {})
    // 默认 general 页签，AI 未编辑 → 不 dirty
    fireEvent.click(document.querySelector('.settings-overlay') as HTMLElement)
    expect(confirmMock).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('SettingsPanel - 焦点陷阱（缺陷13 设置页部分）', () => {
  it('Tab 在面板内循环：最后一个可聚焦元素 → 第一个', async () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />)
    await act(async () => {})
    const panel = document.querySelector('.settings-panel') as HTMLElement
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])'),
    )
    expect(focusables.length).toBeGreaterThanOrEqual(2)
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    last.focus()
    fireEvent.keyDown(panel, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })
})
