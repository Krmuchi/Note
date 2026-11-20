import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import { VirtualScroll, type VirtualScrollHandle } from '@/components/VirtualScroll'

/**
 * 命令式 scrollToIndex（缺陷：虚拟化下键盘导航焦点项不在 DOM 时无法滚动跟随）。
 * jsdom 的 scrollTop 是可读写普通属性，可直接断言计算结果。
 */

interface Item { id: string }

const makeItems = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ id: `d${i}` }))

const setup = (count = 250, containerHeight = 480, itemHeight = 40): { ref: { current: VirtualScrollHandle | null }; scroller: HTMLElement; items: Item[]; unmount: () => void } => {
  const ref = { current: null as VirtualScrollHandle | null }
  const items = makeItems(count)
  const { container, unmount } = render(
    <VirtualScroll
      ref={ref}
      items={items}
      itemHeight={itemHeight}
      containerHeight={containerHeight}
      renderItem={(item) => <div data-item-id={item.id}>{item.id}</div>}
      getKey={(item) => item.id}
    />,
  )
  // VirtualScroll 根节点是 container 的第一个子 div（overflow:auto）
  const scroller = container.firstElementChild as HTMLElement
  return { ref, scroller, items, unmount }
}

describe('VirtualScroll.scrollToIndex', () => {
  it('把视口外的项滚入可视区：按行高计算 scrollTop（block:nearest 语义）', () => {
    const { ref, scroller } = setup(250, 480, 40)
    // 250 项 × 40 = 10000 总高；视口 480。最后一项 top=9960 bottom=10000
    // 需滚到 bottom-containerHeight = 9520（也是 maxScroll）
    act(() => ref.current!.scrollToIndex(249))
    expect(scroller.scrollTop).toBe(9520)
    // 目标项进入渲染窗口
    expect(scroller.querySelector('[data-item-id="d249"]')).not.toBeNull()
  })

  it('向上滚动到视口上方的项：scrollTop 对齐到该项顶部', () => {
    const { ref, scroller } = setup(250, 480, 40)
    act(() => ref.current!.scrollToIndex(249))
    expect(scroller.scrollTop).toBe(9520)
    // 回到第 10 项（top=400），当前视口顶部 9520 远高于它 → 对齐到 400
    act(() => ref.current!.scrollToIndex(10))
    expect(scroller.scrollTop).toBe(400)
    expect(scroller.querySelector('[data-item-id="d10"]')).not.toBeNull()
  })

  it('项已在可视区内时不改变 scrollTop', () => {
    const { ref, scroller } = setup(250, 480, 40)
    // 初始 scrollTop=0，视口 [0,480)；第 5 项 top=200 bottom=240 完全可见
    act(() => ref.current!.scrollToIndex(5))
    expect(scroller.scrollTop).toBe(0)
  })

  it('下标越界时钳制到有效范围', () => {
    const { ref, scroller } = setup(250, 480, 40)
    act(() => ref.current!.scrollToIndex(9999))
    expect(scroller.scrollTop).toBe(9520)
    act(() => ref.current!.scrollToIndex(-5))
    expect(scroller.scrollTop).toBe(0)
  })

  it('空列表时调用不报错', () => {
    const { ref, scroller } = setup(0, 480, 40)
    act(() => ref.current!.scrollToIndex(0))
    expect(scroller.scrollTop).toBe(0)
  })
})

/**
 * scroll → setState 的 rAF 节流（P2-1）。
 *
 * jsdom 默认不派发 scroll 事件，所以这里用 fireEvent.scroll 手工派发，
 * 并把 requestAnimationFrame 换成可手动回放的受控实现，
 * 这样"同帧合并 / 卸载取消 / 命令式滚动不被覆盖"三条都能被直接断言。
 */
describe('VirtualScroll 滚动事件 rAF 节流', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('同一帧内多次 scroll 只排队一次 rAF，回放时取最新 scrollTop', async () => {
    const scheduled: FrameRequestCallback[] = []
    const raf = vi.fn((cb: FrameRequestCallback) => {
      scheduled.push(cb)
      return scheduled.length
    })
    vi.stubGlobal('requestAnimationFrame', raf)

    const { scroller } = setup(250, 480, 40)

    // 一帧内连发三个位置（4000 → 6000 → 8000）
    scroller.scrollTop = 4000
    fireEvent.scroll(scroller)
    scroller.scrollTop = 6000
    fireEvent.scroll(scroller)
    scroller.scrollTop = 8000
    fireEvent.scroll(scroller)

    // 三次事件只安排一次 rAF（旧实现是三次 setState）
    expect(raf).toHaveBeenCalledTimes(1)
    // rAF 还没执行：渲染窗口仍是初始位置（第 0 项在 DOM 里）
    expect(scroller.querySelector('[data-item-id="d0"]')).not.toBeNull()

    // 回放排队的回调：状态直接跳到最新值 8000（中值 4000/6000 从未落过状态）
    await act(async () => {
      scheduled[0](0)
    })
    expect(scroller.querySelector('[data-item-id="d0"]')).toBeNull()
    // 8000 / 40 = 200，overscan 5 → startIndex 195
    expect(scroller.querySelector('[data-item-id="d195"]')).not.toBeNull()
  })

  it('卸载时取消挂起的 rAF，避免对已卸载组件 setState', () => {
    const raf = vi.fn((_cb: FrameRequestCallback) => 7)
    const caf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.stubGlobal('cancelAnimationFrame', caf)

    const { scroller, unmount } = setup(250, 480, 40)
    fireEvent.scroll(scroller)
    expect(raf).toHaveBeenCalledTimes(1)

    unmount()
    expect(caf).toHaveBeenCalledWith(7)
  })

  it('scrollToIndex 同步生效：先撤掉挂起的 rAF，不被排队时的旧 scrollTop 覆盖', async () => {
    const scheduled: FrameRequestCallback[] = []
    const caf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      scheduled.push(cb)
      return scheduled.length
    })
    vi.stubGlobal('cancelAnimationFrame', caf)

    const { ref, scroller } = setup(250, 480, 40)

    // 先派发一次滚动，留下一个待执行的 rAF（值 1000）
    scroller.scrollTop = 1000
    fireEvent.scroll(scroller)
    expect(scheduled).toHaveLength(1)

    // 命令式滚动绕过节流：同步落到 9520 并立刻渲染目标项
    act(() => ref.current!.scrollToIndex(249))
    expect(scroller.scrollTop).toBe(9520)
    expect(scroller.querySelector('[data-item-id="d249"]')).not.toBeNull()
    // 挂起的 rAF 已被撤销
    expect(caf).toHaveBeenCalledTimes(1)

    // 即便残留回调被强行执行，也不能把状态拉回旧值 1000
    await act(async () => {
      scheduled[0](0)
    })
    expect(scroller.scrollTop).toBe(9520)
    expect(scroller.querySelector('[data-item-id="d249"]')).not.toBeNull()
  })
})