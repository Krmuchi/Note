import { describe, it, expect } from 'vitest'
import { markdownToEditorHtml } from '@/utils/markdownToHtml'
import { editorHtmlToMarkdown } from '@/utils/editorHtmlToMarkdown'

/**
 * 图片尺寸的往返。
 *
 * Markdown 没有图片尺寸语法，所以"调过宽度"的图片写成
 * `<img src alt width>`；没调过的必须**保持** `![alt](src)`，
 * 否则用户只是打开文档，源码就会被整体改写成 HTML。
 */

function roundTrip(md: string): string {
  const root = document.createElement('div')
  root.innerHTML = markdownToEditorHtml(md)
  return editorHtmlToMarkdown(root)
}

describe('图片尺寸', () => {
  it('未调宽度：仍是 Markdown 语法', () => {
    expect(roundTrip('![示意图](a.png)')).toBe('![示意图](a.png)')
  })

  it('调过宽度：写成带 width 的 img，并逐字节往返', () => {
    const md = '<img src="a.png" alt="示意图" width="320">'
    expect(roundTrip(md)).toBe(md)
  })

  it('带 width 的 img 渲染后保留宽度属性', () => {
    const html = markdownToEditorHtml('<img src="a.png" alt="x" width="320">')
    const root = document.createElement('div')
    root.innerHTML = html
    const img = root.querySelector('img')
    expect(img?.getAttribute('width')).toBe('320')
    expect(img?.getAttribute('src')).toBe('a.png')
  })

  it('拖拽后只改 style.width 也能回写成 HTML', () => {
    const root = document.createElement('div')
    root.innerHTML = markdownToEditorHtml('![x](a.png)')
    const img = root.querySelector('img')!
    img.style.width = '280px'
    expect(editorHtmlToMarkdown(root)).toBe('<img src="a.png" alt="x" width="280">')
  })

  it('恢复原始尺寸后回到 Markdown 语法', () => {
    const root = document.createElement('div')
    root.innerHTML = markdownToEditorHtml('<img src="a.png" alt="x" width="320">')
    const img = root.querySelector('img')!
    img.removeAttribute('width')
    img.removeAttribute('height')
    img.style.removeProperty('width')
    expect(editorHtmlToMarkdown(root)).toBe('![x](a.png)')
  })
})
