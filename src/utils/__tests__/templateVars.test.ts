import { describe, it, expect } from 'vitest'
import { applyTemplateVars } from '@/utils/templateVars'

const fixed = new Date('2026-10-01T09:30:00')

describe('applyTemplateVars', () => {
  it('替换日期类占位符', () => {
    const out = applyTemplateVars('# {date} 会议', { now: fixed })
    expect(out).toContain('2026/10/1')
    expect(out).not.toContain('{date}')
  })

  it('替换周次与星期（沿用 ISO 周序号，与模板文案一致）', () => {
    const out = applyTemplateVars('第 {week} 周 {weekday}', { now: fixed })
    expect(out).not.toContain('{week}')
    expect(out).not.toContain('{weekday}')
    expect(out).toContain('星期四')
  })

  it('没有数据的字段给提示性默认值，绝不留占位符', () => {
    const out = applyTemplateVars('项目：{projectName}｜地点：{location}｜负责人：{host}', { now: fixed })
    expect(out).toBe('项目：项目名称｜地点：会议室｜负责人：主持人')
  })

  it('{title} 使用传入的标题', () => {
    expect(applyTemplateVars('「{title}」会议纪要', { now: fixed, title: '周会' })).toBe('「周会」会议纪要')
  })

  it('同一占位符出现多次会全部替换', () => {
    expect(applyTemplateVars('{date} - {date}', { now: fixed })).toBe('2026/10/1 - 2026/10/1')
  })

  it('没有占位符时原样返回', () => {
    expect(applyTemplateVars('纯文本内容', { now: fixed })).toBe('纯文本内容')
  })
})
