import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  consumeSearchJump,
  requestSearchJump,
  resetSearchJump,
  subscribeSearchJump,
} from '@/utils/searchJump'

describe('searchJump', () => {
  beforeEach(() => {
    resetSearchJump()
  })

  it('同一篇文档可取回关键词，且取回后清空', () => {
    requestSearchJump({ docId: 'd1', query: '关键词' })
    expect(consumeSearchJump('d1')).toBe('关键词')
    expect(consumeSearchJump('d1')).toBeNull()
  })

  it('文档不匹配时不消费，待处理状态保留给目标文档', () => {
    requestSearchJump({ docId: 'd1', query: '关键词' })
    expect(consumeSearchJump('d2')).toBeNull()
    expect(consumeSearchJump('d1')).toBe('关键词')
  })

  it('空关键词不发请求（避免打开一个空查找栏）', () => {
    requestSearchJump({ docId: 'd1', query: '' })
    expect(consumeSearchJump('d1')).toBeNull()
  })

  it('订阅者会收到通知，取消订阅后不再收到', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSearchJump(listener)

    requestSearchJump({ docId: 'd1', query: 'a' })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    requestSearchJump({ docId: 'd1', query: 'b' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('后一次请求覆盖前一次（用户连点两条结果）', () => {
    requestSearchJump({ docId: 'd1', query: 'a' })
    requestSearchJump({ docId: 'd2', query: 'b' })
    expect(consumeSearchJump('d1')).toBeNull()
    expect(consumeSearchJump('d2')).toBe('b')
  })
})
