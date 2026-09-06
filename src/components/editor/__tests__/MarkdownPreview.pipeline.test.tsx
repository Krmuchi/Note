import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MarkdownPreview } from '@/components/editor/MarkdownPreview'

describe('MarkdownPreview - 编辑器 HTML 功能渲染', () => {
  it('渲染 <span style="color:..."> 为带色文字', () => {
    const { container } = render(
      <MarkdownPreview content={'前<span style="color:#ff0000">你好</span>后'} />,
    )
    const colored = container.querySelector('span[style]')
    console.log('SPAN HTML:', container.querySelector('.markdown-preview')?.innerHTML)
    expect(colored).toBeTruthy()
    expect(colored?.getAttribute('style')).toContain('rgb(255, 0, 0)')
    expect(colored?.textContent).toBe('你好')
  })

  it('渲染 <mark> 为高亮', () => {
    const { container } = render(
      <MarkdownPreview content={'前<mark style="background-color:#fff3a0">你好</mark>后'} />,
    )
    const marked = container.querySelector('mark')
    expect(marked).toBeTruthy()
    expect(marked?.getAttribute('style')).toContain('rgb(255, 243, 160)')
    expect(marked?.textContent).toBe('你好')
  })

  it('渲染 <u> 为下划线', () => {
    const { container } = render(
      <MarkdownPreview content={'<u>下划线文字</u>'} />,
    )
    const underlined = container.querySelector('u')
    expect(underlined).toBeTruthy()
    expect(underlined?.textContent).toBe('下划线文字')
  })

  it('HTML 与 Markdown 粗体混排时正确嵌套（旧占位符方案的泄露场景）', () => {
    const { container } = render(
      <MarkdownPreview content={'<u>**范德萨**</u>'} />,
    )
    const html = container.querySelector('.markdown-preview')?.innerHTML ?? ''
    // 不允许出现任何 ‡ 占位符残留
    expect(html).not.toContain('‡')
    // 下划线标签存在且内部粗体被解析
    const u = container.querySelector('u')
    expect(u).toBeTruthy()
    expect(u?.querySelector('strong')?.textContent).toBe('范德萨')
  })

  it('渲染对齐 div', () => {
    const { container } = render(
      <MarkdownPreview content={'<div style="text-align:center">居中文字</div>'} />,
    )
    const div = container.querySelector('div[style*="center"]')
    expect(div).toBeTruthy()
    expect(div?.textContent).toBe('居中文字')
  })

  it('渲染 <span style="font-size:..."> 为选区字号', () => {
    const { container } = render(
      <MarkdownPreview content={'前<span style="font-size:20px">大字</span>后'} />,
    )
    const sized = container.querySelector('span[style*="20px"]')
    expect(sized).toBeTruthy()
    expect(sized?.textContent).toBe('大字')
  })

  it('普通 Markdown 仍正常渲染', () => {
    const { container } = render(
      <MarkdownPreview content={'# 标题\n\n- 列表项\n\n**粗体**'} />,
    )
    expect(container.querySelector('h1')?.textContent).toBe('标题')
    expect(container.querySelector('li')?.textContent).toBe('列表项')
    expect(container.querySelector('strong')?.textContent).toBe('粗体')
  })
})
