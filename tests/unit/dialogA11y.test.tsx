import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/services/storage', () => ({
  getAppInfo: vi.fn(async () => ({
    ok: true,
    info: { version: '0.1.0', dataPath: 'C:/u/notes-data.json', dataDir: 'C:/u', backupDir: 'C:/u/backups' },
  })),
  openDataDir: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/utils/clipboard', () => ({ copyToClipboard: vi.fn(async () => true) }))

import ConfirmDialog from '@/components/dialogs/ConfirmDialog'
import LinkDialog from '@/components/dialogs/LinkDialog'
import HelpDialog from '@/components/help/HelpDialog'

/**
 * 弹窗无障碍契约（A2 / A8）。
 *
 * 这类断言放在单测里当门禁：弹窗是"必须能用键盘走完"的界面，
 * 一度出现过 Tab 跑到背后页面、关闭后焦点丢失的问题。
 */

const focusableIn = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'))

const dialogBox = (): HTMLElement => document.querySelector('.confirm-dialog, .help-dialog') as HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('弹窗语义', () => {
  it('ConfirmDialog：role=dialog + aria-modal + 可访问名', () => {
    render(
      <ConfirmDialog
        title="确认删除"
        message="删除后不可恢复"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: '确认删除' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('LinkDialog：字段有 label，按钮可访问名正确', () => {
    render(<LinkDialog initialText="文字" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: '插入链接' })).toBeTruthy()
    expect(screen.getByLabelText('文本')).toBeTruthy()
    expect(screen.getByLabelText('地址')).toBeTruthy()
    expect(screen.getByRole('button', { name: '插入' })).toBeDisabled()
  })

  it('HelpDialog：role=dialog + aria-modal', () => {
    render(<HelpDialog isOpen onClose={vi.fn()} onOpenShortcuts={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: '帮助中心' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })
})

describe('焦点陷阱', () => {
  it('Tab 在弹窗内循环：最后一个 → 第一个，Shift+Tab 反向', () => {
    render(
      <ConfirmDialog
        title="确认操作"
        message="内容"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const box = dialogBox()
    const items = focusableIn(box)
    expect(items.length).toBeGreaterThanOrEqual(2)

    const first = items[0]
    const last = items[items.length - 1]

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    first.focus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('LinkDialog 同样把 Tab 限制在弹窗内', () => {
    render(<LinkDialog initialText="文字" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    const box = dialogBox()
    const items = focusableIn(box)
    const first = items[0]
    const last = items[items.length - 1]

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })
})

describe('焦点归还', () => {
  it('弹窗卸载后焦点回到打开它的元素', () => {
    const trigger = document.createElement('button')
    trigger.textContent = '打开弹窗'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { unmount } = render(
      <ConfirmDialog title="确认" message="内容" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    unmount()

    expect(document.activeElement).toBe(trigger)
  })
})
