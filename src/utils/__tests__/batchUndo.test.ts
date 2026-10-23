import { describe, it, expect, beforeEach, vi } from 'vitest'
import { clearPendingBatchUndo, setPendingBatchUndo, undoBatch } from '@/utils/batchUndo'

/**
 * 批量操作的撤销记录。
 *
 * 关键契约：撤销必须校验批次 id —— toast 上的"撤销"可能延迟触发，
 * 期间用户又做了新的批量操作，不校验就会撤销掉**另一次**操作。
 */

beforeEach(() => {
  clearPendingBatchUndo()
})

describe('batchUndo', () => {
  it('执行对应批次的反向操作', () => {
    const undo = vi.fn()
    const id = setPendingBatchUndo('批量打标签', undo)

    expect(undoBatch(id)).toBe(true)
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('批次 id 不匹配时拒绝执行（避免撤销掉后来的操作）', () => {
    const first = vi.fn()
    const second = vi.fn()
    setPendingBatchUndo('第一次', first)
    const secondId = setPendingBatchUndo('第二次', second)

    // 用第一次的 id 去撤销：必须失败，且不能执行任何一个回调
    expect(undoBatch('stale-id')).toBe(false)
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()

    // 正确的 id 才生效
    expect(undoBatch(secondId)).toBe(true)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('只能撤销一次：同一批次重复调用第二次返回 false', () => {
    const undo = vi.fn()
    const id = setPendingBatchUndo('批量删除', undo)

    expect(undoBatch(id)).toBe(true)
    expect(undoBatch(id)).toBe(false)
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('反向操作抛错时不逃逸（toast 回调里不能崩）', () => {
    const id = setPendingBatchUndo('批量移动', () => {
      throw new Error('boom')
    })

    expect(() => undoBatch(id)).not.toThrow()
    expect(undoBatch(id)).toBe(false)
  })
})
