import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MarkdownPreview } from '@/components/editor/MarkdownPreview'

describe('MarkdownPreview - 文字颜色/高亮管线', () => {
  it('渲染 <span style="color:..."> 为带色文字', () => {
    const { container } = render(
      <MarkdownPreview content={'前<span style="color:#ff0000">你好</span>后'} />,
    )
    const colored = container.querySelector('span[style]')
    // eslint-disable-next-line no-console
    console.log('HTML:', container.querySelector('.markdown-preview')?.innerHTML)
    expect(colored).toBeTruthy()
    expect(colored?.getAttribute('style')).toContain('rgb(255, 0, 0)')
    expect(colored?.textContent).toBe('你好')
  })

  it('渲染 <mark> 为高亮', () => {
    const { container } = render(
      <MarkdownPreview content={'前<mark style="background-color:#fff3a0">你好</mark>后'} />,
    )
    const marked = container.querySelector('mark')
    console.log('HTML:', container.querySelector('.markdown-preview')?.innerHTML)
    expect(marked).toBeTruthy()
    expect(marked?.textContent).toBe('你好')
  })
})
