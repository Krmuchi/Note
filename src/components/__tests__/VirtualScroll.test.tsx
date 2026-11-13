import { describe, it, expect } from 'vitest'
import { render, act } from '@testing-library/react'
import { VirtualScroll, type VirtualScrollHandle } from '@/components/VirtualScroll'

/**
 * 命令式 scrollToIndex（缺陷：虚拟化下键盘导航焦点项不在 DOM 时无法滚动跟随）。
 * jsdom 的 scrollTop 是可读写普通属性，可直接断言计算结果。
 */

interface Item { id: string }

const makeItems = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ id: `d${i}` }))

const setup = (count = 250, containerHeight = 480, itemHeight = 40): { ref: { current: VirtualScrollHandle | null }; scroller: HTMLElement; items: Item[] } => {
  const ref = { current: null as VirtualScrollHandle | null }
  const items = makeItems(count)
  const { container } = render(
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
  return { ref, scroller, items }
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