import { describe, it, expect } from 'vitest'
import {
  createLoadGuard,
  resolveWindowBackgroundColor,
  MAX_RENDER_RELOADS,
  SHOW_FALLBACK_MS,
} from '../../electron/startup-guard.cjs'

/**
 * 启动失败 / 渲染崩溃的处置决策（P1-5）。
 *
 * 这条链路此前只写 console：生产环境界面加载失败 = 永远的白窗，
 * 渲染进程崩溃 = 无上限 reload（窗口自己"闪一下"）。
 * 决策抽成纯函数后，main.cjs 只负责执行弹框，计数与边界在这里被钉住。
 */
describe('startup-guard · 失败处置决策', () => {
  it('渲染崩溃：默认前 3 次自动重载，超限后交给用户', () => {
    const guard = createLoadGuard()
    expect(guard.recordRenderGone()).toEqual({ count: 1, action: 'reload' })
    expect(guard.recordRenderGone()).toEqual({ count: 2, action: 'reload' })
    expect(guard.recordRenderGone()).toEqual({ count: 3, action: 'reload' })
    expect(guard.recordRenderGone().action).toBe('dialog')
    expect(guard.recordRenderGone().action).toBe('dialog')
    expect(guard.counts().renderGones).toBe(5)
  })

  it('maxRenderReloads 可配置，非法值回落默认', () => {
    const once = createLoadGuard({ maxRenderReloads: 1 })
    expect(once.recordRenderGone().action).toBe('reload')
    expect(once.recordRenderGone().action).toBe('dialog')

    // 0 / 负数不是合法配置：回落到默认上限，不能变成"一次都不重载"
    const zero = createLoadGuard({ maxRenderReloads: 0 })
    expect(zero.recordRenderGone().action).toBe('reload')
    expect(MAX_RENDER_RELOADS).toBe(3)
  })

  it('一次成功加载即复位：之后的崩溃重新计数', () => {
    const guard = createLoadGuard({ maxRenderReloads: 2 })
    guard.recordRenderGone()
    guard.recordRenderGone()
    expect(guard.recordRenderGone().action).toBe('dialog')
    guard.reset()
    expect(guard.counts()).toEqual({ loadFails: 0, renderGones: 0 })
    expect(guard.recordRenderGone().action).toBe('reload')
  })

  it('界面加载失败从不自动重试，总是找用户拿指示', () => {
    const guard = createLoadGuard()
    expect(guard.recordLoadFail()).toEqual({ count: 1, action: 'dialog' })
    expect(guard.recordLoadFail()).toEqual({ count: 2, action: 'dialog' })
    guard.reset()
    expect(guard.recordLoadFail()).toEqual({ count: 1, action: 'dialog' })
  })

  it('窗口原生背景色按深浅色给中性灰，不再用默认纯白', () => {
    expect(resolveWindowBackgroundColor(true)).toBe('#1a1a1a')
    expect(resolveWindowBackgroundColor(false)).toBe('#f0f0f0')
    // 深色那一档必须真的是深色，否则白闪问题没修
    expect(SHOW_FALLBACK_MS).toBeGreaterThan(0)
  })
})
