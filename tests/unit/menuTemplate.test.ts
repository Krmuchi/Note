import { describe, it, expect, vi } from 'vitest'
import {
  buildAppMenuTemplate,
  buildTrayMenuTemplate,
  WINDOW_CLOSE_ACCELERATOR,
} from '../../electron/menu-template.cjs'

type MenuItem = {
  label?: string
  role?: string
  accelerator?: string
  type?: string
  submenu?: MenuItem[]
  click?: () => void
}

const labels = (items: MenuItem[]): string[] =>
  items.map((item) => item.label ?? '')

/**
 * 菜单模板（P1：Ctrl+W 让位 / 托盘快速打开）。
 * 模板此前内联在 main.cjs 的 whenReady 里，谁也测不到 —— 抽成纯模块就是为了锁这两条。
 */
describe('应用菜单模板', () => {
  it('窗口 → 关闭 显式用 Ctrl+Shift+W，把 Ctrl+W 让给标签栏', () => {
    const win = buildAppMenuTemplate().find((menu: MenuItem) => menu.label === '窗口')
    const close = win?.submenu?.find((item: MenuItem) => item.role === 'close')

    expect(close, '窗口菜单里的关闭项').toBeTruthy()
    expect(close?.accelerator).toBe('CmdOrCtrl+Shift+W')
    expect(WINDOW_CLOSE_ACCELERATOR).toBe('CmdOrCtrl+Shift+W')
  })

  it('视图菜单保留缩放三件套（设置页缩放提示仍指向这里）', () => {
    const view = buildAppMenuTemplate().find((menu: MenuItem) => menu.label === '视图')
    const roles = (view?.submenu ?? []).map((item: MenuItem) => item.role)

    expect(roles).toContain('zoomIn')
    expect(roles).toContain('zoomOut')
    expect(roles).toContain('resetZoom')
  })

  it('帮助 → 关于 调用主进程注入的回调', () => {
    const onAbout = vi.fn()
    const help = buildAppMenuTemplate({ onAbout }).find((menu: MenuItem) => menu.label === '帮助')
    const about = help?.submenu?.find((item: MenuItem) => item.label === '关于')

    expect(about?.click).toBeTypeOf('function')
    about?.click?.()
    expect(onAbout).toHaveBeenCalledTimes(1)
  })

  it('菜单文案全为中文，没有英文残留', () => {
    const allLabels: string[] = []
    for (const menu of buildAppMenuTemplate()) {
      if (menu.label) allLabels.push(menu.label)
      for (const item of menu.submenu ?? []) {
        if (item.label) allLabels.push(item.label)
      }
    }

    expect(allLabels.length).toBeGreaterThan(15)
    expect(allLabels.filter((label) => /[A-Za-z]/.test(label))).toEqual([])
  })
})

describe('托盘菜单模板', () => {
  it('「快速打开…」触发注入的动作（App 侧订阅 app:action quickOpen）', () => {
    const onQuickOpen = vi.fn()
    const items = buildTrayMenuTemplate({ onQuickOpen })
    const quickOpen = items.find((item: MenuItem) => item.label === '快速打开…')

    expect(quickOpen, '托盘必须有快速打开入口（此前只有 Ctrl+P）').toBeTruthy()
    quickOpen?.click?.()
    expect(onQuickOpen).toHaveBeenCalledTimes(1)
  })

  it('五个入口齐全且顺序稳定', () => {
    const items = buildTrayMenuTemplate()
    expect(labels(items)).toEqual(['打开笔记', '新建便签', '快速打开…', '', '打开数据目录', '', '退出'])
  })

  it('没注入回调时点击不抛错', () => {
    for (const item of buildTrayMenuTemplate()) {
      expect(() => item.click?.()).not.toThrow()
    }
  })
})
