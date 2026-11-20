import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SearchResults from '@/components/search/SearchResults'

/**
 * 搜索无结果空态文案：全局统一为一种写法
 * （标题「没有匹配的X」+ 提示「试试其他关键词或调整筛选条件」）。
 */

const renderNoResults = (): ReturnType<typeof render> =>
  render(
    <SearchResults
      results={[]}
      query="不存在的词"
      tags={[]}
      activeIndex={-1}
      onResultClick={vi.fn()}
      onBack={vi.fn()}
    />,
  )

describe('SearchResults 空态文案', () => {
  it('无结果：标题「没有匹配的结果」+ 统一提示语', () => {
    renderNoResults()
    expect(screen.getByText('没有匹配的结果')).toBeInTheDocument()
    expect(screen.getByText('试试其他关键词或调整筛选条件')).toBeInTheDocument()
  })

  it('旧文案「没有找到相关结果」不再出现', () => {
    renderNoResults()
    expect(screen.queryByText('没有找到相关结果')).toBeNull()
  })

  it('结果头部仍如实计数（空态不吞掉计数行）', () => {
    renderNoResults()
    expect(screen.getByText('找到 0 条结果')).toBeInTheDocument()
  })
})
