import { describe, it, expect } from 'vitest'
import {
  HEADER_FOOTER_MIN_MARGIN,
  MARGIN_PRESETS,
  buildHeaderFooterTemplates,
  normalizeExportOptions,
} from '../../electron/ipc/export-options.cjs'

/** 导出 / 打印选项（C4/C5）：未知输入必须回落，不能把渲染进程的值直接透给打印接口。 */

describe('normalizeExportOptions', () => {
  it('缺省值是 A4 + 常规边距 + 无页眉页脚', () => {
    const options = normalizeExportOptions(undefined)
    expect(options.pageSize).toBe('A4')
    expect(options.margin).toBe('normal')
    expect(options.headerFooter).toBe(false)
    expect(options.margins).toEqual({
      top: MARGIN_PRESETS.normal,
      bottom: MARGIN_PRESETS.normal,
      left: MARGIN_PRESETS.normal,
      right: MARGIN_PRESETS.normal,
    })
  })

  it('接受合法的页面尺寸与边距预设', () => {
    const options = normalizeExportOptions({ pageSize: 'A3', margin: 'wide' })
    expect(options.pageSize).toBe('A3')
    expect(options.margins.left).toBe(MARGIN_PRESETS.wide)
  })

  it('非法值回落到默认，而不是抛错', () => {
    const options = normalizeExportOptions({ pageSize: 'A0', margin: 'huge', headerFooter: 'yes' })
    expect(options.pageSize).toBe('A4')
    expect(options.margin).toBe('normal')
    expect(options.headerFooter).toBe(false)
  })

  it('非对象输入也能安全处理', () => {
    expect(normalizeExportOptions(null).pageSize).toBe('A4')
    expect(normalizeExportOptions('A3').margin).toBe('normal')
  })

  it('开启页眉页脚时上下边距被抬到最小值（否则页码会压在正文上）', () => {
    const options = normalizeExportOptions({ margin: 'narrow', headerFooter: true })
    expect(options.margins.top).toBe(HEADER_FOOTER_MIN_MARGIN)
    expect(options.margins.bottom).toBe(HEADER_FOOTER_MIN_MARGIN)
    // 左右仍用用户选择的窄边距
    expect(options.margins.left).toBe(MARGIN_PRESETS.narrow)
  })

  it('已经足够宽的边距不会被压缩', () => {
    const options = normalizeExportOptions({ margin: 'wide', headerFooter: true })
    expect(options.margins.top).toBe(MARGIN_PRESETS.wide)
  })
})

describe('buildHeaderFooterTemplates', () => {
  it('页眉包含标题、页脚包含页码占位符', () => {
    const { headerTemplate, footerTemplate } = buildHeaderFooterTemplates('会议纪要')
    expect(headerTemplate).toContain('会议纪要')
    expect(footerTemplate).toContain('class="pageNumber"')
    expect(footerTemplate).toContain('class="totalPages"')
  })

  it('标题里的 HTML 会被转义（不能注入到打印页面）', () => {
    const { headerTemplate } = buildHeaderFooterTemplates('<img src=x onerror=alert(1)>')
    expect(headerTemplate).not.toContain('<img')
    expect(headerTemplate).toContain('&lt;img')
  })

  it('非字符串标题不报错', () => {
    expect(() => buildHeaderFooterTemplates(undefined)).not.toThrow()
    expect(buildHeaderFooterTemplates(undefined).headerTemplate).toContain('class="title"')
  })
})
