import { describe, it, expect } from 'vitest'
// 直接加载 CJS 模块（Electron 主进程导出逻辑与渲染端共用同一实现路径）
import { markdownToSimpleHtml, escapeHtml } from '../../electron/ipc/shared.cjs'

describe('markdownToSimpleHtml - 导出 HTML/PDF 共用转换', () => {
  it('标题 h1-h6', () => {
    const md = '# 一级\n## 二级\n### 三级\n#### 四级\n##### 五级\n###### 六级'
    expect(markdownToSimpleHtml(md)).toContain('<h1>一级</h1>')
    expect(markdownToSimpleHtml(md)).toContain('<h2>二级</h2>')
    expect(markdownToSimpleHtml(md)).toContain('<h3>三级</h3>')
    expect(markdownToSimpleHtml(md)).toContain('<h4>四级</h4>')
    expect(markdownToSimpleHtml(md)).toContain('<h5>五级</h5>')
    expect(markdownToSimpleHtml(md)).toContain('<h6>六级</h6>')
  })

  it('粗体 / 斜体 / 删除线 / 粗斜混排', () => {
    expect(markdownToSimpleHtml('**粗体**')).toContain('<strong>粗体</strong>')
    expect(markdownToSimpleHtml('*斜体*')).toContain('<em>斜体</em>')
    expect(markdownToSimpleHtml('~~删除~~')).toContain('<del>删除</del>')
    expect(markdownToSimpleHtml('***粗斜***')).toMatch(/<strong><em>粗斜<\/em><\/strong>|<em><strong>粗斜<\/strong><\/em>/)
  })

  it('行内代码内容不被行内格式二次替换', () => {
    const html = markdownToSimpleHtml('`**不是粗体**`')
    expect(html).toContain('<code>**不是粗体**</code>')
    expect(html).not.toContain('<strong>')
  })

  it('围栏代码块带语言类并转义内容', () => {
    const html = markdownToSimpleHtml('```js\nconst a = "<div>";\n```')
    expect(html).toContain('<pre><code class="language-js">')
    expect(html).toContain('const a = &quot;&lt;div&gt;&quot;;')
    // ~~~ 围栏也支持
    expect(markdownToSimpleHtml('~~~\ncode\n~~~')).toContain('<pre><code>code</code></pre>')
  })

  it('无序列表与一层嵌套', () => {
    const html = markdownToSimpleHtml('- 甲\n- 乙\n  - 乙一\n  - 乙二\n- 丙')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>甲</li>')
    // 嵌套子列表位于"乙"的 <li> 内
    expect(html).toMatch(/<li>乙<ul><li>乙一<\/li><li>乙二<\/li><\/ul><\/li>/)
    expect(html).toContain('<li>丙</li>')
  })

  it('有序列表', () => {
    const html = markdownToSimpleHtml('1. 第一\n2. 第二')
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>第一</li>')
    expect(html).toContain('<li>第二</li>')
  })

  it('任务列表：已勾选与未勾选（disabled checkbox）', () => {
    const html = markdownToSimpleHtml('- [ ] 待办\n- [x] 已办')
    expect(html).toContain('<input type="checkbox" disabled> 待办')
    expect(html).toContain('<input type="checkbox" disabled checked> 已办')
  })

  it('GFM 表格（含分隔行与对齐）', () => {
    const html = markdownToSimpleHtml('| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 3 |')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>名称</th>')
    expect(html).toContain('<td style="text-align:right">3</td>')
    expect(html).toContain('<td>苹果</td>')
  })

  it('blockquote 连续行聚合', () => {
    const html = markdownToSimpleHtml('> 第一行\n> 第二行')
    expect(html).toMatch(/<blockquote>.*第一行.*第二行.*<\/blockquote>/s)
    expect(html.match(/<blockquote>/g)?.length).toBe(1)
  })

  it('链接与图片', () => {
    expect(markdownToSimpleHtml('[首页](https://example.com)')).toContain(
      '<a href="https://example.com">首页</a>',
    )
    expect(markdownToSimpleHtml('![描述](img.png)')).toContain('<img src="img.png" alt="描述">')
  })

  it('整行对齐 div（编辑器 setAlignment 产出的单行格式）', () => {
    const html = markdownToSimpleHtml('<div style="text-align:center">居中文字</div>')
    expect(html).toContain('<div style="text-align:center">')
    expect(html).toContain('居中文字')
  })

  it('编辑器行内 HTML 白名单放行：<u>、<mark style>、<span style>、<br>', () => {
    expect(markdownToSimpleHtml('<u>下划线</u>')).toContain('<u>下划线</u>')
    expect(markdownToSimpleHtml('<mark style="background-color:#fff3a0">高亮</mark>')).toContain(
      '<mark style="background-color:#fff3a0">高亮</mark>',
    )
    expect(markdownToSimpleHtml('<span style="color:#ff0000">红字</span>')).toContain(
      '<span style="color:#ff0000">红字</span>',
    )
    expect(markdownToSimpleHtml('a<br>b')).toContain('a<br>b')
  })

  it('非白名单 HTML 一律转义（导出安全）', () => {
    const html = markdownToSimpleHtml('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    // 带非 style 属性的标签同样转义（孤立闭合标签无害，开标签必须被转义）
    const html2 = markdownToSimpleHtml('<span onclick="x()">点</span>')
    expect(html2).not.toContain('<span onclick')
    expect(html2).toContain('&lt;span onclick=')
  })

  it('空行分段 <p>', () => {
    const html = markdownToSimpleHtml('第一段\n\n第二段')
    expect(html).toContain('<p>第一段</p>')
    expect(html).toContain('<p>第二段</p>')
    expect(html).not.toContain('<br><br>')
  })

  it('分割线', () => {
    expect(markdownToSimpleHtml('---')).toContain('<hr>')
  })

  it('escapeHtml 基础行为', () => {
    expect(escapeHtml('<img src=x onerror=y>')).toBe(
      '&lt;img src=x onerror=y&gt;',
    )
  })
})
