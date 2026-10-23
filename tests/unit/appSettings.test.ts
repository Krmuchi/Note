import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_SETTINGS,
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  createAppSettingsStore,
  sanitizeSettings,
} from '../../electron/app-settings.cjs'

/** 应用级设置（主进程行为开关）：脏数据必须被挡住，缩放要夹在合理范围内。 */

let dir = ''

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-app-settings-'))
})

afterEach(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* 清理失败不影响断言 */
  }
})

describe('sanitizeSettings', () => {
  it('空输入返回默认值', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('只保留已知字段，类型不符的丢弃', () => {
    const result = sanitizeSettings({
      closeToTray: true,
      globalQuickNote: 'yes',
      autoLaunch: true,
      zoomFactor: '1.5',
      evil: true,
    })
    expect(result.closeToTray).toBe(true)
    expect(result.autoLaunch).toBe(true)
    expect(result.globalQuickNote).toBe(false)
    expect(result.zoomFactor).toBe(1)
    expect(result as Record<string, unknown>).not.toHaveProperty('evil')
  })

  it('缩放被夹在 [MIN_ZOOM, MAX_ZOOM]', () => {
    expect(sanitizeSettings({ zoomFactor: 99 }).zoomFactor).toBe(MAX_ZOOM)
    expect(sanitizeSettings({ zoomFactor: 0.01 }).zoomFactor).toBe(MIN_ZOOM)
    expect(sanitizeSettings({ zoomFactor: 1.25 }).zoomFactor).toBe(1.25)
  })
})

describe('clampZoom', () => {
  it('非法数值回落到默认', () => {
    expect(clampZoom(NaN)).toBe(DEFAULT_SETTINGS.zoomFactor)
    expect(clampZoom(Infinity)).toBe(DEFAULT_SETTINGS.zoomFactor)
    expect(clampZoom('1.5')).toBe(DEFAULT_SETTINGS.zoomFactor)
  })

  it('保留两位小数', () => {
    expect(clampZoom(1.23456)).toBe(1.23)
  })
})

describe('createAppSettingsStore', () => {
  it('首次读取（文件不存在）返回默认值且不抛错', () => {
    const store = createAppSettingsStore({ dir })
    expect(store.read()).toEqual(DEFAULT_SETTINGS)
  })

  it('写入后可读回，且只更新传入的字段', () => {
    const store = createAppSettingsStore({ dir })
    store.write({ autoLaunch: true })
    store.write({ zoomFactor: 1.25 })

    const settings = store.read()
    expect(settings.autoLaunch).toBe(true)
    expect(settings.zoomFactor).toBe(1.25)
    expect(settings.closeToTray).toBe(false)
  })

  it('文件损坏时回落默认值', () => {
    fs.writeFileSync(path.join(dir, 'app-settings.json'), '{ 坏掉的 json', 'utf-8')
    const store = createAppSettingsStore({ dir })
    expect(store.read()).toEqual(DEFAULT_SETTINGS)
  })

  it('写入失败返回 ok:false 而不是抛错', () => {
    const store = createAppSettingsStore({
      dir,
      fsSync: {
        readFileSync: () => {
          throw new Error('nope')
        },
        writeFileSync: () => {
          throw new Error('disk full')
        },
      },
    })
    const result = store.write({ autoLaunch: true })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
