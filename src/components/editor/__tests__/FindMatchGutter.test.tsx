import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { FindMatchGutter } from '@/components/editor/FindMatchGutter'
import type { FindMatch } from '@/utils/findInText'

/**
 * P1-7：刻度带的命中数上限。
 *
 * 刻度是"每个命中一个按钮"，长文档搜高频字会上万条 —— 它随每次击键整体重绘，
 * 是查找栏开着时打字卡顿的主因。上限之外按比例抽样，总数由 title 如实展示。
 */
function makeMatches(count: number): FindMatch[] {
  return Array.from({ length: count }, (_, i) => ({ index: i * 10, length: 3 }))
}

describe('FindMatchGutter 抽样与上限（P1-7）', () => {
  it('命中过多时只渲染有限刻度，且当前命中一定被保留', () => {
    const { container } = render(
      <FindMatchGutter matches={makeMatches(1000)} current={37} contentLength={10000} onJump={vi.fn()} />,
    )
    const marks = container.querySelectorAll('.find-match-mark')
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.length).toBeLessThanOrEqual(400)
    // 高亮（当前命中）不能在抽样里丢掉，否则"当前在哪"看不见
    expect(container.querySelector('.find-match-mark.current')).not.toBeNull()
    // 总数仍如实展示
    expect(container.querySelector('.find-match-gutter')?.getAttribute('title')).toContain('共 1000 处命中')
  })

  it('命中数在上限内时逐条渲染', () => {
    const { container } = render(
      <FindMatchGutter matches={makeMatches(5)} current={0} contentLength={100} onJump={vi.fn()} />,
    )
    expect(container.querySelectorAll('.find-match-mark')).toHaveLength(5)
    expect(container.querySelector('.find-match-gutter')?.getAttribute('title')).toBe('共 5 处命中')
  })

  it('点击刻度跳到对应命中', () => {
    const onJump = vi.fn()
    const { container } = render(
      <FindMatchGutter matches={makeMatches(5)} current={0} contentLength={100} onJump={onJump} />,
    )
    fireEvent.click(container.querySelectorAll('.find-match-mark')[3])
    expect(onJump).toHaveBeenCalledWith(3)
  })

  it('没有命中时不渲染刻度带', () => {
    const { container } = render(
      <FindMatchGutter matches={[]} current={-1} contentLength={100} onJump={vi.fn()} />,
    )
    expect(container.querySelector('.find-match-gutter')).toBeNull()
  })
})
