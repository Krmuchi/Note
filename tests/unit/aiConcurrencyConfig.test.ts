import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createGate, normalizeLimit } from '../../electron/ai/concurrency.cjs'
import { createConfigStore } from '../../electron/ai/config-store.cjs'

/**
 * 回归：并发闸门不得因非法 limit 死锁。
 *
 * 旧实现 `limit = Math.max(1, nextLimit)`：传入 'abc' 得到 NaN，
 * 而 `active < NaN` 恒为 false，排队请求永不唤醒 —— 所有 AI 请求无声挂起。
 */

interface Gate {
  run<T>(fn: () => Promise<T>): Promise<T>
  setLimit(n: unknown): void
  readonly limit: number
  readonly pending: number
}

describe('createGate limit 收敛', () => {
  it('normalizeLimit 对非法输入回退，且永不返回 NaN', () => {
    expect(Number.isNaN(normalizeLimit('abc'))).toBe(false)
    expect(normalizeLimit('abc')).toBe(3)
    expect(normalizeLimit(undefined)).toBe(3)
    expect(normalizeLimit(null)).toBe(3)
    expect(normalizeLimit({})).toBe(3)
    expect(normalizeLimit([])).toBe(3)
    expect(normalizeLimit(NaN)).toBe(3)
    expect(normalizeLimit(Infinity)).toBe(3)
    expect(normalizeLimit(-5)).toBe(1)
    expect(normalizeLimit(0)).toBe(1)
    expect(normalizeLimit(2.7)).toBe(2)
    expect(normalizeLimit('4')).toBe(4)
  })

  it("setLimit('abc') 后请求仍能执行完毕（旧实现永久挂起）", async () => {
    const gate = createGate({ limit: 3 }) as unknown as Gate
    gate.setLimit('abc')
    expect(Number.isNaN(gate.limit)).toBe(false)

    await expect(
      Promise.race([
        gate.run(() => Promise.resolve('ok')),
        new Promise((_, rej) => setTimeout(() => rej(new Error('死锁：300ms 未唤醒')), 300)),
      ]),
    ).resolves.toBe('ok')
  })

  it('各种脏值都不会让闸门卡住', async () => {
    for (const dirty of ['abc', NaN, undefined, null, {}, [], Infinity]) {
      const gate = createGate({ limit: 1 }) as unknown as Gate
      gate.setLimit(dirty)
      await expect(
        Promise.race([
          gate.run(() => Promise.resolve('ok')),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`脏值 ${String(dirty)} 导致挂起`)), 300)),
        ]),
      ).resolves.toBe('ok')
    }
  })

  it('正常放行：超限排队，release 后依次执行', async () => {
    const gate = createGate({ limit: 1 }) as unknown as Gate
    const order: string[] = []
    const p1 = gate.run(async () => {
      order.push('a-start')
      await new Promise((r) => setTimeout(r, 20))
      order.push('a-end')
    })
    const p2 = gate.run(async () => {
      order.push('b-start')
    })
    await Promise.all([p1, p2])
    expect(order).toEqual(['a-start', 'a-end', 'b-start'])
  })
})

/**
 * 回归：磁盘上的 ai-config.json 被污染时，非法字段必须被丢弃并回退默认值。
 * 这是 setLimit 死锁的根因入口 —— 旧的 load() 逐字段无校验透传。
 */
describe('config-store 磁盘字段校验', () => {
  interface StoreHandle {
    store: ReturnType<typeof createConfigStore>
    logger: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> }
    dir: string
  }

  function makeStore(fileContent: string | null): StoreHandle {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-cfg-'))
    if (fileContent !== null) fs.writeFileSync(path.join(dir, 'ai-config.json'), fileContent, 'utf-8')
    const logger = { warn: vi.fn(), error: vi.fn() }
    const store = createConfigStore({
      app: { getPath: () => dir },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (s: string) => Buffer.from(s),
        decryptString: () => 'decrypted',
      },
      logger,
    })
    return { store, logger, dir }
  }

  it("concurrency 为非数字时回退默认 3（而不是 NaN）", async () => {
    const { store, dir } = makeStore(JSON.stringify({ concurrency: 'abc' }))
    try {
      const cfg = await store.load()
      expect(cfg.concurrency).toBe(3)
      expect(Number.isNaN(cfg.concurrency)).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('timeoutMs / temperature / stream 等脏值全部被拒', async () => {
    const { store, logger, dir } = makeStore(
      JSON.stringify({
        timeoutMs: null,
        temperature: 'hot',
        stream: 'false',
        maxTokens: -1,
        maxInputTokens: 999999999,
        cacheEnabled: 'yes',
        concurrency: {},
      }),
    )
    try {
      const cfg = await store.load()
      expect(cfg.timeoutMs).toBe(60000)
      expect(cfg.temperature).toBe(0.7)
      expect(cfg.stream).toBe(true)
      expect(cfg.maxTokens).toBe(1600)
      expect(cfg.maxInputTokens).toBe(8000)
      expect(cfg.cacheEnabled).toBe(true)
      expect(cfg.concurrency).toBe(3)
      expect(logger.warn).toHaveBeenCalled()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('合法字段仍正常生效', async () => {
    const { store, dir } = makeStore(
      JSON.stringify({ concurrency: 5, timeoutMs: 120000, stream: false, model: 'gpt-4o' }),
    )
    try {
      const cfg = await store.load()
      expect(cfg.concurrency).toBe(5)
      expect(cfg.timeoutMs).toBe(120000)
      expect(cfg.stream).toBe(false)
      expect(cfg.model).toBe('gpt-4o')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('配置文件缺失时回退默认值', async () => {
    const { store, dir } = makeStore(null)
    try {
      const cfg = await store.load()
      expect(cfg.concurrency).toBe(3)
      expect(cfg.timeoutMs).toBe(60000)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('损坏的 JSON 不会抛错，回退默认值', async () => {
    const { store, dir } = makeStore('{ this is not json')
    try {
      const cfg = await store.load()
      expect(cfg.concurrency).toBe(3)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
