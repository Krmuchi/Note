import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { RichEditor } from '@/components/editor/RichEditor'
import { useNotesStore } from '@/store'
import type { NoteDoc } from '@/types'

/*
 * jsdom 未实现 Range.getBoundingClientRect（syncSlash 用它取光标屏幕坐标）。
 * 真实浏览器里该方法存在；这里只在本文件内补零矩形桩，不动共享 tests/setup.ts。
 */
beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    writable: true,
    configurable: true,
    value: (): DOMRect =>
      ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  })
})

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

/* ---------------- 缺陷2/3/7 的回归 ---------------- */

/** 把光标放到元素文本末尾 */
function caretToEnd(el: Element): void {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

describe('RichEditor 撤销/重做强制重建（缺陷2）', () => {
  it('seq 变化时即使内容等于 lastWrittenRef 也重建 DOM（Ctrl+Z 后 Ctrl+Y）', () => {
    const onChange = vi.fn()
    const doc = makeDoc('abc')
    const utils = render(
      <RichEditor activeDoc={doc} updateDocContent={onChange} fontSize="15px" />,
    )
    const root = utils.container.querySelector('.rich-editor') as HTMLElement

    // 打字 abcX → commit，lastWrittenRef='abcX'
    const p = root.querySelector('p')!
    p.textContent = 'abcX'
    caretToEnd(p)
    fireEvent.input(root)
    expect(onChange).toHaveBeenCalledWith({ content: 'abcX' })

    // store 回流 abcX（== lastWrittenRef → 不重建，保光标）
    utils.rerender(
      <RichEditor activeDoc={{ ...doc, content: 'abcX' }} updateDocContent={onChange} fontSize="15px" />,
    )
    expect(root.textContent).toBe('abcX')

    // 模拟"撤销重建了 DOM 但 lastWrittenRef 未清"的旧状态（App 全局键盘路径）
    root.innerHTML = '<p><br></p>'

    // 重做：bump undoRedoSeq，内容仍等于 lastWrittenRef('abcX')
    act(() => {
      const { pushRedoSnapshot, popRedoSnapshot } = useNotesStore.getState()
      pushRedoSnapshot('doc-1', { title: '', content: 'abcX', tags: [] })
      popRedoSnapshot('doc-1')
    })
    utils.rerender(
      <RichEditor activeDoc={{ ...doc, content: 'abcX' }} updateDocContent={onChange} fontSize="15px" />,
    )
    // 必须重建：旧实现会因 lastWrittenRef===content 跳过，DOM 停在空段落
    expect(root.textContent).toBe('abcX')
  })
})

describe('RichEditor 输入法守卫（缺陷3）', () => {
  it('isComposing=true 的 Enter 不触发续列表', () => {
    const { root } = renderEditor('- 甲')
    caretToEnd(root.querySelector('li')!)
    fireEvent.keyDown(root, { key: 'Enter', isComposing: true })
    expect(root.querySelectorAll('li')).toHaveLength(1)
  })

  it('keyCode=229 的 Enter 不触发续列表', () => {
    const { root } = renderEditor('- 甲')
    caretToEnd(root.querySelector('li')!)
    fireEvent.keyDown(root, { key: 'Enter', keyCode: 229 })
    expect(root.querySelectorAll('li')).toHaveLength(1)
  })

  it('组合期间 input 不回写，compositionend 后补跑一次', () => {
    const { root, onChange } = renderEditor('')
    fireEvent.compositionStart(root)
    const p = root.querySelector('p')!
    p.textContent = 'nihao'
    caretToEnd(p)
    fireEvent.input(root)
    // 拼音未确认：不应回写脏快照
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.compositionEnd(root)
    expect(onChange).toHaveBeenCalledWith({ content: 'nihao' })
  })
})

describe('RichEditor 快捷键置位-消费与插行（缺陷7）', () => {
  const resolveBy = (map: Record<string, string>) => (combo: string[]): string | null =>
    map[combo.join('+')] ?? null

  it('Ctrl+Enter 在当前块下方插入空块', () => {
    const utils = render(
      <RichEditor
        activeDoc={makeDoc('第一段')}
        updateDocContent={vi.fn()}
        fontSize="15px"
        resolveShortcut={resolveBy({ 'ctrl+enter': 'insertLineBelow' })}
      />,
    )
    const root = utils.container.querySelector('.rich-editor') as HTMLElement
    caretToEnd(root.querySelector('p')!)
    fireEvent.keyDown(root, { key: 'Enter', ctrlKey: true })
    expect(root.querySelectorAll('p')).toHaveLength(2)
  })

  it('Ctrl+Shift+Enter 在当前块上方插入空块', () => {
    const utils = render(
      <RichEditor
        activeDoc={makeDoc('第一段')}
        updateDocContent={vi.fn()}
        fontSize="15px"
        resolveShortcut={resolveBy({ 'ctrl+shift+enter': 'insertLineAbove' })}
      />,
    )
    const root = utils.container.querySelector('.rich-editor') as HTMLElement
    caretToEnd(root.querySelector('p')!)
    fireEvent.keyDown(root, { key: 'Enter', ctrlKey: true, shiftKey: true })
    const ps = root.querySelectorAll('p')
    expect(ps).toHaveLength(2)
    // 新空块在上方
    expect(ps[0].textContent).toBe('')
  })

  it('Ctrl+Shift+V 后粘贴走纯文本，不带入 HTML 格式', () => {
    const onInsertMarkdown = vi.fn()
    const utils = render(
      <RichEditor
        activeDoc={makeDoc('')}
        updateDocContent={vi.fn()}
        fontSize="15px"
        resolveShortcut={resolveBy({ 'ctrl+shift+v': 'plainTextPaste' })}
        onInsertMarkdown={onInsertMarkdown}
      />,
    )
    const root = utils.container.querySelector('.rich-editor') as HTMLElement
    caretToEnd(root.querySelector('p')!)
    fireEvent.keyDown(root, { key: 'v', ctrlKey: true, shiftKey: true })
    fireEvent.paste(root, {
      clipboardData: {
        items: [],
        getData: (t: string) => (t === 'text/plain' ? '纯文本' : '<b>富文本</b>'),
      },
    })
    // 不应走 HTML→Markdown 分支
    expect(onInsertMarkdown).not.toHaveBeenCalled()
    expect(root.textContent).toContain('纯文本')
    expect(root.querySelector('b')).toBeNull()
  })

  it('Ctrl+Alt+C 复制选区的 Markdown 源码', () => {
    const utils = render(
      <RichEditor
        activeDoc={makeDoc('甲乙丙丁')}
        updateDocContent={vi.fn()}
        fontSize="15px"
        resolveShortcut={resolveBy({ 'ctrl+alt+c': 'copyAsMarkdown' })}
      />,
    )
    const root = utils.container.querySelector('.rich-editor') as HTMLElement
    const textNode = root.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 1)
    range.setEnd(textNode, 3)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.keyDown(root, { key: 'c', ctrlKey: true, altKey: true })
    const setData = vi.fn()
    fireEvent.copy(root, { clipboardData: { setData } })
    expect(setData).toHaveBeenCalledWith('text/plain', '乙丙')
  })
})

