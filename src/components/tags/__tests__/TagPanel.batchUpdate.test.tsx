import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import TagPanel from '@/components/tags/TagPanel'
import { useNotesStore } from '@/store'
import { subscribeToast, type ToastMessage } from '@/services/toast'
import type { Tag } from '@/types'

/**
 * 批量修改标签：旧实现随机取色取图标 —— 结果无法预期、无法复现，撤销也无从谈起。
 * 现在统一成「列表里第一个选中标签」的样式，并给可撤销 toast 兜底；
 * 一次影响 N 个标签，入口必须先落「修改中…」再执行（防连点）。
 */

const mkTag = (id: string, name: string, color: string, icon: string): Tag => ({
  id,
  name,
  color,
  icon,
  parentId: null,
  usageCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const workTag = mkTag('t-a', '工作', '#ff0000', '🚀')
const lifeTag = mkTag('t-b', '生活', '#0000ff', '📚')

beforeEach(() => {
  localStorage.clear()
  useNotesStore.setState({
    tags: [workTag, lifeTag],
    notebooks: [],
    activeNotebookId: '',
    activeDocId: '',
  })
})

describe('TagPanel 批量修改（去随机 + 忙态 + 可撤销）', () => {
  it('进入「修改中…」再执行：样式统一为锚点标签（非随机），并给出可撤销回执', async () => {
    const seen: ToastMessage[] = []
    const off = subscribeToast((m) => {
      seen.push(m)
      return 'test-' + seen.length
    })

    render(<TagPanel isOpen embedded />)
    // 选中两行（点行内文本即可冒泡到整行的选中切换）
    fireEvent.click(screen.getByText('工作'))
    fireEvent.click(screen.getByText('生活'))

    const btn = screen.getByRole('button', { name: '批量修改' })
    fireEvent.click(btn)
    // 忙态先落地：disabled + 文案切换（同步写 store 的话这里来不及看到）
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    expect(btn.textContent).toBe('修改中…')

    // 让出的那一拍事件循环在 act 内落地（否则 store/组件更新发生在 act 之外）
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    // 结果确定：统一成锚点（列表顺序里第一个选中标签＝工作）的样式，而不是随机值
    const tagsAfter = useNotesStore.getState().tags
    expect(tagsAfter.find((t) => t.id === 't-a')).toMatchObject({ color: '#ff0000', icon: '🚀' })
    expect(tagsAfter.find((t) => t.id === 't-b')).toMatchObject({ color: '#ff0000', icon: '🚀' })

    const undoMsg = seen.find((m) => m.action?.label === '撤销')
    expect(undoMsg).toBeTruthy()
    expect(undoMsg?.message).toBe('已将 2 个标签统一为该颜色与图标')

    // 撤销：逐个还原改之前的颜色与图标（toast 按钮的 onClick 是普通调用，须包 act）
    act(() => { undoMsg!.action!.onClick() })
    const tagsReverted = useNotesStore.getState().tags
    expect(tagsReverted.find((t) => t.id === 't-a')).toMatchObject({ color: '#ff0000', icon: '🚀' })
    expect(tagsReverted.find((t) => t.id === 't-b')).toMatchObject({ color: '#0000ff', icon: '📚' })
    off()
  }, 10000)

  it('没选中标签时不出现批量修改入口（空入口不渲染）', () => {
    render(<TagPanel isOpen embedded />)
    expect(screen.queryByRole('button', { name: '批量修改' })).toBeNull()
  })
})
