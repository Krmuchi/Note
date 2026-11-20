import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createAliveIdsDeriver,
  pruneExpandedDocs,
  readExpandedDocs,
  writeExpandedDocs,
} from '@/utils/docExpanded'

/**
 * 文档树展开态持久化。
 *
 * 契约重点：存"已展开集合"而非"已折叠集合"（默认收起的库不该把所有 id 都写进去）、
 * 数据损坏时不能抛错、以及删除文档后残留 id 要被裁掉。
 */

const KEY = 'notes-doc-expanded'

beforeEach(() => {
  localStorage.clear()
})

describe('readExpandedDocs', () => {
  it('没有存储时返回空集合', () => {
    expect(readExpandedDocs().size).toBe(0)
  })

  it('读回已写入的 id', () => {
    writeExpandedDocs(new Set(['a', 'b']))
    expect([...readExpandedDocs()].sort()).toEqual(['a', 'b'])
  })

  it('JSON 损坏时返回空集合（不抛错）', () => {
    localStorage.setItem(KEY, '{ not json')
    expect(() => readExpandedDocs()).not.toThrow()
    expect(readExpandedDocs().size).toBe(0)
  })

  it('非数组结构返回空集合', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 1 }))
    expect(readExpandedDocs().size).toBe(0)
  })

  it('过滤掉非字符串项（手改过的存储不该让文档树崩掉）', () => {
    localStorage.setItem(KEY, JSON.stringify(['ok', 42, null, '', { x: 1 }]))
    expect([...readExpandedDocs()]).toEqual(['ok'])
  })

  it('localStorage 读取抛错时返回空集合', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => readExpandedDocs()).not.toThrow()
    expect(readExpandedDocs().size).toBe(0)
    spy.mockRestore()
  })
})

describe('writeExpandedDocs', () => {
  it('写入失败不抛错（隐私模式/配额满是纯体验降级）', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => writeExpandedDocs(new Set(['a']))).not.toThrow()
    spy.mockRestore()
  })

  it('超过上限时只保留最后 500 条', () => {
    const many = new Set(Array.from({ length: 600 }, (_, i) => `doc-${i}`))
    writeExpandedDocs(many)

    const stored = JSON.parse(localStorage.getItem(KEY)!) as string[]
    expect(stored).toHaveLength(500)
    // 保留的是"最后写入"的那批
    expect(stored[stored.length - 1]).toBe('doc-599')
  })
})

describe('createAliveIdsDeriver', () => {
  it('id 集不变时返回同一个 Set 引用（文档对象换了也不动）', () => {
    const derive = createAliveIdsDeriver()
    const first = derive([{ id: 'a' }, { id: 'b' }])
    const second = derive([{ id: 'a' }, { id: 'b' }])
    expect(second).toBe(first)
  })

  it('顺序变化但成员相同 → 仍是同一引用（effect 不该被重排触发）', () => {
    const derive = createAliveIdsDeriver()
    const first = derive([{ id: 'a' }, { id: 'b' }])
    expect(derive([{ id: 'b' }, { id: 'a' }])).toBe(first)
  })

  it('增删 id 时返回新集合且成员正确', () => {
    const derive = createAliveIdsDeriver()
    const first = derive([{ id: 'a' }, { id: 'b' }])
    const grown = derive([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    expect(grown).not.toBe(first)
    expect([...grown].sort()).toEqual(['a', 'b', 'c'])
    const shrunk = derive([{ id: 'c' }])
    expect(shrunk).not.toBe(grown)
    expect([...shrunk]).toEqual(['c'])
  })
})

describe('pruneExpandedDocs', () => {
  it('裁掉已不存在的文档 id', () => {
    const pruned = pruneExpandedDocs(new Set(['alive', 'deleted']), new Set(['alive']))
    expect([...pruned]).toEqual(['alive'])
  })

  it('全部存活时内容不变', () => {
    const ids = new Set(['a', 'b'])
    expect(pruneExpandedDocs(ids, new Set(['a', 'b']))).toEqual(ids)
  })

  it('全部失效时返回空集合', () => {
    expect(pruneExpandedDocs(new Set(['x']), new Set()).size).toBe(0)
  })
})
