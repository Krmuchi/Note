import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// confirmAction 是模块级单例发射器，这里替成 spy 以便断言「清除密钥」走了 danger 确认
vi.mock('@/hooks/useConfirmAction', () => ({ confirmAction: vi.fn() }))

import AiSettingsTab from '@/components/settings/AiSettingsTab'
import { aiClient } from '@/services/ai'
import { confirmAction } from '@/hooks/useConfirmAction'
import { uiActions, getUIState } from '@/hooks/useUIState'
import type { AiConfigView } from '@/types/ai'

const configuredView: AiConfigView = {
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

const confirmMock = confirmAction as unknown as Mock

beforeEach(() => {
  uiActions.reset()
  vi.restoreAllMocks()
  confirmMock.mockClear()
})

describe('AiSettingsTab - 草稿基底（缺陷2）', () => {
  it('已有配置下只改 temperature，保存补丁不丢 baseUrl/model/consent 等其余字段', async () => {
    const setSpy = vi
      .spyOn(aiClient.config, 'set')
      .mockResolvedValue({ ...configuredView, temperature: 0.9 })

    render(<AiSettingsTab initial={configuredView} onViewChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('temperature（0-2）'), { target: { value: '0.9' } })
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))

    await waitFor(() => expect(setSpy).toHaveBeenCalledTimes(1))
    const patch = setSpy.mock.calls[0][0]
    expect(patch.temperature).toBe(0.9)
    // 关键回归：其余字段必须保留，而不是被打回 EMPTY_FORM 默认值
    expect(patch.baseUrl).toBe('https://api.deepseek.com')
    expect(patch.model).toBe('deepseek-chat')
    expect(patch.consent).toBe(true)
    expect(patch.maxTokens).toBe(1600)
    expect(patch.timeoutMs).toBe(60000)
    expect(patch.concurrency).toBe(3)
  })

  it('首次编辑后模型/地址输入框仍显示已保存值（不被清空）', () => {
    render(<AiSettingsTab initial={configuredView} onViewChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('temperature（0-2）'), { target: { value: '0.5' } })
    expect((screen.getByLabelText('模型名称') as HTMLInputElement).value).toBe('deepseek-chat')
    expect((screen.getByLabelText('接口地址（baseUrl）') as HTMLInputElement).value).toBe(
      'https://api.deepseek.com',
    )
  })
})

describe('AiSettingsTab - dirty 上报（缺陷10）', () => {
  it('编辑表单后 aiSettingsDirty=true，保存成功后回到 false', async () => {
    vi.spyOn(aiClient.config, 'set').mockResolvedValue(configuredView)
    render(<AiSettingsTab initial={configuredView} onViewChange={vi.fn()} />)

    expect(getUIState().aiSettingsDirty).toBe(false)
    fireEvent.change(screen.getByLabelText('temperature（0-2）'), { target: { value: '0.8' } })
    expect(getUIState().aiSettingsDirty).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await waitFor(() => expect(getUIState().aiSettingsDirty).toBe(false))
  })

  it('仅输入 API Key（未保存）也置 dirty', () => {
    render(<AiSettingsTab initial={configuredView} onViewChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-new-key' } })
    expect(getUIState().aiSettingsDirty).toBe(true)
  })

  /*
   * P0-1：这条断言原先锁的是**缺陷行为**。页签切换是条件渲染，切走即卸载 ——
   * 卸载就把 dirty 清成 false，等于草稿已经被丢掉、关闭守卫却同时失效，
   * 用户再也收不到"有未保存的 AI 配置"提示。
   * 正确契约：组件卸载**不**清 dirty；清理点在设置面板真正关闭时
   * （SettingsPanel 单测里覆盖）。
   */
  it('组件卸载时不复位 dirty（切页签卸载不能顺手关掉关闭守卫）', () => {
    const { unmount } = render(<AiSettingsTab initial={configuredView} onViewChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('temperature（0-2）'), { target: { value: '0.8' } })
    expect(getUIState().aiSettingsDirty).toBe(true)
    unmount()
    expect(getUIState().aiSettingsDirty).toBe(true)
  })
})

describe('AiSettingsTab - 清除密钥走 danger 确认（缺陷10）', () => {
  it('点「清除密钥」先弹 danger 确认，确认后才真正清除', async () => {
    const setSpy = vi.spyOn(aiClient.config, 'set').mockResolvedValue({ ...configuredView, hasKey: false, configured: false })
    render(<AiSettingsTab initial={configuredView} onViewChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '清除密钥' }))
    // 未确认前不得发起清除请求
    expect(setSpy).not.toHaveBeenCalled()
    expect(confirmMock).toHaveBeenCalledTimes(1)
    const cfg = confirmMock.mock.calls[0][0]
    expect(cfg.variant).toBe('danger')

    cfg.onConfirm()
    await waitFor(() => expect(setSpy).toHaveBeenCalledWith({ apiKey: '' }))
  })
})