/*
 * 缺陷4：斜杠菜单残留。菜单打开（slashActive）期间监听 selectionchange，
 * 光标离开 token 即上报 null（'cursor' 源）让 Editor 关闭菜单。
 * 旧实现只在 input 时同步，点到别处不触发 input，菜单残留并劫持 Enter。
 */
describe('RichEditor 斜杠菜单 selectionchange 同步（缺陷4）', () => {
  /** 派发 selectionchange 并等待 rAF（effect 用 rAF 合并） */
  async function flushSelectionChange(): Promise<void> {
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
  }

  it('光标离开 token 后上报 null（cursor 源）以关闭菜单', async () => {
    const onSlashChange = vi.fn()
    const doc = makeDoc('')
    const utils = render(
      <RichEditor
        activeDoc={doc}
        updateDocContent={vi.fn()}
        fontSize="15px"
        onSlashChange={onSlashChange}
        slashActive={false}
      />,
    )
    const root = utils.container.querySelector('.rich-editor') as HTMLElement

    // 输入 '/' 唤出（input 源）
    const p = root.querySelector('p')!
    p.textContent = '/'
    caretToEnd(p)
    fireEvent.input(root)
    expect(onSlashChange).toHaveBeenCalledWith(expect.objectContaining({ query: '' }), 'input')

    // Editor 打开菜单 → slashActive=true，挂上 selectionchange 监听
    utils.rerender(
      <RichEditor
        activeDoc={doc}
        updateDocContent={vi.fn()}
        fontSize="15px"
        onSlashChange={onSlashChange}
        slashActive={true}
      />,
    )

    // 光标移到另一个没有斜杠的段落
    const p2 = document.createElement('p')
    p2.textContent = '别处'
    root.appendChild(p2)
    caretToEnd(p2)
    onSlashChange.mockClear()
    await flushSelectionChange()

    // 必须上报 null + 'cursor'，Editor 据此关闭菜单
    expect(onSlashChange).toHaveBeenCalledWith(null, 'cursor')
  })

  it('slashActive=false 时不挂监听（打字零开销）', async () => {
    const onSlashChange = vi.fn()
    render(
      <RichEditor
        activeDoc={makeDoc('')}
        updateDocContent={vi.fn()}
        fontSize="15px"
        onSlashChange={onSlashChange}
        slashActive={false}
      />,
    )
    onSlashChange.mockClear()
    await flushSelectionChange()
    expect(onSlashChange).not.toHaveBeenCalled()
  })
})
