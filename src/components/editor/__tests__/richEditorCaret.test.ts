import { describe, it, expect, beforeEach } from 'vitest'
import { getCaretOffset, setCaretOffset } from '@/components/editor/richEditorCaret'

/**
 * 光标偏移工具。
 *
 * 归入"静默失效"防线：这两个函数出错不会有任何报错 ——
 * 表现为"打完 **加粗** 再打字，后面的字也变粗了"、
 * 或"行内渲染后光标跳到段首"。只能靠单测守住边界。
 *
 * 为什么必须按**字符偏移**而不是节点引用：行内渲染会整体替换块的 innerHTML，
 * 旧节点全部失效，只有偏移能跨渲染存活。
 */

function makeRoot(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

/** 把光标放到某个文本节点的指定偏移 */
function placeCaret(node: Node, offset: number): void {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

beforeEach(() => {
  document.body.innerHTML = ''
  window.getSelection()?.removeAllRanges()
})

describe('getCaretOffset', () => {
  it('纯文本块：偏移等于光标前的字符数', () => {
    const root = makeRoot('<p>hello world</p>')
    const text = root.querySelector('p')!.firstChild!
    placeCaret(text, 5)
    expect(getCaretOffset(root)).toBe(5)
  })

  it('跨多个块累计偏移（不是块内相对偏移）', () => {
    const root = makeRoot('<p>abc</p><p>def</p>')
    const second = root.querySelectorAll('p')[1].firstChild!
    placeCaret(second, 2)
    // "abc" + "def" 的前 2 个字符
    expect(getCaretOffset(root)).toBe(5)
  })

  it('光标在 root 之外时返回 null（不误判为 0）', () => {
    const root = makeRoot('<p>abc</p>')
    const outside = document.createElement('div')
    outside.textContent = 'other'
    document.body.appendChild(outside)
    placeCaret(outside.firstChild!, 1)
    expect(getCaretOffset(root)).toBeNull()
  })

  it('没有选区时返回 null', () => {
    const root = makeRoot('<p>abc</p>')
    window.getSelection()!.removeAllRanges()
    expect(getCaretOffset(root)).toBeNull()
  })
})

describe('setCaretOffset', () => {
  it('设置到纯文本中的指定偏移', () => {
    const root = makeRoot('<p>hello world</p>')
    setCaretOffset(root, 6)
    expect(getCaretOffset(root)).toBe(6)
  })

  it('设置到 0', () => {
    const root = makeRoot('<p>hello</p>')
    setCaretOffset(root, 0)
    expect(getCaretOffset(root)).toBe(0)
  })

  it('偏移超出文本长度时补一个空文本节点接住光标（不落到行内元素边界）', () => {
    /*
     * 关键回归：光标若停在 <strong> 的**右边界**上，浏览器会让后续输入
     * 继承该元素的格式 —— 实测"打完 **加粗** 再打字，后面的字也变粗了"。
     * 因此超界时必须在末尾补纯文本节点，而不是直接把 range 放到元素末尾。
     */
    const root = makeRoot('<p><strong>加粗</strong></p>')
    setCaretOffset(root, 999)

    const p = root.querySelector('p')!
    const last = p.lastChild!
    expect(last.nodeType).toBe(Node.TEXT_NODE)

    // 光标必须落在那个纯文本节点里（而不是 strong 内部或 p 的边界）
    const sel = window.getSelection()!
    expect(sel.rangeCount).toBe(1)
    expect(sel.getRangeAt(0).startContainer).toBe(last)
  })

  it('往返：设置后读回同一个偏移', () => {
    const root = makeRoot('<p>abcdef</p><p>ghij</p>')
    for (const offset of [0, 3, 6, 9]) {
      setCaretOffset(root, offset)
      expect(getCaretOffset(root)).toBe(offset)
    }
  })
})
