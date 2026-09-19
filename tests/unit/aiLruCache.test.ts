import { describe, it, expect, vi } from 'vitest'
import { createLruCache } from '../../electron/ai/lru-cache.cjs'

interface CacheHarness {
  cache: ReturnType<typeof createLruCache>
  advance: (ms: number) => void
  setClock: (value: number) => void
}

describe('createLruCache - LRU + TTL 缓存', () => {
  function makeCache(overrides: Record<string, unknown> = {}): CacheHarness {
    let clock = 0
    const cache = createLruCache({
      maxEntries: 3,
      ttlMs: 1000,
      maxEntryBytes: 32,
      now: () => clock,
      ...overrides,
    })
    return { cache, advance: (ms: number) => { clock += ms }, setClock: (v: number) => { clock = v } }
  }

  it('未命中返回 undefined，命中返回原值', () => {
    const { cache } = makeCache()
    expect(cache.get('missing')).toBeUndefined()
    cache.set('a', 'value-a')
    expect(cache.get('a')).toBe('value-a')
    expect(cache.stats.hits).toBe(1)
    expect(cache.stats.misses).toBe(1)
  })

  it('超出容量时淘汰最久未使用的条目', () => {
    const { cache } = makeCache()
    cache.set('a', 'va')
    cache.set('b', 'vb')
    cache.set('c', 'vc')
    // 访问 a，使其成为最近使用；此时最旧的是 b
    expect(cache.get('a')).toBe('va')
    cache.set('d', 'vd')
    expect(cache.size).toBe(3)
    expect(cache.has('b')).toBe(false)
    expect(cache.has('a')).toBe(true)
    expect(cache.has('c')).toBe(true)
    expect(cache.has('d')).toBe(true)
    expect(cache.stats.evictions).toBe(1)
  })

  it('TTL 到期后条目失效', () => {
    const { cache, setClock } = makeCache()
    cache.set('a', 'va')
    setClock(999)
    expect(cache.get('a')).toBe('va')
    setClock(1000)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('单条超过 maxEntryBytes 时拒绝写入', () => {
    const { cache } = makeCache({ maxEntryBytes: 8 })
    expect(cache.set('big', 'x'.repeat(20))).toBe(false)
    expect(cache.size).toBe(0)
    expect(cache.stats.rejections).toBe(1)
    expect(cache.set('ok', 'short')).toBe(true)
    expect(cache.size).toBe(1)
  })

  it('clear 清空条目与在途记录', () => {
    const { cache } = makeCache()
    cache.set('a', 'va')
    cache.getOrLoad('k', () => Promise.resolve('v'))
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.pendingCount).toBe(0)
  })

  it('has 对已过期条目返回 false 并顺手清理', () => {
    const { cache, setClock } = makeCache()
    cache.set('a', 'va')
    setClock(5000)
    expect(cache.has('a')).toBe(false)
    expect(cache.size).toBe(0)
  })
})

describe('createLruCache - in-flight 去重', () => {
  it('同 key 并发请求共享同一个 Promise，loader 只执行一次', async () => {
    const cache = createLruCache({ now: () => 0 })
    let release: (value: string) => void = () => {}
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve
        }),
    )

    const first = cache.getOrLoad('key', loader)
    const second = cache.getOrLoad('key', loader)
    // inFlight 登记是同步的，因此第二次调用不会触发新的 loader
    expect(cache.pendingCount).toBe(1)

    release('计算结果')
    const [r1, r2] = await Promise.all([first, second])
    expect(r1).toEqual({ value: '计算结果', cached: false })
    expect(r2).toEqual({ value: '计算结果', cached: false })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(cache.pendingCount).toBe(0)
  })

  it('结果落缓存后再次调用直接命中，不再执行 loader', async () => {
    const cache = createLruCache({ now: () => 0 })
    const loader = vi.fn().mockResolvedValue('值')
    const first = await cache.getOrLoad('key', loader)
    expect(first.cached).toBe(false)
    const second = await cache.getOrLoad('key', loader)
    expect(second).toEqual({ value: '值', cached: true })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('loader 抛错时不写入缓存，且 in-flight 记录被清理', async () => {
    const cache = createLruCache({ now: () => 0 })
    const loader = vi.fn().mockRejectedValue(new Error('上游失败'))
    await expect(cache.getOrLoad('key', loader)).rejects.toThrow('上游失败')
    expect(cache.pendingCount).toBe(0)
    expect(cache.has('key')).toBe(false)
  })

  it('不同 key 各自独立执行 loader', async () => {
    const cache = createLruCache({ now: () => 0 })
    const loader = vi.fn((...args: unknown[]) => Promise.resolve(`v-${String(args[0])}`))
    const [a, b] = await Promise.all([
      cache.getOrLoad('a', () => loader('a')),
      cache.getOrLoad('b', () => loader('b')),
    ])
    expect(a.value).toBe('v-a')
    expect(b.value).toBe('v-b')
  })
})