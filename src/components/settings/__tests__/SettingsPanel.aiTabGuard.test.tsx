import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * P0-1：AI 设置页的未保存草稿此前会被「切页签」静默丢掉 ——
 * 页签是条件渲染，切走即卸载，草稿与已输入的 API Key 随之消失；
 * 而守卫（aiSettingsDirty）又被卸载 cleanup 清成 false，关闭时也不再提醒。
 * 这里钉住三件事：切页签要确认、确认前 dirty 不能被清、面板真正关闭才清 dirty。
 */

type View = {
  configured: boolean
  hasKey: boolean
  encryptionAvailable: boolean
  sessionOnlyKey: boolean
  keyInvalid: boolean
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  timeoutMs: number
  stream: boolean
  maxTokensParam: 'max_tokens' | 'max_completion_tokens'
  disableStreamOptions: boolean
  concurrency: number
  maxInputTokens: number
  cacheEnabled: boolean
  consent: boolean
}

const viewFixture: View = {
  configured: false,
  hasKey: false,
  encryptionAvailable: true,
  sessionOnlyKey: false,
  keyInvalid: false,
  baseUrl: '',
  model: '',
  temperature: 0.7,
  maxTokens: 1600,
  timeoutMs: 60000,
  stream: true,
  maxTokensParam: 'max_tokens',
  disableStreamOptions: false,
  concurrency: 3,
  maxInputTokens: 8000,
  cacheEnabled: true,
  consent: false,
}

vi.mock('@/services/ai', () => ({
  aiClient: {
    config: {
      get: vi.fn(async () => ({
        configured: false,
        hasKey: false,
        encryptionAvailable: true,
        sessionOnlyKey: false,
        keyInvalid: false,
        baseUrl: '',
        model: '',
        temperature: 0.7,
        maxTokens: 1600,
        timeoutMs: 60000,
        stream: true,
        maxTokensParam: 'max_tokens',
        disableStreamOptions: false,
        concurrency: 3,
        maxInputTokens: 8000,
        cacheEnabled: true,
        consent: false,
      })),
      listModels: vi.fn(async () => ({ ok: true, baseUrl: '', models: [] })),
      test: vi.fn(async () => ({ ok: true })),
      set: vi.fn(async () => ({ ok: true })),
      clear: vi.fn(async () => ({ ok: true })),
    },
  },
  isAiFailure: () => false,
  PROVIDER_PRESETS: [],
  presetToFormPatch: () => ({}),
}))

vi.mock('@/services/storage', () => ({
  isWebMode: false,
  getAppInfo: vi.fn(async () => ({
    ok: true,
    info: { version: '0.1.0', dataPath: '/u/notes-data.json', dataDir: '/u', backupDir: '/u/backups' },
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
  setAppSettings: vi.fn(async (patch: Record<string, unknown>) => ({
    ok: true,
    settings: { zoomFactor: 1, ...patch },
  })),
  openDataDir: vi.fn(async () => ({ ok: true })),
  openExternal: vi.fn(async () => ({ ok: true })),
  listLocalBackups: vi.fn(async () => ({ ok: true, backups: [] })),
  onBackupCreated: vi.fn(() => () => {}),
  readCrashLog: vi.fn(async () => ({ ok: true, latest: null, entries: [], summary: '（无）' })),
  clearCrashLog: vi.fn(async () => ({ ok: true })),
  checkForUpdate: vi.fn(async () => ({ ok: true, hasUpdate: false })),
  copyToClipboard: vi.fn(async () => true),
  getFileAssociation: vi.fn(async () => ({ ok: true, supported: false, enabled: false })),
  setFileAssociation: vi.fn(async () => ({ ok: true, supported: false, enabled: false })),
}))

const confirmAction = vi.fn()
vi.mock('@/hooks/useConfirmAction', () => ({ confirmAction: (cfg: unknown) => confirmAction(cfg) }))

import SettingsPanel from '@/components/settings/SettingsPanel'
import AiSettingsTab from '@/components/settings/AiSettingsTab'
import { getUIState, uiActions } from '@/hooks/useUIState'

type ConfirmCfg = { title: string; confirmText: string; onConfirm: () => void }

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  uiActions.setAiSettingsDirty(false)
  uiActions.setSettingsTab('general')
})

async function openAiTab(rendered: ReturnType<typeof render>): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name: /AI/ }))
  // 接口地址输入框出现即代表 AI 页签已挂载、配置已到位
  await screen.findByLabelText('接口地址（baseUrl）')
  expect(rendered).toBeTruthy()
}

describe('P0-1 · AI 设置切页签不再静默丢草稿', () => {
  it('在 AI 页签编辑后切走：弹确认，确认前 dirty 不被清、确认后才切并清标记', async () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />)
    await openAiTab({} as ReturnType<typeof render>)

    fireEvent.change(screen.getByLabelText('接口地址（baseUrl）'), {
      target: { value: 'https://api.example.com/v1' },
    })
    await waitFor(() => expect(getUIState().aiSettingsDirty).toBe(true))

    fireEvent.click(screen.getByRole('tab', { name: /编辑器/ }))
    expect(confirmAction).toHaveBeenCalledTimes(1)
    const cfg = confirmAction.mock.calls[0][0] as ConfirmCfg
    expect(cfg.title).toBe('放弃未保存的 AI 配置？')
    expect(cfg.confirmText).toBe('放弃并切换')

    // 关键：确认框弹出期间 dirty 仍是 true（旧实现切走即卸载 → cleanup 清成 false）
    expect(getUIState().aiSettingsDirty).toBe(true)
    expect(getUIState().settingsTab).toBe('ai')

    cfg.onConfirm()
    expect(getUIState().settingsTab).toBe('editor')
    expect(getUIState().aiSettingsDirty).toBe(false)
  })

  it('没有未保存修改时切页签直接切换，不打扰', async () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />)
    await openAiTab({} as ReturnType<typeof render>)

    fireEvent.click(screen.getByRole('tab', { name: /快捷键/ }))
    expect(confirmAction).not.toHaveBeenCalled()
    expect(getUIState().settingsTab).toBe('shortcuts')
  })

  it('AiSettingsTab 卸载（切页签）不再把 dirty 清成 false', async () => {
    const { unmount } = render(<AiSettingsTab initial={viewFixture as never} />)
    await screen.findByLabelText('接口地址（baseUrl）')

    fireEvent.change(screen.getByLabelText('接口地址（baseUrl）'), {
      target: { value: 'https://api.example.com/v1' },
    })
    await waitFor(() => expect(getUIState().aiSettingsDirty).toBe(true))

    unmount()
    // 旧实现这里是 uiActions.setAiSettingsDirty(false)，守卫因此提前失效
    expect(getUIState().aiSettingsDirty).toBe(true)
  })

  it('设置面板真正关闭（卸载）时才清 dirty，避免下次打开误报', async () => {
    const { unmount } = render(<SettingsPanel isOpen onClose={vi.fn()} />)
    await openAiTab({} as ReturnType<typeof render>)
    fireEvent.change(screen.getByLabelText('接口地址（baseUrl）'), {
      target: { value: 'https://api.example.com/v1' },
    })
    await waitFor(() => expect(getUIState().aiSettingsDirty).toBe(true))

    unmount()
    expect(getUIState().aiSettingsDirty).toBe(false)
  })
})
