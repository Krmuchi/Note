import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createWindowStateStore,
  resolveWindowBounds,
  DEFAULT_BOUNDS,
  MIN_BOUNDS,
} from '../../electron/window-state.cjs'

/**
 * 窗口位置/大小记忆（体验优化方案 P1）。
 * 关键保证：恢复到"已经不存在的显示器"上的坐标必须被丢弃，否则用户会以为应用没打开。
 */

const singleDisplay = [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }]

describe('resolveWindowBounds', () => {
  it('无历史状态时返回默认尺寸', () => {
    expect(resolveWindowBounds(null, singleDisplay)).toEqual({ width: DEFAULT_BOUNDS.width, height: DEFAULT_BOUNDS.height })
  })

  it('保留仍在显示器工作区内的位置与大小', () => {
    expect(resolveWindowBounds({ x: 100, y: 80, width: 1200, height: 800 }, singleDisplay)).toEqual({
      x: 100,
      y: 80,
      width: 1200,
      height: 800,
    })
  })

  it('坐标落在已拔掉的外接屏上时丢弃坐标、只保留尺寸', () => {
    const result = resolveWindowBounds({ x: 3000, y: 200, width: 1200, height: 800 }, singleDisplay)
    expect(result).toEqual({ width: 1200, height: 800 })
    expect('x' in result).toBe(false)
  })

  it('尺寸小于下限时钳制到最小值', () => {
    const result = resolveWindowBounds({ x: 10, y: 10, width: 200, height: 100 }, singleDisplay)
    expect(result.width).toBe(MIN_BOUNDS.width)
    expect(result.height).toBe(MIN_BOUNDS.height)
  })

  it('显示器列表为空（极端情况）时不套用坐标', () => {
    expect(resolveWindowBounds({ x: 0, y: 0, width: 1200, height: 800 }, [])).toEqual({ width: 1200, height: 800 })
  })
})

describe('createWindowStateStore', () => {
  let tmpDir = ''

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-window-state-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('写入后能读回同一份状态', () => {
    const store = createWindowStateStore({ dir: tmpDir, displays: () => singleDisplay })
    expect(store.write({ x: 40, y: 50, width: 1100, height: 760, maximized: false })).toBe(true)
    expect(store.read()).toMatchObject({ x: 40, y: 50, width: 1100, height: 760 })
    expect(store.readBounds()).toEqual({ x: 40, y: 50, width: 1100, height: 760 })
  })

  it('文件不存在或损坏时读为空且回落到默认尺寸', () => {
    const store = createWindowStateStore({ dir: tmpDir, displays: () => singleDisplay })
    expect(store.read()).toBeNull()
    expect(store.readBounds()).toEqual({ width: DEFAULT_BOUNDS.width, height: DEFAULT_BOUNDS.height })

    fs.writeFileSync(store.file, '{ broken', 'utf-8')
    expect(store.read()).toBeNull()
    expect(store.readBounds()).toEqual({ width: DEFAULT_BOUNDS.width, height: DEFAULT_BOUNDS.height })
  })

  it('记录最大化标记', () => {
    const store = createWindowStateStore({ dir: tmpDir, displays: () => singleDisplay })
    expect(store.readMaximized()).toBe(false)
    store.write({ x: 0, y: 0, width: 1200, height: 800, maximized: true })
    expect(store.readMaximized()).toBe(true)
  })

  it('写盘失败时不抛错（只记日志）', () => {
    const failingFs = { writeFileSync: () => { throw new Error('EACCES') }, readFileSync: () => { throw new Error('ENOENT') } }
    const store = createWindowStateStore({ dir: tmpDir, displays: () => singleDisplay, fsSync: failingFs })
    expect(store.write({ width: 1 })).toBe(false)
    expect(store.read()).toBeNull()
  })
})
