import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContextMenu } from '@/components/common/ContextMenu'
import type { ContextMenuItem } from '@/components/common/ContextMenu'

/**
 * 共享 ContextMenu（右键菜单 / 下拉）可访问性契约。
 * 此前 4 处内联菜单没有 Esc、方向键、role 与焦点管理，键盘用户完全无法操作；
 * 这些断言防止回归到"只能鼠标点"的状态。
 */

interface HarnessProps {
  items?: ContextMenuItem[]
  x?: number
  y?: number
}

function Harness({ items, x = 50, y = 50 }: HarnessProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const menuItems: ContextMenuItem[] = items ?? [
    { id: 'a', label: '第一项', onSelect: vi.fn() },
    { id: 'b', label: '禁用项', disabled: true, onSelect: vi.fn() },
    { id: 'c', label: '第三项', onSelect: vi.fn() },
  ]
  return (
    <div>
      <button onClick={() => setOpen(true)}>打开菜单</button>
      {open && (
        <ContextMenu x={x} y={y} ariaLabel="测试菜单" items={menuItems} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}

/**
 * 挂载 Harness 并打开菜单。
 * 必须先 render 再点按钮：此前 helper 直接 fireEvent + getByText，
 * 组件树根本没挂载，5 个用例全部因 "Unable to find element" 失败。
 */
const openMenu = (): HTMLElement => {
  render(<Harness />)
  fireEvent.click(screen.getByText('打开菜单'))
  return screen.getByRole('menu', { name: '测试菜单' })
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('ContextMenu 语义', () => {
  it('容器 role=menu 且有可访问名，菜单项 role=menuitem', () => {
    openMenu()
    expect(screen.getByRole('menuitem', { name: '第一项' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '第三项' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '禁用项' })).toBeDisabled()
  })

  it('打开时聚焦首个非禁用项', () => {
    openMenu()
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '第一项' }))
  })
})

describe('ContextMenu 键盘操作', () => {
  it('方向键在可选项间循环并跳过禁用项，Home/End 到两端', () => {
    const menu = openMenu()
    const first = screen.getByRole('menuitem', { name: '第一项' })
    const third = screen.getByRole('menuitem', { name: '第三项' })

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(third)

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(third)

    fireEvent.keyDown(menu, { key: 'Home' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(menu, { key: 'End' })
    expect(document.activeElement).toBe(third)
  })

  it('Esc 关闭菜单并把焦点还给打开前的元素', () => {
    render(<Harness />)
    const trigger = screen.getByText('打开菜单')
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('menu', { name: '测试菜单' })).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('menu', { name: '测试菜单' }), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('ContextMenu 鼠标操作', () => {
  it('选中菜单项：触发 onSelect 并关闭', () => {
    const onSelect = vi.fn()
    render(<Harness items={[{ id: 'x', label: '执行项', onSelect }]} />)
    fireEvent.click(screen.getByText('打开菜单'))
    fireEvent.click(screen.getByRole('menuitem', { name: '执行项' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('禁用项点击不触发 onSelect，菜单保持打开', () => {
    const onSelect = vi.fn()
    render(
      <Harness
        items={[
          { id: 'x', label: '执行项', onSelect },
          { id: 'y', label: '禁用项', disabled: true, onSelect },
        ]}
      />,
    )
    fireEvent.click(screen.getByText('打开菜单'))
    fireEvent.click(screen.getByRole('menuitem', { name: '禁用项' }))
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('menu', { name: '测试菜单' })).toBeTruthy()
  })

  it('外部点击关闭菜单', () => {
    openMenu()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('ContextMenu 边界钳制', () => {
  it('坐标超出视口时整体收回可视区', () => {
    render(<Harness x={99999} y={99999} />)
    fireEvent.click(screen.getByText('打开菜单'))
    const menu = screen.getByRole('menu', { name: '测试菜单' })
    const left = parseFloat(menu.style.left)
    const top = parseFloat(menu.style.top)
    expect(left).toBeLessThanOrEqual(window.innerWidth)
    expect(top).toBeLessThanOrEqual(window.innerHeight)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(top).toBeGreaterThanOrEqual(0)
  })
})
