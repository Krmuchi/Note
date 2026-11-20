import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { SidebarFooter } from '@/components/layout/SidebarFooter'

/**
 * 「更多」菜单的键盘语义与可访问性（对齐 ContextMenu 的既有实现）。
 *
 * 旧实现是自绘 div 菜单：无 Esc/方向键、无 role=menu/menuitem、打开后焦点
 * 不进菜单 —— 键盘用户完全用不了。这里把菜单语义当门禁钉住。
 */

vi.mock('@/services/storage', () => ({
  isWebMode: false,
  exportAllData: vi.fn(async () => true),
  importFiles: vi.fn(async () => ({ ok: false, canceled: true })),
  importMarkdownDocs: vi.fn(async () => []),
  importBackupData: vi.fn(async () => null),
  getAppInfo: vi.fn(async () => ({
    ok: true,
    info: { version: '0.1.0', dataPath: 'C:/u/notes-data.json', dataDir: 'C:/u', backupDir: 'C:/u/backups' },
  })),
  listLocalBackups: vi.fn(async () => ({ ok: true, backups: [] })),
  openDataDir: vi.fn(async () => ({ ok: true })),
  restoreLocalBackup: vi.fn(async () => ({ ok: true })),
  onBackupCreated: vi.fn(() => () => {}),
}))

const renderFooter = (
  overrides: Partial<ComponentProps<typeof SidebarFooter>> = {},
): ReturnType<typeof render> & { props: ComponentProps<typeof SidebarFooter> } => {
  const props = {
    activeView: 'notebooks' as const,
    onViewChange: vi.fn(),
    trash: [],
    onOpenSettings: vi.fn(),
    onOpenHelp: vi.fn(),
    collapsed: false,
    onShowTooltip: vi.fn(),
    onHideTooltip: vi.fn(),
    ...overrides,
  }
  const view = render(<SidebarFooter {...props} />)
  return { ...view, props }
}

const openMenu = (): HTMLElement => {
  fireEvent.click(screen.getByRole('button', { name: /更多/ }))
  return screen.getByRole('menu', { name: '更多' })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('「更多」菜单：菜单语义', () => {
  it('触发按钮有 aria-haspopup=menu 与 aria-expanded 开合状态', () => {
    renderFooter()
    const trigger = screen.getByRole('button', { name: /更多/ })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('menu', { name: '更多' })).toBeTruthy()
  })

  it('所有菜单项都是 role=menuitem，菜单项与功能保持不变', () => {
    renderFooter()
    openMenu()
    const items = screen.getAllByRole('menuitem')
    const names = items.map((el) => el.textContent)
    expect(items).toHaveLength(9)
    for (const label of ['回收站', '导入 Markdown 文件', '导入文件夹', '导入 ZIP 包', '导出全部', '导入备份文件', '从备份恢复', '设置', '帮助中心']) {
      expect(names.some((n) => n?.includes(label))).toBe(true)
    }
  })

  it('打开后焦点落在第一个菜单项（键盘立即可用）', () => {
    renderFooter()
    openMenu()
    const items = screen.getAllByRole('menuitem')
    expect(document.activeElement).toBe(items[0])
  })
})

describe('「更多」菜单：键盘行为', () => {
  it('上下方向键在菜单项之间循环移动焦点，Home/End 跳首尾', () => {
    renderFooter()
    openMenu()
    const items = screen.getAllByRole('menuitem')

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[0])
    // 循环：首项再往上跳到末项
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[items.length - 1])
    // 循环：末项再往下跳回首项
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[0])

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'End' })
    expect(document.activeElement).toBe(items[items.length - 1])
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' })
    expect(document.activeElement).toBe(items[0])
  })

  it('Esc 关闭菜单并把焦点还给触发按钮', () => {
    renderFooter()
    openMenu()
    const trigger = screen.getByRole('button', { name: /更多/ })

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('Esc 阻断冒泡：不走全局 Escape 链去关背后的面板', () => {
    renderFooter()
    openMenu()
    const globalSpy = vi.fn()
    window.addEventListener('keydown', globalSpy)

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })

    expect(globalSpy).not.toHaveBeenCalled()
    window.removeEventListener('keydown', globalSpy)
  })

  it('Tab 关闭菜单且不抢焦点（放行给下一个元素）', () => {
    renderFooter()
    openMenu()
    const trigger = screen.getByRole('button', { name: /更多/ })

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).not.toBe(trigger)
  })
})

describe('「更多」菜单：选中与外部点击', () => {
  it('选中「设置」：调用回调、关闭菜单、焦点回到触发按钮', () => {
    const { props } = renderFooter()
    openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: /设置/ }))
    expect(props.onOpenSettings).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /更多/ }))
  })

  it('选中「回收站」：切视图并关闭菜单', () => {
    const { props } = renderFooter()
    openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: /回收站/ }))
    expect(props.onViewChange).toHaveBeenCalledWith('trash')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('选中「帮助中心」：调用回调并关闭菜单', () => {
    const { props } = renderFooter()
    openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: /帮助中心/ }))
    expect(props.onOpenHelp).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('点击菜单外部：关闭菜单（原有行为不回归）', () => {
    renderFooter()
    openMenu()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
