import { describe, it, expect, beforeEach } from 'vitest'
import { selectByMarkdownOffset, readMarkdownOffset, detectSlashInRoot } from '@/utils/domOffset'
import { markdownToEditorHtml } from '@/utils/markdownToHtml'

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
