import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

import ShortcutsTab from '@/components/settings/ShortcutsTab'
import ConfirmDialog from '@/components/dialogs/ConfirmDialog'
import { useNotesStore } from '@/store'
import { useConfirmAction } from '@/hooks/useConfirmAction'

/**
 * 快捷键自定义（UI 审计缺陷 8：能力早就在 keyboardSlice 里，但设置页只有只读列表）。
 *
 * 锁住四条契约：
 * 1. 录制的新组合写入 store 并持久化（capture 拦截，不触发全局快捷键）；
 * 2. 与其它动作冲突时拒绝并提示，不静默覆盖；
 * 3. 固定键位（find/replace/行编辑类，编辑器硬编码分支）不提供录制入口 ——
 *    否则就是新造「能改但无效」的死设置；
 * 4. 单项恢复 / 全部恢复默认（后者需确认）。
 */

/** App 层确认框宿主的最小替身（confirmAction 是模块级单例） */
function ConfirmHost(): React.JSX.Element | null {
  const { confirmConfig, handleConfirm, handleCancel } = useConfirmAction()
  if (!confirmConfig) return null
  return (
    <ConfirmDialog
      title={confirmConfig.title}
      message={confirmConfig.message}
      confirmText={confirmConfig.confirmText}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )
}

beforeEach(() => {
  localStorage.clear()
  useNotesStore.getState().resetShortcuts()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ShortcutsTab - 录制自定义键位', () => {
  it('点「录制」后按下新组合：写入 store 并持久化到 localStorage', () => {
    render(<ShortcutsTab />)
    fireEvent.click(screen.getByRole('button', { name: '录制「打开搜索」的快捷键' }))
    expect(screen.getByRole('status')).toHaveTextContent('请按下新组合键')

    // 从 document.body 派发：capture 监听在 window 上，走真实传播路径
    act(() => {
      fireEvent.keyDown(document.body, { key: 'j', ctrlKey: true, altKey: true })
    })

    const search = useNotesStore.getState().shortcuts.find(s => s.id === 'search')
    expect(search?.keys).toEqual(['ctrl', 'alt', 'j'])
    expect(useNotesStore.getState().customShortcuts.search).toEqual(['ctrl', 'alt', 'j'])
    const persisted = JSON.parse(localStorage.getItem('notes-custom-shortcuts') ?? '{}') as Record<string, string[]>
    expect(persisted.search).toEqual(['ctrl', 'alt', 'j'])
    // 录制态结束，出现「已自定义」徽标与「恢复」按钮
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('已自定义')).toBeInTheDocument()
  })

  it('录制期间按键被 capture 拦截：全局 bubble 监听收不到（不会误开搜索面板）', () => {
    const globalListener = vi.fn()
    window.addEventListener('keydown', globalListener)
    try {
      render(<ShortcutsTab />)
      fireEvent.click(screen.getByRole('button', { name: '录制「保存」的快捷键' }))
      act(() => {
        fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
      })
      expect(globalListener).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', globalListener)
    }
  })

  it('冲突组合被拒绝：提示占用者，不写入 store', () => {
    render(<ShortcutsTab />)
    fireEvent.click(screen.getByRole('button', { name: '录制「打开搜索」的快捷键' }))
    // Ctrl+S 已被「保存」占用
    act(() => {
      fireEvent.keyDown(document.body, { key: 's', ctrlKey: true })
    })
    expect(screen.getByRole('alert')).toHaveTextContent('保存')
    expect(useNotesStore.getState().customShortcuts.search).toBeUndefined()
    // 仍在录制态：换一个组合即可成功
    act(() => {
      fireEvent.keyDown(document.body, { key: 'j', ctrlKey: true, altKey: true })
    })
    expect(useNotesStore.getState().customShortcuts.search).toEqual(['ctrl', 'alt', 'j'])
  })

  it('Esc 取消录制：不改键位、不关面板', () => {
    render(<ShortcutsTab />)
    fireEvent.click(screen.getByRole('button', { name: '录制「打开搜索」的快捷键' }))
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' })
    })
    expect(useNotesStore.getState().customShortcuts.search).toBeUndefined()
    expect(screen.queryByRole('status')).toBeNull()
    // 列表仍在（面板没被关掉）
    expect(screen.getByText('打开搜索')).toBeInTheDocument()
  })

  it('只按修饰键不结束录制（等待主键）', () => {
    render(<ShortcutsTab />)
    fireEvent.click(screen.getByRole('button', { name: '录制「打开搜索」的快捷键' }))
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Control', ctrlKey: true })
    })
    expect(screen.getByRole('status')).toHaveTextContent('请按下新组合键')
    expect(useNotesStore.getState().customShortcuts.search).toBeUndefined()
  })
})

describe('ShortcutsTab - 固定键位与恢复', () => {
  it('固定键位（查找/替换/行编辑类）显示「固定」且没有录制按钮', () => {
    render(<ShortcutsTab />)
    expect(screen.queryByRole('button', { name: '录制「文档内查找」的快捷键' })).toBeNull()
    expect(screen.queryByRole('button', { name: '录制「复制当前行」的快捷键' })).toBeNull()
    expect(screen.getAllByText('固定').length).toBeGreaterThanOrEqual(6)
  })

  it('单项恢复：清掉该项自定义，其它项不受影响', () => {
    const st = useNotesStore.getState()
    st.updateShortcut('search', ['ctrl', 'alt', 'j'])
    st.updateShortcut('save', ['ctrl', 'alt', 's'])

    render(<ShortcutsTab />)
    fireEvent.click(screen.getByRole('button', { name: '恢复「打开搜索」的默认快捷键' }))

    const state = useNotesStore.getState()
    expect(state.customShortcuts.search).toBeUndefined()
    expect(state.shortcuts.find(s => s.id === 'search')?.keys).toEqual(['Ctrl', 'K'])
    expect(state.customShortcuts.save).toEqual(['ctrl', 'alt', 's'])
  })

  it('全部恢复默认：无自定义时禁用；有自定义时先确认再清空', () => {
    render(
      <>
        <ShortcutsTab />
        <ConfirmHost />
      </>,
    )
    const resetAll = screen.getByRole('button', { name: '全部恢复默认' })
    expect(resetAll).toBeDisabled()

    act(() => {
      useNotesStore.getState().updateShortcut('search', ['ctrl', 'alt', 'j'])
    })
    expect(resetAll).not.toBeDisabled()

    fireEvent.click(resetAll)
    // 未确认前不清空
    expect(useNotesStore.getState().customShortcuts.search).toEqual(['ctrl', 'alt', 'j'])
    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }))
    expect(useNotesStore.getState().customShortcuts).toEqual({})
  })
})