import { describe, it, expect } from 'vitest'
import { stripDuplicateTitleHeading } from '@/utils/dedupeTitle'

/**
 * 合并"与标题逐字相同的首行 H1"。
 *
 * 这是**会改写用户内容**的操作，所以边界必须写死：
 * 只认首行、只认 1 级标题、只认逐字相同；任何不确定的情况都不动。
 */
describe('stripDuplicateTitleHeading', () => {
  it('首行同名 H1 被移除，正文保留', () => {
    expect(stripDuplicateTitleHeading('# 周报\n\n本周完成…', '周报')).toBe('本周完成…')
  })

  it('标题前后空白不影响判定', () => {
    expect(stripDuplicateTitleHeading('#  周报  \n\n正文', ' 周报 ')).toBe('正文')
  })

  it('文档只有这一行时返回空串（不是 null）', () => {
    expect(stripDuplicateTitleHeading('# 周报', '周报')).toBe('')
  })

  it('标题不同则不动', () => {
    expect(stripDuplicateTitleHeading('# 月报\n\n正文', '周报')).toBeNull()
  })

  it('不是首行则不动（正文中间的 H1 是结构，不是重复标题）', () => {
    expect(stripDuplicateTitleHeading('前言\n\n# 周报\n\n正文', '周报')).toBeNull()
  })

  it('2 级及以下标题不处理', () => {
    expect(stripDuplicateTitleHeading('## 周报\n\n正文', '周报')).toBeNull()
  })

  it('标题为空时不处理', () => {
    expect(stripDuplicateTitleHeading('# \n\n正文', '   ')).toBeNull()
  })

  it('缩进代码块不会被吃掉', () => {
    expect(stripDuplicateTitleHeading('# 周报\n\n    code', '周报')).toBe('    code')
  })

  it('只吃掉标题后的空行，不吞并正文首行', () => {
    expect(stripDuplicateTitleHeading('# 周报\n\n\n第二段', '周报')).toBe('第二段')
  })
})
