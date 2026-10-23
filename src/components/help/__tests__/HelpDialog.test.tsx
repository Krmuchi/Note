import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/services/storage', () => ({
  getAppInfo: vi.fn(async () => ({
    ok: true,
    info: { version: '0.1.0', dataPath: 'C:/u/notes-data.json', dataDir: 'C:/u', backupDir: 'C:/u/backups' },
  })),
  openDataDir: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: vi.fn(async () => true),
}))

import HelpDialog from '@/components/help/HelpDialog'
import { openDataDir } from '@/services/storage'
import { copyToClipboard } from '@/utils/clipboard'
import { subscribeOnboardingRequest } from '@/utils/onboarding'

const mockedOpenDir = openDataDir as unknown as ReturnType<typeof vi.fn>
const mockedCopy = copyToClipboard as unknown as ReturnType<typeof vi.fn>

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

  it('复制诊断信息包含版本与错误日志摘要', async () => {
    localStorage.setItem(
      'error-logs',
      JSON.stringify([{ timestamp: '2026-10-01T00:00:00.000Z', message: '测试错误', source: 'render' }]),
    )
    render(<HelpDialog isOpen onClose={vi.fn()} onOpenShortcuts={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '复制诊断信息' }))

    await waitFor(() => expect(mockedCopy).toHaveBeenCalled())
    const text = mockedCopy.mock.calls[0][0] as string
    expect(text).toContain('笔记 · 诊断信息')
    expect(text).toContain('测试错误')
  })

  it('未打开时不渲染', () => {
    const { container } = render(<HelpDialog isOpen={false} onClose={vi.fn()} onOpenShortcuts={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
