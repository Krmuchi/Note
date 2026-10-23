import { describe, it, expect, beforeEach } from 'vitest'
import { markdownToEditorHtml, parseMarkdownBlocks, inlineMdToHtml } from '@/utils/markdownToHtml'
import { editorHtmlToMarkdown, blockElementToMd } from '@/utils/editorHtmlToMarkdown'

/**
 * Markdown ↔ 编辑器 HTML 的往返保真测试。
 *
 * 这是整个 contenteditable 方案的前提：编辑器每次输入都要把 HTML 转回 Markdown
 * 存盘，若往返有损，用户的文档会在**每次编辑时被悄悄改写**。
 * 所以这组测试必须先全绿，才允许动 UI。
 */

/** 模拟编辑器容器：把 HTML 挂到一个真实 DOM 节点上（jsdom 提供） */
function mount(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

/** Markdown → HTML → Markdown */
function roundTrip(md: string): string {
  return editorHtmlToMarkdown(mount(markdownToEditorHtml(md)))
}

describe('往返保真（Markdown → HTML → Markdown）', () => {
  it('普通段落', () => {
    expect(roundTrip('这是一段普通文字。')).toBe('这是一段普通文字。')
  })

  it('多段落保持分隔', () => {
    const md = '第一段。\n\n第二段。'
    expect(roundTrip(md)).toBe(md)
  })

  it('各级标题', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const md = `${'#'.repeat(level)} 标题文字`
      expect(roundTrip(md)).toBe(md)
    }
  })

  it('行内强调：加粗 / 斜体 / 删除线 / 行内代码', () => {
    expect(roundTrip('这是 **加粗** 文字')).toBe('这是 **加粗** 文字')
    expect(roundTrip('这是 *斜体* 文字')).toBe('这是 *斜体* 文字')
    expect(roundTrip('这是 ~~删除~~ 文字')).toBe('这是 ~~删除~~ 文字')
    expect(roundTrip('这是 `code` 片段')).toBe('这是 `code` 片段')
  })

  it('链接与图片', () => {
    expect(roundTrip('见 [文档](https://example.com/a)')).toBe('见 [文档](https://example.com/a)')
    expect(roundTrip('![图](https://example.com/a.png)')).toBe('![图](https://example.com/a.png)')
  })

  it('无序列表', () => {
    const md = '- 第一项\n- 第二项\n- 第三项'
    expect(roundTrip(md)).toBe(md)
  })

  it('有序列表（含起始序号）', () => {
    expect(roundTrip('1. 甲\n2. 乙')).toBe('1. 甲\n2. 乙')
    expect(roundTrip('3. 丙\n4. 丁')).toBe('3. 丙\n4. 丁')
  })

  it('任务列表（含勾选状态）', () => {
    const md = '- [ ] 未完成\n- [x] 已完成'
    expect(roundTrip(md)).toBe(md)
  })

  it('引用块', () => {
    const md = '> 被引用的一行'
    expect(roundTrip(md)).toBe(md)
  })

  it('分割线', () => {
    expect(roundTrip('---')).toBe('---')
  })

  it('代码块（保留语言标记与内容）', () => {
    const md = '```ts\nconst a = 1\nconsole.log(a)\n```'
    expect(roundTrip(md)).toBe(md)
  })

  it('代码块内的特殊字符不被解析', () => {
    const md = '```\n**这不该加粗** <div> 也不该被当 HTML\n```'
    expect(roundTrip(md)).toBe(md)
  })

  it('表格', () => {
    const md = '| 列 A | 列 B |\n| --- | --- |\n| 1 | 2 |'
    expect(roundTrip(md)).toBe(md)
  })

  it('混合文档：标题 + 段落 + 列表 + 引用 + 代码', () => {
    const md = [
      '# 文档标题',
      '',
      '开头一段话，带 **加粗** 和 [链接](https://a.com)。',
      '',
      '## 小节',
      '',
      '- 要点一',
      '- 要点二',
      '',
      '> 一句引用',
      '',
      '```js',
      'const x = 1',
      '```',
    ].join('\n')
    expect(roundTrip(md)).toBe(md)
  })

  it('未编辑的块原样还原（data-md 优先）', () => {
    // 表格对齐、列表标记风格等"重新推导会变样"的内容，靠 data-md 保持原样
    const md = '| a | b |\n| :-- | --: |\n| 1 | 2 |'
    expect(roundTrip(md)).toBe(md)
  })
})

describe('块解析', () => {
  it('代码块内的空行不切断代码块', () => {
    const blocks = parseMarkdownBlocks('```\na\n\nb\n```')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('code')
  })

  it('围栏未闭合也能成块（用户正在输入时）', () => {
    const blocks = parseMarkdownBlocks('```js\nconst a = 1')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('code')
  })

  it('表格需要分隔行才判定为表格', () => {
    // 只有一行含 |，没有分隔行 → 应视为段落
    expect(parseMarkdownBlocks('a | b')[0].type).toBe('paragraph')
    expect(parseMarkdownBlocks('a | b\n--- | ---')[0].type).toBe('table')
  })

  it('任务列表优先于普通无序列表', () => {
    expect(parseMarkdownBlocks('- [ ] 待办')[0].type).toBe('tasklist')
    expect(parseMarkdownBlocks('- 普通项')[0].type).toBe('ulist')
  })

  it('空行被跳过，不产生空块', () => {
    expect(parseMarkdownBlocks('a\n\n\n\nb')).toHaveLength(2)
  })
})

describe('行内转换', () => {
  it('代码优先于强调（避免代码内的 * 被当强调）', () => {
    const html = inlineMdToHtml('`a*b*c`')
    expect(html).toBe('<code>a*b*c</code>')
  })

  it('链接内的字符不被当强调', () => {
    const html = inlineMdToHtml('[x](https://a.com/*p*)')
    expect(html).toContain('href="https://a.com/*p*"')
  })

  it('HTML 特殊字符被转义（防止注入）', () => {
    const html = inlineMdToHtml('a < b & c > d')
    expect(html).toBe('a &lt; b &amp; c &gt; d')
  })

  it('行内 HTML 标签原样保留', () => {
    expect(inlineMdToHtml('<u>下划线</u>')).toBe('<u>下划线</u>')
  })
})

describe('块级回写（用户编辑过的块）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('段落被编辑后按新内容回写', () => {
    // data-md 是旧的，DOM 已变 → 应重新推导
    const el = mount('<p data-md="旧内容">新内容</p>').firstElementChild!
    expect(blockElementToMd(el)).toBe('新内容')
  })

  it('标题被编辑后保留层级', () => {
    const el = mount('<h2 data-md="## 旧">新标题</h2>').firstElementChild!
    expect(blockElementToMd(el)).toBe('## 新标题')
  })

  it('块内容与 data-md 一致时优先用原文', () => {
    const el = mount('<p data-md="**加粗** 文字">加粗 文字</p>').firstElementChild!
    // 文本一致 → 返回原文（保住 ** 标记）
    expect(blockElementToMd(el)).toBe('**加粗** 文字')
  })
})
