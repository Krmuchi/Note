import { describe, it, expect } from 'vitest'
import {
  ON_DARK_TEXT,
  ON_LIGHT_TEXT,
  contrastRatio,
  parseHex,
  readableTextColor,
  relativeLuminance,
} from '@/utils/color'

describe('parseHex', () => {
  it('支持 #rrggbb 与 #rgb，大小写与 # 可选', () => {
    expect(parseHex('#1677FF')).toEqual({ r: 0x16, g: 0x77, b: 0xff })
    expect(parseHex('1677ff')).toEqual({ r: 0x16, g: 0x77, b: 0xff })
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('非法输入返回 null', () => {
    expect(parseHex('rgb(1,2,3)')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
    expect(parseHex('')).toBeNull()
  })
})

describe('relativeLuminance / contrastRatio', () => {
  it('黑白两端的亮度与对比度符合 WCAG 定义', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })

  it('对比度与参数顺序无关', () => {
    expect(contrastRatio('#1677ff', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#1677ff'), 5)
  })
})

describe('readableTextColor', () => {
  it('深色主色（默认蓝）配白字', () => {
    expect(readableTextColor('#1677ff')).toBe(ON_DARK_TEXT)
  })

  it('浅色主色配深色字 —— 这正是"金色/青色预设下按钮看不清"的修复', () => {
    expect(readableTextColor('#faad14')).toBe(ON_LIGHT_TEXT)
    expect(readableTextColor('#13c2c2')).toBe(ON_LIGHT_TEXT)
    expect(readableTextColor('#ffff00')).toBe(ON_LIGHT_TEXT)
  })

  it('选出的文字颜色一定满足最低可读性（3:1）', () => {
    const presets = ['#1677ff', '#52c41a', '#ff4d4f', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2', '#faad14', '#000000', '#ffffff', '#808080']
    for (const bg of presets) {
      expect(contrastRatio(bg, readableTextColor(bg))).toBeGreaterThanOrEqual(3)
    }
  })

  it('无法解析的背景回落到白字（不抛错）', () => {
    expect(readableTextColor('var(--primary-500)')).toBe(ON_DARK_TEXT)
  })
})
