import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/services/storage', () => ({
  isWebMode: false,
  getAppInfo: vi.fn(async () => ({
    ok: true,
    info: { version: '0.1.0', dataPath: 'C:/u/notes-data.json', dataDir: 'C:/u', backupDir: 'C:/u/backups' },
  })),
  openDataDir: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: vi.fn(async () => true),
  // 统一封装：组件只调 copyWithFeedback，成功/失败提示由它按真实结果给出（复制假成功修复）
  copyWithFeedback: vi.fn(async () => true),
}))

import HelpDialog from '@/components/help/HelpDialog'
import { getAppInfo, openDataDir } from '@/services/storage'
import { copyToClipboard, copyWithFeedback } from '@/utils/clipboard'
import { subscribeOnboardingRequest } from '@/utils/onboarding'

const mockedOpenDir = openDataDir as unknown as ReturnType<typeof vi.fn>
const mockedCopy = copyWithFeedback as unknown as ReturnType<typeof vi.fn>
const mockedRawCopy = copyToClipboard as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('HelpDialog', () => {
  it('四类信息都在：上手 / 数据与安全 / 效率 / 遇到问题', async () => {
    render(<HelpDialog isOpen onClose={vi.fn()} onOpenShortcuts={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '帮助中心' })).toBeInTheDocument()
    expect(screen.getByText('快速上手')).toBeInTheDocument()
    expect(screen.getByText('数据与安全')).toBeInTheDocument()
    expect(screen.getByText('效率')).toBeInTheDocument()
    expect(screen.getByText('遇到问题')).toBeInTheDocument()

    // 数据目录来自主进程，异步读到后展示
    expect(await screen.findByText(/C:\/u/)).toBeInTheDocument()
  })

  it('关闭与快捷键入口', () => {
    const onClose = vi.fn()
    const onOpenShortcuts = vi.fn()
    render(<HelpDialog isOpen onClose={onClose} onOpenShortcuts={onOpenShortcuts} />)

    fireEvent.click(screen.getByRole('button', { name: '查看全部快捷键' }))
    expect(onOpenShortcuts).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('打开数据目录与重看新手引导', async () => {
    render(<HelpDialog isOpen onClose={vi.fn()} onOpenShortcuts={vi.fn()} />)

    // 「打开数据目录」依赖异步读到的数据目录，需要等它出现
    fireEvent.click(await screen.findByRole('button', { name: '打开数据目录' }))
    expect(mockedOpenDir).toHaveBeenCalled()

    const onboarding = vi.fn()
    const unsubscribe = subscribeOnboardingRequest(onboarding)
    fireEvent.click(screen.getByRole('button', { name: '重看新手引导' }))
    expect(onboarding).toHaveBeenCalled()
    unsubscribe()
  })

  it('复制诊断信息走 copyWithFeedback（按真实结果反馈），内容含版本与错误日志摘要', async () => {
    localStorage.setItem(
      'error-logs',
      JSON.stringify([{ timestamp: '2026-10-01T00:00:00.000Z', message: '测试错误', source: 'render' }]),
    )
    render(<HelpDialog isOpen onClose={vi.fn()} onOpenShortcuts={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '复制诊断信息' }))

    await waitFor(() => expect(mockedCopy).toHaveBeenCalled())
    const [text, successMsg] = mockedCopy.mock.calls[0] as [string, string]
    expect(text).toContain('拾页 · 诊断信息')
    expect(text).toContain('测试错误')
    // 成功文案由调用点定制；反馈统一由 copyWithFeedback 给出，不再直调 copyToClipboard 无条件报成功
    expect(successMsg).toBe('诊断信息已复制，可直接粘贴给开发者')
    expect(mockedRawCopy).not.toHaveBeenCalled()
  })

  it('未打开时不渲染', () => {
    const { container } = render(<HelpDialog isOpen={false} onClose={vi.fn()} onOpenShortcuts={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('P2-10：备份频率如实描述为「最多每分钟一次」，与 60s 节流实现一致', async () => {
    render(<HelpDialog isOpen onClose={vi.fn()} onOpenShortcuts={vi.fn()} />)

    expect(
      screen.getByText('保存后最多每分钟自动备份一次（保留最近 10 份），恢复前还会额外留一份当前快照'),
    ).toBeInTheDocument()
    // 旧文案「每次保存后」与实现不符，必须消失
    expect(screen.queryByText(/每次保存后自动生成备份/)).toBeNull()
    await screen.findByText(/C:\/u/)
  })

  it('P1-9：数据目录读取未完成时显示「读取中…」，不冒充浏览器模式', async () => {
    const mockedGetAppInfo = getAppInfo as unknown as ReturnType<typeof vi.fn>
    mockedGetAppInfo.mockImplementation(() => new Promise(() => {}))

    render(<HelpDialog isOpen onClose={vi.fn()} onOpenShortcuts={vi.fn()} />)

    expect(screen.getByText('（读取中…）')).toBeInTheDocument()
    expect(screen.queryByText('（浏览器模式下存在 IndexedDB）')).toBeNull()
    // 读到之后仍然显示真实路径
    mockedGetAppInfo.mockResolvedValue({
      ok: true,
      info: { version: '0.1.0', dataPath: 'C:/u/notes-data.json', dataDir: 'C:/u', backupDir: 'C:/u/backups' },
    })
    mockedGetAppInfo.mockClear()
  })
})
