import { describe, it, expect } from 'vitest'
import { buildQuickRange, isQuickRangeActive } from '@/utils/dateRange'

const at = (iso: string): Date => new Date(iso)

describe('buildQuickRange', () => {
  it('今天：起止都是本地当天', () => {
    expect(buildQuickRange(1, at('2026-10-01T12:00:00'))).toEqual({ start: '2026-10-01', end: '2026-10-01' })
  })

  it('近 7 天：包含今天在内的 7 个自然日', () => {
    expect(buildQuickRange(7, at('2026-10-01T12:00:00'))).toEqual({ start: '2026-09-25', end: '2026-10-01' })
  })

  it('近 30 天跨月正确', () => {
    expect(buildQuickRange(30, at('2026-03-15T08:00:00'))).toEqual({ start: '2026-02-14', end: '2026-03-15' })
  })

  it('用本地日期而非 UTC（东八区夜间不会被算成昨天）', () => {
    // 2026-10-01T23:30 本地时间；若走 toISOString 会得到 10-01T15:30Z 仍是 10-01，
    // 因此这里换成"本地 00:10"更严格：UTC 下会变成前一天 16:10
    expect(buildQuickRange(1, at('2026-10-01T00:10:00')).start).toBe('2026-10-01')
  })
})

describe('isQuickRangeActive', () => {
  it('与快捷范围一致时为真', () => {
    expect(isQuickRangeActive(buildQuickRange(7, at('2026-10-01T12:00:00')), 7, at('2026-10-01T18:00:00'))).toBe(true)
  })

  it('手动改过日期后为假', () => {
    expect(isQuickRangeActive({ start: '2026-01-01', end: '2026-01-02' }, 7, at('2026-10-01T12:00:00'))).toBe(false)
  })

  it('未设置日期范围为假', () => {
    expect(isQuickRangeActive(undefined, 1)).toBe(false)
    expect(isQuickRangeActive({}, 1)).toBe(false)
  })
})
