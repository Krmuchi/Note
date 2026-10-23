import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shouldShowOnboarding, markOnboardingDone, isOnboardingDone } from '@/utils/onboarding'

/**
 * 首启引导的触发条件。
 * 核心风险是"老用户升级后被弹窗打扰"，所以判定必须严格限定在初始种子数据上。
 */

const seedNotebooks = [{ id: 'nb-default', docs: [{ id: 'doc-welcome' }] }]

describe('shouldShowOnboarding', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('全新安装（种子数据 + 无浏览记录 + 未引导过）时展示', () => {
    expect(shouldShowOnboarding({ notebooks: seedNotebooks, recentViewsCount: 0 })).toBe(true)
  })

  it('已经引导过则不再展示', () => {
    markOnboardingDone()
    expect(isOnboardingDone()).toBe(true)
    expect(shouldShowOnboarding({ notebooks: seedNotebooks, recentViewsCount: 0 })).toBe(false)
  })

  it('有浏览记录（说明是老用户）时不展示', () => {
    expect(shouldShowOnboarding({ notebooks: seedNotebooks, recentViewsCount: 3 })).toBe(false)
  })

  it('用户已建过自己的知识库时不展示', () => {
    const notebooks = [{ id: 'nb-mine', docs: [{ id: 'doc-1' }] }]
    expect(shouldShowOnboarding({ notebooks, recentViewsCount: 0 })).toBe(false)
  })

  it('种子知识库里已有第二篇文档时不展示', () => {
    const notebooks = [{ id: 'nb-default', docs: [{ id: 'doc-welcome' }, { id: 'doc-2' }] }]
    expect(shouldShowOnboarding({ notebooks, recentViewsCount: 0 })).toBe(false)
  })

  it('存储不可用时不展示（避免每次启动都弹）', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    expect(shouldShowOnboarding({ notebooks: seedNotebooks, recentViewsCount: 0 })).toBe(false)
    spy.mockRestore()
  })
})
