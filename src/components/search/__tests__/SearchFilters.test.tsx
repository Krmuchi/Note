import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SearchFilters from '@/components/search/SearchFilters'
import type { SearchFilter } from '@/types'

/** 搜索筛选项的交互（S3 快捷时间 / S4 排序）。 */

const renderFilters = (filters: SearchFilter = { type: 'all' }): ReturnType<typeof vi.fn> => {
  const onFilterChange = vi.fn()
  render(<SearchFilters filters={filters} tags={[]} onFilterChange={onFilterChange} />)
  return onFilterChange
}

describe('SearchFilters - 快捷时间（S3）', () => {
  it('点「近 7 天」写入一段本地日期区间', () => {
    const onFilterChange = renderFilters()
    fireEvent.click(screen.getByRole('button', { name: '近 7 天' }))

    expect(onFilterChange).toHaveBeenCalledWith('dateRange', expect.objectContaining({
      start: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      end: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }))
  })

  it('点「不限」清空日期范围', () => {
    const onFilterChange = renderFilters({ type: 'all', dateRange: { start: '2026-01-01', end: '2026-01-07' } })
    fireEvent.click(screen.getByRole('button', { name: '不限' }))
    expect(onFilterChange).toHaveBeenCalledWith('dateRange', undefined)
  })

  it('当前范围命中某个快捷项时该项为选中态', () => {
    const onFilterChange = renderFilters({ type: 'all', dateRange: { start: '2020-01-01', end: '2020-01-01' } })
    expect(onFilterChange).not.toHaveBeenCalled()
    // 2020 年的区间不属于任何快捷项，仅「不限」保持未选中
    expect(screen.getByRole('button', { name: '今天' }).className).not.toContain('active')
  })
})

describe('SearchFilters - 排序（S4）', () => {
  it('默认为相关度优先，可切换为最近更新', () => {
    const onFilterChange = renderFilters()
    fireEvent.change(screen.getByDisplayValue('相关度优先'), { target: { value: 'time' } })
    expect(onFilterChange).toHaveBeenCalledWith('sort', 'time')
  })

  it('类型筛选仍可用', () => {
    const onFilterChange = renderFilters()
    fireEvent.change(screen.getByDisplayValue('全部'), { target: { value: 'document' } })
    expect(onFilterChange).toHaveBeenCalledWith('type', 'document')
  })
})
