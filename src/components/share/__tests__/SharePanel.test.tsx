import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ShareLink } from '@/types'
import { toast } from '@/services/toast'

vi.mock('@/hooks/useConfirmAction', () => ({ confirmAction: vi.fn() }))
vi.mock('@/services/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/storage')>()
  return { ...actual, exportHtmlDoc: vi.fn(async () => true) }
})

import SharePanel from '@/components/share/SharePanel'
import { confirmAction } from '@/hooks/useConfirmAction'
const mockedConfirm = confirmAction as unknown as ReturnType<typeof vi.fn>

const link: ShareLink = {
  id: 'l1',
  docId: 'd1',
  notebookId: 'n1',
  url: 'notes://share/l1',
  permission: 'view',
  password: null,
  expiresAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  accessCount: 0,
  lastAccessedAt: null,
}

const baseProps = {
  isOpen: true,
  onClose: () => {},
  docTitle: '文档',
  docId: 'd1',
  notebookId: 'n1',
  shareLinks: [] as ShareLink[],
  onGenerateLink: vi.fn(),
  onDeleteLink: vi.fn(),
  onCopyLink: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SharePanel 密码保护（缺陷 11）', () => {
  it('勾选密码保护但未填写：按无密码生成并提示，不落库空白密码', () => {
    const warnSpy = vi.spyOn(toast, 'warning').mockImplementation(() => '')
    const onGenerateLink = vi.fn()
    render(<SharePanel {...baseProps} onGenerateLink={onGenerateLink} />)

    fireEvent.click(screen.getByLabelText('设置密码保护'))
    fireEvent.click(screen.getByRole('button', { name: '生成链接' }))

    expect(onGenerateLink).toHaveBeenCalledWith('view', '', null)
    expect(warnSpy).toHaveBeenCalledWith('未填写密码，已按无密码保护生成链接')
    warnSpy.mockRestore()
  })

  it('填写的密码原样传递（不再被空格占位污染）', () => {
    const onGenerateLink = vi.fn()
    render(<SharePanel {...baseProps} onGenerateLink={onGenerateLink} />)

    fireEvent.click(screen.getByLabelText('设置密码保护'))
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: '生成链接' }))

    expect(onGenerateLink).toHaveBeenCalledWith('view', 'secret', null)
  })

  it('未勾选密码保护时不渲染密码输入框', () => {
    render(<SharePanel {...baseProps} />)
    expect(screen.queryByPlaceholderText('请输入密码')).toBeNull()
  })
})

describe('SharePanel 删除链接确认（缺陷 11）', () => {
  it('删除先弹 danger 确认，确认后才真正删除', () => {
    const onDeleteLink = vi.fn()
    render(<SharePanel {...baseProps} shareLinks={[link]} onDeleteLink={onDeleteLink} />)

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onDeleteLink).not.toHaveBeenCalled()
    expect(mockedConfirm).toHaveBeenCalledTimes(1)
    const config = mockedConfirm.mock.calls[0][0] as { variant: string; onConfirm: () => void }
    expect(config.variant).toBe('danger')
    config.onConfirm()
    expect(onDeleteLink).toHaveBeenCalledWith('l1')
  })
})

describe('SharePanel 弹窗语义（缺陷 13）', () => {
  it('role=dialog + aria-modal + 可访问名', () => {
    render(<SharePanel {...baseProps} />)
    const dialog = screen.getByRole('dialog', { name: '分享文档' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })
})
describe('SharePanel 权限选项图标（组件图标契约：icon 不用 emoji）', () => {
  it('选项按「查看/评论/编辑/管理」排序，图标是 <IconXxx /> 节点而非 emoji 字符', () => {
    render(<SharePanel {...baseProps} />)
    const options = Array.from(document.querySelectorAll('.permission-option'))
    expect(options.map((o) => o.textContent)).toEqual(['查看', '评论', '编辑', '管理'])
    expect(options.every((o) => o.querySelector('svg'))).toBe(true)
    // emoji 是文本节点，SVG 图标则没有文本内容
    expect(document.querySelector('.permission-icon')?.textContent).toBe('')
  })
})
