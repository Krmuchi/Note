import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePreviewScrollSync } from '@/hooks/usePreviewScrollSync'

/**
 * 分屏滚动同步。
 *
 * 回归背景（CLAUDE.md 记录的 7 个"静默失效"之一）：旧实现只认
 * `textareaRef.current`，富文本内核下该节点为 null → 两个方向都直接 return，
 * 于是 split 模式的滚动同步"看起来在，实际完全不动"，且不报任何错。
 *
 * 这组测试锁住关键契约：**有 getScrollContainer 时优先用它**，
 * 不再依赖 textarea 是否存在。
 */

/** 构造一个可控滚动状态的假容器 */
function makeScroller(scrollTop: number, scrollHeight: number, clientHeight: number): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
  el.scrollTop = scrollTop
  return el
}

describe('usePreviewScrollSync - 富文本内核（无 textarea）', () => {
  it('editor→preview：用 getScrollContainer 算百分比，textarea 为 null 也生效', () => {
    const scroller = makeScroller(500, 2000, 1000) // maxScroll = 1000 → 50%
    const sync = vi.fn()

    const { result } = renderHook(() =>
      usePreviewScrollSync({
        textareaRef: { current: null },
        previewMode: 'split',
        getScrollContainer: () => scroller,
      }),
    )

    result.current.handleRegisterPreviewSync(sync)
    result.current.handleEditorScroll()

    expect(sync).toHaveBeenCalledWith(0.5)
  })

  it('preview→editor：直接写 getScrollContainer 的 scrollTop', () => {
    const scroller = makeScroller(0, 2000, 1000)

    const { result } = renderHook(() =>
      usePreviewScrollSync({
        textareaRef: { current: null },
        previewMode: 'split',
        getScrollContainer: () => scroller,
      }),
    )

    result.current.handlePreviewScroll(0.25)
    expect(scroller.scrollTop).toBe(250)
  })
})

describe('usePreviewScrollSync - 旧 textarea 内核', () => {
  it('没有 getScrollContainer 时回退到 textareaRef', () => {
    const ta = makeScroller(300, 1300, 1000) as unknown as HTMLTextAreaElement // max=300 → 100%
    const sync = vi.fn()

    const { result } = renderHook(() =>
      usePreviewScrollSync({
        textareaRef: { current: ta },
        previewMode: 'split',
      }),
    )

    result.current.handleRegisterPreviewSync(sync)
    result.current.handleEditorScroll()

    expect(sync).toHaveBeenCalledWith(1)
  })

  it('两者都为 null 时不抛错（编辑器还没挂载的瞬间）', () => {
    const { result } = renderHook(() =>
      usePreviewScrollSync({
        textareaRef: { current: null },
        previewMode: 'split',
      }),
    )

    expect(() => result.current.handleEditorScroll()).not.toThrow()
    expect(() => result.current.handlePreviewScroll(0.5)).not.toThrow()
  })
})

describe('usePreviewScrollSync - 模式与边界', () => {
  it('非 split 模式不触发任何同步（edit / preview 单栏）', () => {
    const scroller = makeScroller(500, 2000, 1000)
    const sync = vi.fn()

    const { result } = renderHook(() =>
      usePreviewScrollSync({
        textareaRef: { current: null },
        previewMode: 'edit',
        getScrollContainer: () => scroller,
      }),
    )

    result.current.handleRegisterPreviewSync(sync)
    result.current.handleEditorScroll()
    const before = scroller.scrollTop
    result.current.handlePreviewScroll(0.9)

    expect(sync).not.toHaveBeenCalled()
    expect(scroller.scrollTop).toBe(before) // 未被改写
  })

  it('内容不足以滚动时百分比为 0（不产生 NaN）', () => {
    const scroller = makeScroller(0, 800, 800) // maxScroll = 0
    const sync = vi.fn()

    const { result } = renderHook(() =>
      usePreviewScrollSync({
        textareaRef: { current: null },
        previewMode: 'split',
        getScrollContainer: () => scroller,
      }),
    )

    result.current.handleRegisterPreviewSync(sync)
    result.current.handleEditorScroll()

    expect(sync).toHaveBeenCalledWith(0)
    expect(Number.isNaN(sync.mock.calls[0][0])).toBe(false)
  })

  it('编辑器滚动总会调用 onEditorScroll（用于关闭斜杠面板）', () => {
    const onEditorScroll = vi.fn()
    const { result } = renderHook(() =>
      usePreviewScrollSync({
        textareaRef: { current: null },
        previewMode: 'edit',
        onEditorScroll,
        getScrollContainer: () => makeScroller(0, 2000, 1000),
      }),
    )

    result.current.handleEditorScroll()
    expect(onEditorScroll).toHaveBeenCalledTimes(1)
  })

  it('预览侧注销后不再回调（组件卸载不留悬挂引用）', () => {
    const scroller = makeScroller(500, 2000, 1000)
    const sync = vi.fn()

    const { result } = renderHook(() =>
      usePreviewScrollSync({
        textareaRef: { current: null },
        previewMode: 'split',
        getScrollContainer: () => scroller,
      }),
    )

    result.current.handleRegisterPreviewSync(sync)
    result.current.handleRegisterPreviewSync(null)
    result.current.handleEditorScroll()

    expect(sync).not.toHaveBeenCalled()
  })
})
