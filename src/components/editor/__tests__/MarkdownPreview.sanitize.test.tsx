import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MarkdownPreview } from '@/components/editor/MarkdownPreview'
import { parseSafeStyle, sanitizeCssStyle } from '@/utils/previewSanitize'

/**
 * 预览消毒安全基线测试。
 *
 * 预览内容可能来自网页粘贴、导入的 .md 或他人给的备份文件，
 * 这些内容里的 HTML 不可信，必须被消毒后再进入 DOM。
 */
describe('MarkdownPreview - 不可信内容消毒', () => {
  it('丢弃 <script> 及其内容', () => {
    const { container } = render(
      <MarkdownPreview content={'正常文字<script>window.__pwned = 1</script>'} />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).not.toContain('__pwned')
  })

  it('丢弃事件处理属性', () => {
    const { container } = render(
      <MarkdownPreview content={'<img src="data:image/png;base64,iVBORw0KGgo=" onerror="window.__pwned=1">'} />,
    )
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('onerror')).toBeNull()
  })

  it('丢弃 javascript: 链接协议', () => {
    const { container } = render(
      <MarkdownPreview content={'[点我](javascript:alert(1))'} />,
    )
    const link = container.querySelector('a')
    // 协议不合法时 href 被清除（元素保留但不可点击跳转）
    expect(link?.getAttribute('href') ?? '').not.toContain('javascript:')
  })

  it('丢弃 <iframe>、<style> 等标签的内容，避免降级文本漏进正文', () => {
    const { container } = render(
      <MarkdownPreview content={'<iframe src="https://evil.test"></iframe><style>body{display:none}</style>正文'} />,
    )
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.textContent).not.toContain('display:none')
    expect(container.textContent).toContain('正文')
  })

  it('丢弃非白名单标签上的 style（如 <p style="background:url(...)">）', () => {
    const { container } = render(
      <MarkdownPreview content={'<p style="background:url(https://evil.test/t.png)">段落</p>'} />,
    )
    const p = container.querySelector('p')
    expect(p?.textContent).toBe('段落')
    expect(p?.getAttribute('style')).toBeNull()
  })

  it('保留本地落盘图片的 file:// 与 data: 地址（否则预览里图片全部消失）', () => {
    const { container } = render(
      <MarkdownPreview
        content={'![本地](file:///C:/notes/images/a.png)\n\n![内联](data:image/png;base64,iVBORw0KGgo=)'}
      />,
    )
    const imgs = Array.from(container.querySelectorAll('img'))
    expect(imgs.length).toBe(2)
    expect(imgs[0].getAttribute('src')).toContain('file:///C:/notes/images/a.png')
    expect(imgs[1].getAttribute('src')).toContain('data:image/png;base64,')
  })

  it('消毒后 KaTeX 公式仍能正常渲染', () => {
    const { container } = render(<MarkdownPreview content={'质能关系 $E = mc^2$ 成立'} />)
    expect(container.querySelector('.katex')).toBeTruthy()
  })

  it('编辑器写入的颜色/高亮/对齐样式仍然生效', () => {
    const { container } = render(
      <MarkdownPreview
        content={'<span style="color:#ff0000">红</span>|<mark style="background-color:#fff3a0">亮</mark>|<div style="text-align:center">中</div>'}
      />,
    )
    expect(container.querySelector('span[style]')?.getAttribute('style')).toContain('rgb(255, 0, 0)')
    expect(container.querySelector('mark')?.getAttribute('style')).toContain('rgb(255, 243, 160)')
    expect(container.querySelector('div[style*="center"]')).toBeTruthy()
  })
})

describe('sanitizeCssStyle - 样式值白名单', () => {
  it('保留合法声明并丢弃未知属性', () => {
    expect(sanitizeCssStyle('color:#ff0000;position:fixed;font-size:20px')).toBe(
      'color:#ff0000;font-size:20px',
    )
  })

  it('丢弃外链、脚本与转义绕过写法', () => {
    expect(sanitizeCssStyle('background:url(https://evil.test/a.png)')).toBeUndefined()
    expect(sanitizeCssStyle('color:expression(alert(1))')).toBeUndefined()
    expect(sanitizeCssStyle('color:red\\;background:url(x)')).toBeUndefined()
    expect(sanitizeCssStyle('text-align:center/*x*/')).toBeUndefined()
  })

  it('超长样式串直接判定为异常输入', () => {
    expect(sanitizeCssStyle(`color:${'a'.repeat(400)}`)).toBeUndefined()
  })

  it('parseSafeStyle 对对象形态同样执行白名单过滤', () => {
    expect(parseSafeStyle({ color: '#ff0000', position: 'fixed', backgroundImage: 'url(x)' })).toEqual({
      color: '#ff0000',
    })
    expect(parseSafeStyle({})).toBeUndefined()
    expect(parseSafeStyle(undefined)).toBeUndefined()
  })
})
