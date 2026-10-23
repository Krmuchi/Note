import { describe, it, expect, beforeEach } from 'vitest'
import {
  isRichEditorEnabled,
  setRichEditorEnabled,
  clearRichEditorFlag,
} from '@/utils/richEditorFlag'

/**
 * 富文本内核开关。
 *
 * 默认值从"关闭"翻转为"开启"后，存储语义必须跟着改：
 * 旧写法是「存 '1' = 开、删除 = 关」。默认开启后再用删除表示关闭，
 * 会变成「删除 = 恢复默认 = 开启」—— 用户**永远关不掉**。
 * 这组测试锁住"关闭必须显式写入 '0'"这一契约。
 */

const KEY = 'notes-rich-editor'

beforeEach(() => {
  localStorage.clear()
})

describe('默认值', () => {
  it('无存储时默认开启', () => {
    expect(isRichEditorEnabled()).toBe(true)
  })

  it('存了 1 视为开启（兼容旧版本写入的值）', () => {
    localStorage.setItem(KEY, '1')
    expect(isRichEditorEnabled()).toBe(true)
  })

  it('存了 0 视为关闭', () => {
    localStorage.setItem(KEY, '0')
    expect(isRichEditorEnabled()).toBe(false)
  })
})

describe('setRichEditorEnabled', () => {
  it('关闭时显式写入 0（不能靠删除键，否则会回落到默认开启）', () => {
    setRichEditorEnabled(false)
    expect(localStorage.getItem(KEY)).toBe('0')
    expect(isRichEditorEnabled()).toBe(false)
  })

  it('开启时清掉存储，回到默认', () => {
    setRichEditorEnabled(false)
    setRichEditorEnabled(true)
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(isRichEditorEnabled()).toBe(true)
  })

  it('关闭 → 开启 → 关闭 能正确往返（用户可反复切换）', () => {
    setRichEditorEnabled(false)
    expect(isRichEditorEnabled()).toBe(false)
    setRichEditorEnabled(true)
    expect(isRichEditorEnabled()).toBe(true)
    setRichEditorEnabled(false)
    expect(isRichEditorEnabled()).toBe(false)
  })
})

describe('clearRichEditorFlag', () => {
  it('重置后回到默认（开启）', () => {
    setRichEditorEnabled(false)
    clearRichEditorFlag()
    expect(isRichEditorEnabled()).toBe(true)
  })
})

describe('存储不可用时', () => {
  it('读取失败按默认值（开启）处理，不抛错', () => {
    // 模拟隐私模式下 localStorage 抛错
    const original = localStorage.getItem
    localStorage.getItem = () => {
      throw new Error('denied')
    }
    expect(() => isRichEditorEnabled()).not.toThrow()
    expect(isRichEditorEnabled()).toBe(true)
    localStorage.getItem = original
  })
})
