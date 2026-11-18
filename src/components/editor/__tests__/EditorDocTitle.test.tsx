import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditorDocTitle } from '@/components/editor/EditorDocTitle'
import type { NoteDoc } from '@/types'

/**
 * P2-12：标题的 800ms 防抖提交。
 *
 * 旧实现只在 Enter / blur 写 store —— 改完标题不点别处就退出时，
 * 标题只停在 DOM 里，而草稿与自动保存读的都是 store（标题回退成旧值）。
 */

const doc = (title: string): NoteDoc => ({
  id: 'd1',
  title,
  content: '',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const titleEl = (): HTMLElement => screen.getByLabelText('文档标题')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('EditorDocTitle 防抖提交（P2-12）', () => {
  it('输入后不立即写 store，800ms 停顿后才提交一次', () => {
    const updateDocContent = vi.fn()
    render(<EditorDocTitle activeDoc={doc('原标题')} updateDocContent={updateDocContent} />)

    const el = titleEl()
    el.textContent = '改过的标题'
    fireEvent.input(el)
    expect(updateDocContent).not.toHaveBeenCalled()

    vi.advanceTimersByTime(799)
    expect(updateDocContent).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(updateDocContent).toHaveBeenCalledTimes(1)
    expect(updateDocContent).toHaveBeenCalledWith({ title: '改过的标题' })

    // 不再重复提交（定时器已消费）
    vi.advanceTimersByTime(2000)
    expect(updateDocContent).toHaveBeenCalledTimes(1)
  })

  it('连续输入只在最后停顿后提交一次', () => {
    const updateDocContent = vi.fn()
    render(<EditorDocTitle activeDoc={doc('原标题')} updateDocContent={updateDocContent} />)
    const el = titleEl()

    el.textContent = '一'
    fireEvent.input(el)
    vi.advanceTimersByTime(500)
    el.textContent = '一二'
    fireEvent.input(el)
    vi.advanceTimersByTime(500)
    expect(updateDocContent).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(updateDocContent).toHaveBeenCalledTimes(1)
    expect(updateDocContent).toHaveBeenCalledWith({ title: '一二' })
  })

  it('Enter 立即提交并取消挂起的防抖（不会提交两次）', () => {
    const updateDocContent = vi.fn()
    render(<EditorDocTitle activeDoc={doc('原标题')} updateDocContent={updateDocContent} />)
    const el = titleEl()

    el.textContent = '回车提交'
    fireEvent.keyDown(el, { key: 'Enter' })
    expect(updateDocContent).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2000)
    expect(updateDocContent).toHaveBeenCalledTimes(1)
  })

  it('Esc 还原到进入编辑时的标题，并取消挂起的防抖提交', () => {
    const updateDocContent = vi.fn()
    render(<EditorDocTitle activeDoc={doc('原标题')} updateDocContent={updateDocContent} />)
    const el = titleEl()

    fireEvent.focus(el)
    el.textContent = '打错的标题'
    fireEvent.input(el)
    fireEvent.keyDown(el, { key: 'Escape' })

    // DOM 立刻回到快照；store 本来就是这个值，所以不产生写入
    expect(el.textContent).toBe('原标题')
    expect(updateDocContent).not.toHaveBeenCalled()

    // 关键：挂起的 800ms 提交必须被取消 —— 否则会把刚还原掉的内容又写回去
    vi.advanceTimersByTime(2000)
    expect(updateDocContent).not.toHaveBeenCalled()
  })

  it('防抖已落库后再 Esc：写回进入编辑时的快照（旧值真的能还原）', () => {
    const updateDocContent = vi.fn()
    // 真实链路里防抖提交会更新 store → 父组件以新标题重渲染，这里模拟同一条路径
    const { rerender } = render(
      <EditorDocTitle activeDoc={doc('原标题')} updateDocContent={updateDocContent} />,
    )
    const el = titleEl()

    // 真实 focus（jsdom 的 fireEvent.focus 不会改 document.activeElement）——
    // 组件靠 activeElement 判断"正在编辑"，快照才不会被外部同步覆盖
    el.focus()
    expect(document.activeElement).toBe(el)
    el.textContent = '第一次修改'
    fireEvent.input(el)
    vi.advanceTimersByTime(900) // 防抖到点：store 已经是新标题
    expect(updateDocContent).toHaveBeenCalledWith({ title: '第一次修改' })
    updateDocContent.mockClear()
    rerender(<EditorDocTitle activeDoc={doc('第一次修改')} updateDocContent={updateDocContent} />)

    // 继续改，再 Esc —— 此刻 store 与快照不一致，必须写回快照
    el.textContent = '第二次修改'
    fireEvent.input(el)
    fireEvent.keyDown(el, { key: 'Escape' })
    expect(updateDocContent).toHaveBeenCalledWith({ title: '原标题' })
    expect(el.textContent).toBe('原标题')
  })

  it('卸载（切视图）时把挂起的提交立刻落盘', () => {
    const updateDocContent = vi.fn()
    const { unmount } = render(
      <EditorDocTitle activeDoc={doc('原标题')} updateDocContent={updateDocContent} />,
    )
    const el = titleEl()
    el.textContent = '还没失焦的标题'
    fireEvent.input(el)
    expect(updateDocContent).not.toHaveBeenCalled()

    unmount()
    expect(updateDocContent).toHaveBeenCalledTimes(1)
    expect(updateDocContent).toHaveBeenCalledWith({ title: '还没失焦的标题' })
  })

  it('内容与 store 一致时不写 store（只多敲空格也不产生快照）', () => {
    const updateDocContent = vi.fn()
    render(<EditorDocTitle activeDoc={doc('原标题')} updateDocContent={updateDocContent} />)
    const el = titleEl()
    el.textContent = '原标题 '
    fireEvent.input(el)
    vi.advanceTimersByTime(1000)
    expect(updateDocContent).not.toHaveBeenCalled()
  })
})
