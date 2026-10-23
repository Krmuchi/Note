import { describe, it, expect } from 'vitest'
import {
  MARGIN_PRESETS,
  PAGE_SIZES,
  normalizeExportOptions,
} from '../../electron/ipc/export-options.cjs'
import {
  DEFAULT_PDF_OPTIONS,
  PDF_MARGIN_PRESETS,
  PDF_PAGE_SIZES,
} from '@/utils/pdfOptions'

/**
 * 跨层契约（C4）：界面上的选项值必须被主进程认下。
 * 两边漂移的后果是"用户选了 A3，导出还是 A4"——而且不会有任何报错。
 */

describe('界面选项与主进程取值一致', () => {
  it('页面尺寸：界面的每个取值都在主进程白名单里', () => {
    const uiValues = PDF_PAGE_SIZES.map((item) => item.value)
    expect(uiValues.length).toBeGreaterThan(0)
    for (const value of uiValues) {
      expect(PAGE_SIZES).toContain(value)
    }
  })

  it('页面尺寸：主进程的每个取值界面上都能选到（否则用户拿不到该能力）', () => {
    const uiValues = PDF_PAGE_SIZES.map((item) => item.value)
    for (const value of PAGE_SIZES) {
      expect(uiValues).toContain(value)
    }
  })

  it('页边距预设：键集合完全一致', () => {
    const uiValues = PDF_MARGIN_PRESETS.map((item) => item.value).sort()
    expect(uiValues).toEqual(Object.keys(MARGIN_PRESETS).sort())
  })

  it('默认值经过主进程归一化后原样保留', () => {
    const normalized = normalizeExportOptions(DEFAULT_PDF_OPTIONS)
    expect(normalized.pageSize).toBe(DEFAULT_PDF_OPTIONS.pageSize)
    expect(normalized.margin).toBe(DEFAULT_PDF_OPTIONS.margin)
    expect(normalized.headerFooter).toBe(DEFAULT_PDF_OPTIONS.headerFooter)
  })

  it('界面上每一种组合都不会被主进程改成别的值', () => {
    for (const page of PDF_PAGE_SIZES) {
      for (const margin of PDF_MARGIN_PRESETS) {
        for (const headerFooter of [true, false]) {
          const normalized = normalizeExportOptions({
            pageSize: page.value,
            margin: margin.value,
            headerFooter,
          })
          expect(normalized.pageSize).toBe(page.value)
          expect(normalized.margin).toBe(margin.value)
          expect(normalized.headerFooter).toBe(headerFooter)
        }
      }
    }
  })
})
