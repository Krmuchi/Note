import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from '@/components/common/EmptyState'

/**
 * 空态 CTA 统一的组件级护栏：actions 必填 ——
 * 每个空态都要回答"下一步做什么"，没有动作时调用处显式传 [] 并注明理由。
 */

describe('EmptyState：actions 必填', () => {
  it('渲染动作按钮并回调 onClick', () => {
    const onClick = vi.fn()
    render(<EmptyState icon={<span />} title="空" actions={[{ label: '去文档', onClick, variant: 'primary' }]} />)

    fireEvent.click(screen.getByRole('button', { name: '去文档' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('actions=[] 显式无动作：不渲染动作区（而不是悄悄缺省）', () => {
    const { container } = render(<EmptyState icon={<span />} title="空" actions={[]} />)
    expect(container.querySelector('.empty-state-actions')).toBeNull()
  })

  it('多个动作各带 variant 样式类', () => {
    render(
      <EmptyState
        icon={<span />}
        title="空"
        actions={[
          { label: '主要动作', onClick: vi.fn() },
          { label: '次要动作', onClick: vi.fn(), variant: 'secondary' },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: '主要动作' }).className).toContain('primary')
    expect(screen.getByRole('button', { name: '次要动作' }).className).toContain('secondary')
  })
})
