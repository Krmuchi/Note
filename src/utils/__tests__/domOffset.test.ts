import { describe, it, expect, beforeEach } from 'vitest'
import { selectByMarkdownOffset, readMarkdownOffset, detectSlashInRoot, rangeByMarkdownOffset } from '@/utils/domOffset'
import { markdownToEditorHtml } from '@/utils/markdownToHtml'
import { applyMarkdownFormat } from '@/utils/markdownFormat'

/**
 * Markdown 偏移 ↔ 编辑器 DOM 的换算。
 *
 * 这是新内核的**适配层**：查找跳转、评论锚点、划词评论都靠它把
 * "Markdown 源码里的字符偏移"映射到渲染后的 DOM 位置。
 * 换算错了会让跳转落到错误位置，必须锁住。
 */

function mount(md: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = markdownToEditorHtml(md)
  document.body.appendChild(root)
  return root
}

/** 把光标放进某个元素的开头（模拟用户点击） */
function caretAtStart(el: Element): void {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(true)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('selectByMarkdownOffset', () => {
  it('偏移 0 落在第一个块开头', () => {
    const root = mount('第一段\n\n第二段')
    expect(selectByMarkdownOffset(root, 0, 0)).toBe(true)

    const sel = window.getSelection()!
    // 光标应在第一个 <p> 内
    const p = root.querySelector('p')!
    expect(p.contains(sel.anchorNode)).toBe(true)
  })

  it('第二个块的偏移能正确定位（跨块累积正确）', () => {
    const root = mount('第一段\n\n第二段')
    // '第一段' 长 3，块间空行 2 → 第二段起始偏移是 5
    expect(selectByMarkdownOffset(root, 5, 5)).toBe(true)

    const sel = window.getSelection()!
    const ps = root.querySelectorAll('p')
    expect(ps[1].contains(sel.anchorNode)).toBe(true)
  })

  it('块内偏移按可见字符定位（跳过 ** 标记）', () => {
    const root = mount('这是 **加粗** 文字')
    /*
     * 源码索引：这(0) 是(1) 空格(2) *(3) *(4) 加(5) 粗(6) *(7) *(8) 空格(9) 文(10) 字(11)
     * 可见文本：'这是 加粗 文字' —— '文' 的可见偏移是 6
     * 所以 [10,12] 应选中"文字"
     */
    expect(selectByMarkdownOffset(root, 10, 12)).toBe(true)

    const sel = window.getSelection()!
    expect(sel.toString()).toBe('文字')
  })

  it('偏移超出文档时定位到最后一个块（不抛错）', () => {
    const root = mount('唯一一段')
    expect(selectByMarkdownOffset(root, 9999, 9999)).toBe(true)
  })

  it('空文档不抛错', () => {
    const root = mount('')
    expect(() => selectByMarkdownOffset(root, 0, 0)).not.toThrow()
  })
})

describe('readMarkdownOffset', () => {
  it('光标在第一个块开头时返回 0', () => {
    const root = mount('第一段\n\n第二段')
    caretAtStart(root.querySelector('p')!)
    expect(readMarkdownOffset(root)).toBe(0)
  })

  it('光标在第二个块开头时返回跨块累积偏移', () => {
    const root = mount('第一段\n\n第二段')
    caretAtStart(root.querySelectorAll('p')[1])
    // '第一段'(3) + 空行(2) = 5
    expect(readMarkdownOffset(root)).toBe(5)
  })

  it('行内标记不计入可见偏移（读回时按源码补偿）', () => {
    const root = mount('这是 **加粗** 文字')
    const strong = root.querySelector('strong')!
    caretAtStart(strong)
    // '这是 ' 是 3 个字符 + '**' 2 个标记 = 5
    expect(readMarkdownOffset(root)).toBe(5)
  })

  it('选区不在编辑器内时返回 null', () => {
    const root = mount('内容')
    const outside = document.createElement('div')
    outside.textContent = '外部'
    document.body.appendChild(outside)
    caretAtStart(outside)
    expect(readMarkdownOffset(root)).toBeNull()
  })
})

describe('往返一致（读回 == 写入）', () => {
  it('定位到某偏移后读回同一偏移', () => {
    const root = mount('第一段\n\n第二段\n\n第三段')
    for (const offset of [0, 5, 10]) {
      selectByMarkdownOffset(root, offset, offset)
      expect(readMarkdownOffset(root)).toBe(offset)
    }
  })
})

describe('detectSlashInRoot（斜杠命令检测）', () => {
  /** 把光标放到指定元素的文本末尾 */
  function caretAtEnd(el: Element): void {
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
  }

  it('段落里输入 `/` 命中，start 指向斜杠', () => {
    const root = mount('/')
    caretAtEnd(root.querySelector('p')!)
    const token = detectSlashInRoot(root)
    expect(token).not.toBeNull()
    expect(token!.query).toBe('')
    expect(token!.start).toBe(0)
    expect(token!.end).toBe(1)
  })

  it('`/biaoti` 的 query 是 biaoti', () => {
    const root = mount('/biaoti')
    caretAtEnd(root.querySelector('p')!)
    expect(detectSlashInRoot(root)!.query).toBe('biaoti')
  })

  it('普通文字不触发', () => {
    const root = mount('这是一段话')
    caretAtEnd(root.querySelector('p')!)
    expect(detectSlashInRoot(root)).toBeNull()
  })

  it('斜杠后已有空格不触发（不是命令片段）', () => {
    const root = mount('/已经结束 ')
    caretAtEnd(root.querySelector('p')!)
    expect(detectSlashInRoot(root)).toBeNull()
  })

  it('**列表项里**输入 `/` 也能命中（行标记长度必须计入）', () => {
    /*
     * 这是实测抓到的缺陷：源码行是 `- 列表项\n- /`，
     * 若只算 li 内的可见偏移（1），前缀会被截成 `-`，
     * 正则匹配不到 `/`，斜杠菜单唤不出。行标记 `- ` 的 2 个字符必须计入。
     */
    const root = mount('- 列表项\n- /')
    const items = root.querySelectorAll('li')
    caretAtEnd(items[1])
    const token = detectSlashInRoot(root)
    expect(token).not.toBeNull()
    expect(token!.query).toBe('')
  })

  it('第二个列表项里的 `/b` 命中且 start 正确', () => {
    const root = mount('- 甲\n- /b')
    caretAtEnd(root.querySelectorAll('li')[1])
    const token = detectSlashInRoot(root)
    expect(token!.query).toBe('b')
    // 源码: '- 甲\n- /b' —— '/' 在偏移 6
    expect(token!.start).toBe(6)
  })

  it('列表项里只打 `- 文字` 不触发（前面没有斜杠）', () => {
    const root = mount('- 甲\n- 文字')
    caretAtEnd(root.querySelectorAll('li')[1])
    expect(detectSlashInRoot(root)).toBeNull()
  })
})

/* ------------------------------------------------------------------ *
 * 缺陷1：列表 / 引用 / 代码块内选区的按行换算
 * 旧实现整块按可见字符近似，第二项起整体错位（给第二项加粗落到第一项）。
 * ------------------------------------------------------------------ */

/** 把光标放到元素文本末尾 */
function caretAtEnd(el: Element): void {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

/** 选中某个元素的全部文本，返回 [start,end] 源码偏移 */
function selectElement(el: Element): { start: number; end: number } {
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
  const start = readMarkdownOffsetForRangeStart()
  // 终点：collapse 到末尾再读
  const endRange = range.cloneRange()
  endRange.collapse(false)
  sel.removeAllRanges()
  sel.addRange(endRange)
  const end = readMarkdownOffsetForRangeStart()
  return { start: start!, end: end! }
}

function readMarkdownOffsetForRangeStart(): number | null {
  // 复用被测函数需要 root；这里用选区所在块的根（document.body 下第一个 div）
  const root = document.body.querySelector('div') as HTMLElement
  return readMarkdownOffset(root)
}

describe('列表选区偏移（缺陷1核心）', () => {
  it('第二项 bb 的选区源码偏移是 [7,9]，不是第一项', () => {
    const root = mount('- aa\n- bb')
    const li = root.querySelectorAll('li')[1]
    const { start, end } = selectElement(li)
    // 源码 '- aa\n- bb'：bb 在偏移 7..9
    expect(start).toBe(7)
    expect(end).toBe(9)
  })

  it('给第二项选中文字加粗，落到 bb 而非 aa', () => {
    const md = '- aa\n- bb'
    const root = mount(md)
    const li = root.querySelectorAll('li')[1]
    const { start, end } = selectElement(li)
    const result = applyMarkdownFormat(md, start, end, 'bold')!
    expect(result.content).toBe('- aa\n- **bb**')
  })

  it('第一项 aa 的选区偏移是 [2,4]', () => {
    const root = mount('- aa\n- bb')
    const li = root.querySelectorAll('li')[0]
    const { start, end } = selectElement(li)
    expect(start).toBe(2)
    expect(end).toBe(4)
  })

  it('selectByMarkdownOffset 跳进列表第二项选中 bb', () => {
    const root = mount('- aa\n- bb')
    expect(selectByMarkdownOffset(root, 7, 9)).toBe(true)
    expect(window.getSelection()!.toString()).toBe('bb')
  })

  it('有序列表第二项偏移计入换行与序号标记', () => {
    // '1. aa\n2. bb'：'1. aa'(5) + '\n'(1) + '2. '(3) → bb 在偏移 9..11
    const root = mount('1. aa\n2. bb')
    const li = root.querySelectorAll('li')[1]
    const { start, end } = selectElement(li)
    expect(start).toBe(9)
    expect(end).toBe(11)
    const result = applyMarkdownFormat('1. aa\n2. bb', start, end, 'bold')!
    expect(result.content).toBe('1. aa\n2. **bb**')
  })

  it('嵌套列表子项 b 的偏移正确（取最深行容器）', () => {
    // '- a\n  - b\n- c'：b 在偏移 8
    const root = mount('- a\n  - b\n- c')
    const nested = root.querySelector('li > ul > li')!
    caretAtStart(nested)
    expect(readMarkdownOffset(root)).toBe(8)
    caretAtEnd(nested)
    expect(readMarkdownOffset(root)).toBe(9)
  })

  it('任务列表第二项偏移计入勾选框标记', () => {
    // '- [ ] aa\n- [x] bb'：'- [ ] aa'(8) + '\n'(1) + '- [x] '(6) → bb 在偏移 15..17
    const root = mount('- [ ] aa\n- [x] bb')
    const spans = root.querySelectorAll('li > span')
    const { start, end } = selectElement(spans[1])
    expect(start).toBe(15)
    expect(end).toBe(17)
  })
})

describe('引用块选区偏移（缺陷1）', () => {
  it('引用第二行 bb 偏移 [7,9]', () => {
    // '> aa\n> bb'
    const root = mount('> aa\n> bb')
    const ps = root.querySelectorAll('blockquote > p')
    const { start, end } = selectElement(ps[1])
    expect(start).toBe(7)
    expect(end).toBe(9)
  })

  it('selectByMarkdownOffset 跳进引用第二行', () => {
    const root = mount('> aa\n> bb')
    expect(selectByMarkdownOffset(root, 7, 9)).toBe(true)
    expect(window.getSelection()!.toString()).toBe('bb')
  })
})

describe('代码块选区偏移（缺陷1）', () => {
  it('代码正文按字面 1:1 换算（跳过围栏）', () => {
    // '```js\nconst a = 1\n```'：正文 const 从偏移 6 起
    const root = mount('```js\nconst a = 1\n```')
    const code = root.querySelector('pre > code')!
    caretAtStart(code)
    expect(readMarkdownOffset(root)).toBe(6)
  })

  it('selectByMarkdownOffset 选中代码里的 const', () => {
    const root = mount('```js\nconst a = 1\n```')
    expect(selectByMarkdownOffset(root, 6, 11)).toBe(true)
    expect(window.getSelection()!.toString()).toBe('const')
  })

  it('代码块内光标偏移往返一致', () => {
    const root = mount('```js\nconst a = 1\n```')
    for (const off of [6, 9, 11, 17]) {
      selectByMarkdownOffset(root, off, off)
      expect(readMarkdownOffset(root)).toBe(off)
    }
  })
})

describe('评论锚点 rangeByMarkdownOffset（缺陷1）', () => {
  it('列表第二项锚点定位到 bb', () => {
    const root = mount('- aa\n- bb')
    const range = rangeByMarkdownOffset(root, 7, 9)!
    expect(range).not.toBeNull()
    expect(range.toString()).toBe('bb')
  })

  it('引用第二行锚点定位到 bb', () => {
    const root = mount('> aa\n> bb')
    const range = rangeByMarkdownOffset(root, 7, 9)!
    expect(range.toString()).toBe('bb')
  })
})

describe('列表/引用/代码块往返一致（读回==写入）', () => {
  it('列表各项偏移往返一致', () => {
    const root = mount('- aa\n- bb\n- cc')
    for (const off of [2, 4, 7, 9, 12, 14]) {
      selectByMarkdownOffset(root, off, off)
      expect(readMarkdownOffset(root)).toBe(off)
    }
  })

  it('引用各行偏移往返一致', () => {
    const root = mount('> aa\n> bb')
    for (const off of [2, 4, 7, 9]) {
      selectByMarkdownOffset(root, off, off)
      expect(readMarkdownOffset(root)).toBe(off)
    }
  })
})
