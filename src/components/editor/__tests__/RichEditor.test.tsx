import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { RichEditor } from '@/components/editor/RichEditor'
import type { NoteDoc } from '@/types'

/**
 * RichEditor 的行为测试。
 *
 * 重点验证三件容易出错的事：
 * 1. 初始渲染把 Markdown 变成 HTML（标题/列表/加粗都可见）
 * 2. 输入即时转换（打 `# ` 变标题、`- ` 变列表）
 * 3. 回写：内容变化时上抛的是 Markdown，且与原始源一致
 */

const makeDoc = (content: string): NoteDoc => ({
  id: 'doc-1',
  title: '测试文档',
  content,
  parentId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tags: [],
  favorite: false,
  pinned: false,
  versions: [],
  comments: [],
  shareLinks: [],
})

function renderEditor(
  content: string,
  onChange = vi.fn(),
): { root: HTMLElement; onChange: typeof onChange; unmount: () => void } {
  const utils = render(
    <RichEditor activeDoc={makeDoc(content)} updateDocContent={onChange} fontSize="15px" />,
  )
  const root = utils.container.querySelector('.rich-editor') as HTMLElement
  return { root, onChange, unmount: utils.unmount }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('RichEditor 渲染', () => {
  it('把 Markdown 标题渲染成 h2', () => {
    const { root } = renderEditor('## 二级标题')
    expect(root.querySelector('h2')).not.toBeNull()
    expect(root.querySelector('h2')?.textContent).toBe('二级标题')
  })

  it('把 Markdown 列表渲染成 ul/li', () => {
    const { root } = renderEditor('- 甲\n- 乙')
    expect(root.querySelectorAll('ul > li')).toHaveLength(2)
  })

  it('把 Markdown 加粗渲染成 strong（所见即所得）', () => {
    const { root } = renderEditor('这是 **加粗** 文字')
    expect(root.querySelector('strong')?.textContent).toBe('加粗')
  })

  it('把 Markdown 链接渲染成 a', () => {
    const { root } = renderEditor('[文档](https://example.com)')
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://example.com')
  })

  it('代码块渲染为 pre/code 且可编辑', () => {
    const { root } = renderEditor('```js\nconst a = 1\n```')
    const code = root.querySelector('pre > code')
    expect(code).not.toBeNull()
    // 语雀式行为：代码块内容可直接编辑（旧实现 contenteditable=false，点进去打不了字）
    expect(code?.getAttribute('contenteditable')).toBeNull()
    expect(code?.textContent).toBe('const a = 1')
  })

  it('渲染后每个块都带 data-md（往返保真的依据）', () => {
    const { root } = renderEditor('# 标题\n\n段落')
    expect(root.querySelector('h1')?.getAttribute('data-md')).toBe('# 标题')
    expect(root.querySelector('p')?.getAttribute('data-md')).toBe('段落')
  })
})

/**
 * 模拟"在段落里输入文字"的真实流程：
 * 设置段落文本 → 把光标放到段落末尾 → 触发 input 事件。
 * 直接改 textContent 而不放光标，applyInputRule 里的 currentBlock 会返回 null。
 */
function typeIntoBlock(root: HTMLElement, block: HTMLElement, text: string): void {
  block.textContent = text
  const range = document.createRange()
  range.selectNodeContents(block)
  range.collapse(false)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
  fireEvent.input(root)
}

describe('RichEditor 输入即时转换', () => {
  it('段落里打 `# ` 转成 h1', () => {
    const { root, onChange } = renderEditor('')
    const p = root.querySelector('p') ?? root
    typeIntoBlock(root, p, '# ')

    expect(root.querySelector('h1')).not.toBeNull()
    expect(onChange).toHaveBeenCalled()
  })

  it('段落里打 `- ` 转成列表', () => {
    const { root } = renderEditor('')
    const p = root.querySelector('p') ?? root
    typeIntoBlock(root, p, '- ')

    expect(root.querySelector('ul > li')).not.toBeNull()
  })

  it('`## 标题文字` 转成 h2 并保留文字', () => {
    const { root } = renderEditor('')
    const p = root.querySelector('p') ?? root
    typeIntoBlock(root, p, '## 标题文字')

    const h2 = root.querySelector('h2')
    expect(h2).not.toBeNull()
    expect(h2?.textContent).toBe('标题文字')
  })

  it('`1. 第一项` 转成有序列表', () => {
    const { root } = renderEditor('')
    const p = root.querySelector('p') ?? root
    typeIntoBlock(root, p, '1. 第一项')

    expect(root.querySelector('ol > li')?.textContent).toBe('第一项')
  })

  it('段落里打 `---` 转成分割线', () => {
    const { root } = renderEditor('')
    const p = root.querySelector('p') ?? root
    typeIntoBlock(root, p, '---')

    expect(root.querySelector('hr')).not.toBeNull()
  })

  it('普通文字不触发转换', () => {
    const { root } = renderEditor('')
    const p = root.querySelector('p') ?? root
    typeIntoBlock(root, p, '这是一句普通的话')

    expect(root.querySelector('h1')).toBeNull()
    expect(root.querySelector('ul')).toBeNull()
  })
})

describe('RichEditor 回写', () => {
  it('内容变化时上抛的是 Markdown 而非 HTML', () => {
    const onChange = vi.fn()
    const { root } = renderEditor('原文', onChange)

    const p = root.querySelector('p')!
    p.textContent = '改过的内容'
    fireEvent.input(root)

    expect(onChange).toHaveBeenCalled()
    const payload = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(payload.content).toBe('改过的内容')
    // 不能把 HTML 标签写进 content
    expect(payload.content).not.toContain('<p')
  })

  it('未改动时回写的 Markdown 与原文一致（不破坏文档）', () => {
    const onChange = vi.fn()
    const { root } = renderEditor('# 标题\n\n一段 **加粗** 文字', onChange)

    // 只触发一次 input，但没有实际改动 DOM
    fireEvent.input(root)

    // 内容与 doc.content 相同 → 不应触发更新
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('RichEditor 键盘行为', () => {
  it('空列表项上按 Enter 退出列表（变回段落）', () => {
    const { root } = renderEditor('- 甲')
    const li = root.querySelector('li')!
    li.textContent = ''

    // 把光标放进空 li
    const range = document.createRange()
    range.selectNodeContents(li)
    range.collapse(true)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.keyDown(root, { key: 'Enter' })

    expect(root.querySelector('ul')).toBeNull()
    expect(root.querySelector('p')).not.toBeNull()
  })

  it('非空列表项上按 Enter 新建同级项', () => {
    const { root } = renderEditor('- 甲')
    const li = root.querySelector('li')!

    const range = document.createRange()
    range.selectNodeContents(li)
    range.collapse(false)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.keyDown(root, { key: 'Enter' })

    expect(root.querySelectorAll('li')).toHaveLength(2)
  })
})

describe('RichEditor 粘贴', () => {
  it('粘贴按纯文本插入，不带入外部 HTML 结构', () => {
    const { root } = renderEditor('')
    const p = root.querySelector('p') ?? root

    const range = document.createRange()
    range.selectNodeContents(p)
    range.collapse(false)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.paste(root, {
      clipboardData: {
        getData: (type: string) => (type === 'text/plain' ? '粘贴的文字' : '<b>粘贴的文字</b>'),
      },
    })

    // 不应出现外部带来的 b 标签
    expect(root.querySelector('b')).toBeNull()
  })
})
