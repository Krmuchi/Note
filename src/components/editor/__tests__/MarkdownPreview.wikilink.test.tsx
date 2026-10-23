import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { MarkdownPreview } from '@/components/editor/MarkdownPreview'

/** 预览里的 [[双链]]（K1）：渲染成按钮并回调标题。 */

describe('MarkdownPreview - 双链', () => {
  it('渲染为可点击按钮并回传标题', () => {
    const onWikiLink = vi.fn()
    const { container } = render(
      <MarkdownPreview content={'见 [[项目计划]] 了解详情'} onWikiLink={onWikiLink} />,
    )

    const link = container.querySelector('button.wiki-link')
    expect(link).toBeTruthy()
    expect(link?.textContent).toBe('项目计划')

    fireEvent.click(link as HTMLElement)
    expect(onWikiLink).toHaveBeenCalledWith('项目计划')
  })

  it('普通链接仍然是新窗口打开的 <a>，不会被当成双链', () => {
    const { container } = render(<MarkdownPreview content={'[外链](https://example.com)'} />)
    const anchor = container.querySelector('a')
    expect(anchor?.getAttribute('href')).toBe('https://example.com')
    expect(container.querySelector('button.wiki-link')).toBeNull()
  })

  it('代码块里的 [[x]] 不转换（不能被当成引用）', () => {
    const code = '```ts\nconst x = "[[不是双链]]"\n```'
    const { container } = render(<MarkdownPreview content={code} />)
    expect(container.querySelector('button.wiki-link')).toBeNull()
    expect(container.textContent).toContain('[[不是双链]]')
  })

  it('未提供 onWikiLink 时按钮仍在但不报错', () => {
    const { container } = render(<MarkdownPreview content={'[[某文档]]'} />)
    const link = container.querySelector('button.wiki-link')
    expect(link).toBeTruthy()
    expect(() => fireEvent.click(link as HTMLElement)).not.toThrow()
  })
})
