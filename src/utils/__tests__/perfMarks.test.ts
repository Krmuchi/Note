import { describe, it, expect, vi, beforeEach } from 'vitest'

/** 启动性能标记（F1）：只记首次、数据加载完成时汇总打印一次。 */

async function freshModule(): Promise<typeof import('@/utils/perfMarks')> {
  vi.resetModules()
  return await import('@/utils/perfMarks')
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('perfMarks', () => {
  it('记录节点耗时（相对模块加载，非负且单调）', async () => {
    const mod = await freshModule()
    mod.markPerf('appMounted')
    mod.markPerf('dataLoaded')

    const snapshot = mod.readPerfSnapshot()
    expect(snapshot.appMounted).toBeGreaterThanOrEqual(0)
    expect(snapshot.dataLoaded).toBeGreaterThanOrEqual(snapshot.appMounted!)
  })

  it('同一节点只记第一次（重复渲染不会覆盖首次数据）', async () => {
    const mod = await freshModule()
    mod.markPerf('appMounted')
    const first = mod.readPerfSnapshot().appMounted

    // 模拟一次较晚的重复标记
    await new Promise((resolve) => setTimeout(resolve, 5))
    mod.markPerf('appMounted')

    expect(mod.readPerfSnapshot().appMounted).toBe(first)
  })

  it('数据加载完成时打印一次汇总，且只打印一次', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const mod = await freshModule()

    mod.markPerf('appMounted')
    mod.markPerf('dataLoaded')
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(String(logSpy.mock.calls[0][0])).toContain('[perf] 启动')

    mod.markPerf('firstDocRendered')
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it('boot 节点不可被覆盖（它是基准零点）', async () => {
    const mod = await freshModule()
    mod.markPerf('boot')
    expect(mod.readPerfSnapshot().boot).toBe(0)
  })
})
