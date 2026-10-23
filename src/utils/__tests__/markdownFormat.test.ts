import { describe, it, expect } from 'vitest'
import { applyMarkdownFormat } from '@/utils/markdownFormat'

/**
 * 在 Markdown 源码上应用格式（新内核）。
 *
 * 这份实现替代了只认 textarea 的 `wrapSelection` ——
 * 若不正确，新内核下顶部工具栏的所有按钮都失效。
 * 语义必须与 textarea 版一致（已包裹则取消、包裹后选中内部文字），
 * 否则两种内核手感不同，用户切换后会困惑。
 */

describe('行内包裹格式', () => {
  it('加粗：包裹选中文字并选中内部', () => {
    const r = applyMarkdownFormat('这是文字', 2, 4, 'bold')!
    expect(r.content).toBe('这是**文字**')
    expect(r.start).toBe(4)
    expect(r.end).toBe(6)
  })

  it('加粗：已包裹则取消', () => {
    const r = applyMarkdownFormat('这是**文字**', 2, 8, 'bold')!
    expect(r.content).toBe('这是文字')
    expect(r.start).toBe(2)
    expect(r.end).toBe(4)
  })

  it('斜体用单星号', () => {
    const r = applyMarkdownFormat('文字', 0, 2, 'italic')!
    expect(r.content).toBe('*文字*')
  })

  it('删除线用双波浪', () => {
    const r = applyMarkdownFormat('文字', 0, 2, 'strike')!
    expect(r.content).toBe('~~文字~~')
  })

  it('行内代码用反引号', () => {
    const r = applyMarkdownFormat('文字', 0, 2, 'code')!
    expect(r.content).toBe('`文字`')
  })

  it('下划线用 u 标签', () => {
    const r = applyMarkdownFormat('文字', 0, 2, 'underline')!
    expect(r.content).toBe('<u>文字</u>')
  })

  it('空选区时插入标记并把光标放中间（接着打字即格式化内容）', () => {
    const r = applyMarkdownFormat('文字', 2, 2, 'bold')!
    expect(r.content).toBe('文字****')
    expect(r.start).toBe(4)
    expect(r.end).toBe(4)
  })

  it('颜色带参数', () => {
    const r = applyMarkdownFormat('文字', 0, 2, 'textColor', { color: '#ff0000' })!
    expect(r.content).toBe('<span style="color:#ff0000">文字</span>')
  })

  it('链接包裹', () => {
    const r = applyMarkdownFormat('文字', 0, 2, 'link')!
    expect(r.content).toBe('[文字](url)')
  })
})

describe('块级标记', () => {
  it('标题：行首插入 `# `', () => {
    const r = applyMarkdownFormat('文字', 1, 2, 'heading1')!
    expect(r.content).toBe('# 文字')
  })

  it('标题：已有标记则移除', () => {
    const r = applyMarkdownFormat('# 文字', 3, 4, 'heading1')!
    expect(r.content).toBe('文字')
  })

  it('切换标题级别：不叠加标记', () => {
    // `# 文字` 上加 h2，应得到 `## 文字` 而不是 `## # 文字`
    const r = applyMarkdownFormat('# 文字', 3, 4, 'heading2')!
    expect(r.content).toBe('## 文字')
  })

  it('无序列表：行首插入 `- `', () => {
    const r = applyMarkdownFormat('文字', 1, 2, 'ulist')!
    expect(r.content).toBe('- 文字')
  })

  it('只作用于光标所在行（多行文档不误伤其他行）', () => {
    const r = applyMarkdownFormat('第一行\n第二行', 5, 6, 'heading1')!
    expect(r.content).toBe('第一行\n# 第二行')
  })

  it('引用行首插入 `> `', () => {
    const r = applyMarkdownFormat('文字', 1, 2, 'quote')!
    expect(r.content).toBe('> 文字')
  })

  it('任务列表插入 `- [ ] `', () => {
    const r = applyMarkdownFormat('文字', 1, 2, 'tasklist')!
    expect(r.content).toBe('- [ ] 文字')
  })
})

describe('代码块与分割线', () => {
  it('代码块包裹选中内容', () => {
    const r = applyMarkdownFormat('code', 0, 4, 'codeblock')!
    expect(r.content).toBe('```\ncode\n```')
  })

  it('代码块带语言', () => {
    const r = applyMarkdownFormat('code', 0, 4, 'codeblock', { language: 'ts' })!
    expect(r.content).toBe('```ts\ncode\n```')
  })

  it('已包裹的代码块则取消', () => {
    const r = applyMarkdownFormat('```\ncode\n```', 4, 8, 'codeblock')!
    expect(r.content).toBe('code')
  })

  it('分割线插入', () => {
    const r = applyMarkdownFormat('文字', 2, 2, 'divider')!
    // 前后必须有空行：`文字\n---` 会被 Markdown 解析成标题（setext），不是分割线
    expect(r.content).toBe('文字\n\n---\n')
  })
})

describe('边界与未知类型', () => {
  it('未知类型返回 null（调用方回退到旧逻辑）', () => {
    expect(applyMarkdownFormat('文字', 0, 2, 'unknownType')).toBeNull()
  })

  it('空内容不抛错', () => {
    expect(() => applyMarkdownFormat('', 0, 0, 'bold')).not.toThrow()
  })

  it('选区超出内容长度不抛错', () => {
    expect(() => applyMarkdownFormat('文字', 0, 999, 'bold')).not.toThrow()
  })

  it('offset 在合法范围内不产生负值', () => {
    const r = applyMarkdownFormat('文字', 0, 2, 'bold')!
    expect(r.start).toBeGreaterThanOrEqual(0)
    expect(r.end).toBeGreaterThanOrEqual(r.start)
  })
})
