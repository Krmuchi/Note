import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from '@/utils/htmlToMarkdown'

describe('htmlToMarkdown - 剪贴板 HTML 转 Markdown', () => {
  it('标题转换', () => {
    expect(htmlToMarkdown('<h2>标题</h2>')).toBe('## 标题')
  })

  it('段落与加粗/斜体/删除线', () => {
    const html = '<p>普通 <strong>加粗</strong> <em>斜体</em> <del>删除</del></p>'
    expect(htmlToMarkdown(html)).toBe('普通 **加粗** *斜体* ~~删除~~')
  })

  it('无序列表与嵌套', () => {
    const html = '<ul><li>父项<ul><li>子项</li></ul></li><li>二项</li></ul>'
    expect(htmlToMarkdown(html)).toBe('- 父项\n  - 子项\n- 二项')
  })

  it('有序列表序号', () => {
    const html = '<ol><li>一</li><li>二</li></ol>'
    expect(htmlToMarkdown(html)).toBe('1. 一\n2. 二')
  })

  it('引用块逐行加前缀', () => {
    const html = '<blockquote><p>第一行</p><p>第二行</p></blockquote>'
    expect(htmlToMarkdown(html)).toBe('> 第一行\n> 第二行')
  })

  it('代码块保留语言与换行', () => {
    const html = '<pre><code class="language-js">const a = 1;\nconst b = 2;</code></pre>'
    expect(htmlToMarkdown(html)).toBe('```js\nconst a = 1;\nconst b = 2;\n```')
  })

  it('表格转 GFM 语法并转义竖线', () => {
    const html = '<table><tr><th>列1</th><th>列2</th></tr><tr><td>a|b</td><td>c</td></tr></table>'
    const md = htmlToMarkdown(html)
    expect(md).toBe('| 列1 | 列2 |\n| --- | --- |\n| a\\|b | c |')
  })

  it('链接与图片', () => {
    const html = '<p><a href="https://a.b">链接</a> <img src="https://x/y.png" alt="图"></p>'
    expect(htmlToMarkdown(html)).toBe('[链接](https://a.b) ![图](https://x/y.png)')
  })

  it('行内代码原样包裹', () => {
    expect(htmlToMarkdown('<p><code>const x</code></p>')).toBe('`const x`')
  })

  it('sup/sub/u/mark 原样保留为 HTML', () => {
    const html = '<p>x<sup>2</sup> <u>下划线</u> <mark>高亮</mark></p>'
    expect(htmlToMarkdown(html)).toBe('x<sup>2</sup> <u>下划线</u> <mark>高亮</mark>')
  })

  it('丢弃 script/style 与 span 样式', () => {
    const html = '<p><span style="color:red">红色</span><script>evil()</script></p>'
    expect(htmlToMarkdown(html)).toBe('红色')
  })

  it('纯行内片段（无块级标签）', () => {
    expect(htmlToMarkdown('你好 <b>世界</b>')).toBe('你好 **世界**')
  })

  it('空输入返回空串', () => {
    expect(htmlToMarkdown('')).toBe('')
    expect(htmlToMarkdown('<body></body>')).toBe('')
  })

  it('分割线', () => {
    expect(htmlToMarkdown('<hr>')).toBe('---')
  })
})
