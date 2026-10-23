import { describe, it, expect } from 'vitest'
import { markdownToEditorHtml, parseMarkdownBlocks } from '@/utils/markdownToHtml'
import { editorHtmlToMarkdown } from '@/utils/editorHtmlToMarkdown'

/**
 * 提示块（`> [!TIP]`）的解析、渲染与往返。
 *
 * 重点不是"能渲染出来"，而是**往返不能改写用户内容**：
 * 提示块的默认标题（"提示"）是 CSS 伪元素补的，不能进 DOM 文本 ——
 * 否则每次回写都会把它当成用户写的标题，文档被悄悄改写。
 */

function roundTrip(md: string): string {
  const root = document.createElement('div')
  root.innerHTML = markdownToEditorHtml(md)
  return editorHtmlToMarkdown(root)
}

describe('提示块：解析', () => {
  it('识别 [!tip] 并归为 callout 块', () => {
    const blocks = parseMarkdownBlocks('> [!tip]\n> 记得保存')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('callout')
    expect(blocks[0].callout).toBe('tip')
    expect(blocks[0].title).toBe('')
  })

  it('标记行可带标题', () => {
    const blocks = parseMarkdownBlocks('> [!warning] 小心\n> 这里会丢数据')
    expect(blocks[0].callout).toBe('warning')
    expect(blocks[0].title).toBe('小心')
  })

  it('别名归一到规范类型（info → note、error → danger）', () => {
    expect(parseMarkdownBlocks('> [!info]\n> x')[0].callout).toBe('note')
    expect(parseMarkdownBlocks('> [!error]\n> x')[0].callout).toBe('danger')
    expect(parseMarkdownBlocks('> [!CAUTION]\n> x')[0].callout).toBe('warning')
  })

  it('普通引用块不受影响', () => {
    const blocks = parseMarkdownBlocks('> 只是引用')
    expect(blocks[0].type).toBe('quote')
  })
})

describe('提示块：渲染', () => {
  it('渲染成带类型类名的 div', () => {
    const html = markdownToEditorHtml('> [!danger] 数据丢失\n> 请先备份')
    expect(html).toContain('class="md-callout md-callout-danger"')
    expect(html).toContain('data-callout="danger"')
    expect(html).toContain('数据丢失')
    expect(html).toContain('<p>请先备份</p>')
  })

  it('无标题时不把默认文案写进 DOM', () => {
    const html = markdownToEditorHtml('> [!tip]\n> 正文')
    const root = document.createElement('div')
    root.innerHTML = html
    const title = root.querySelector('.md-callout-title')
    expect(title?.textContent).toBe('')
    // 默认文案交给 CSS：data-label 提供文案，伪元素负责显示
    expect(title?.getAttribute('data-label')).toBe('提示')
  })
})

describe('提示块：往返', () => {
  it('带标题的提示块逐字节还原', () => {
    const md = '> [!warning] 小心\n> 这里会丢数据'
    expect(roundTrip(md)).toBe(md)
  })

  it('无标题的提示块不会凭空多出标题', () => {
    const md = '> [!tip]\n> 记得保存'
    expect(roundTrip(md)).toBe(md)
  })

  it('多段正文保持分行', () => {
    const md = '> [!note]\n> 第一段\n> 第二段'
    expect(roundTrip(md)).toBe(md)
  })

  it('提示块与相邻段落共存', () => {
    const md = '前言\n\n> [!success]\n> 完成\n\n后记'
    expect(roundTrip(md)).toBe(md)
  })

  it('修改正文后按新内容回写（不是照抄 data-md）', () => {
    const root = document.createElement('div')
    root.innerHTML = markdownToEditorHtml('> [!tip]\n> 旧内容')
    const p = root.querySelector('.md-callout p')!
    p.textContent = '新内容'
    expect(editorHtmlToMarkdown(root)).toBe('> [!tip]\n> 新内容')
  })
})
