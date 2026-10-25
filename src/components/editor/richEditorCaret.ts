/**
 * 富文本内核的光标工具（从 RichEditor.tsx 抽出）。
 *
 * 为什么单独成模块：这两个函数是"静默失效"的高发区 —— 光标错位、
 * 输入被并入行内元素，全都不会报错，只有真敲键盘才发现。
 * 抽出来才能用单测守住边界行为（见 __tests__/richEditorCaret.test.ts）。
 */

/**
 * 读取当前选区在 root 内的**字符偏移**。
 *
 * 行内语法渲染会替换块的 innerHTML，DOM 节点全变，光标会丢。
 * 用字符偏移（而不是节点引用）记录，渲染后按偏移重新定位 ——
 * 这是 contenteditable 里保住光标的标准做法。
 */
export function getCaretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null

  const pre = range.cloneRange()
  pre.selectNodeContents(root)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().length
}

/**
 * 把光标放到 root 内的指定字符偏移。
 *
 * 偏移超出所有文本节点时（行内渲染后文本变短的常见情况）**不能**直接
 * 用 placeCaretAtEnd：光标若停在 `<strong>` / `<code>` 这类行内元素的边界上，
 * 浏览器会让后续输入**继承该元素的格式** —— 实测"打完 `**加粗**` 再打字，
 * 后面的字也变粗了"。所以在末尾补一个空文本节点，把光标放进纯文本里。
 */
export function setCaretOffset(root: HTMLElement, offset: number): void {
  let remaining = offset
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  let lastTextNode: Node | null = null
  while (node) {
    const len = (node.textContent ?? '').length
    if (remaining <= len) {
      const range = document.createRange()
      range.setStart(node, remaining)
      range.collapse(true)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      return
    }
    remaining -= len
    lastTextNode = node
    node = walker.nextNode()
  }

  /*
   * 偏移超出所有文本节点。补节点的位置必须在**光标真正所属的那一层**：
   *
   * 旧实现无条件 append 到传入的 root 上。而调用方传的是"块级 host"
   * （如 `<p>`），root 往往是整篇编辑器 —— 于是空文本节点被挂到文档末尾，
   * 光标跳到文末而不是当前块，且 `<p>` 里仍然是孤零零的 `<strong>`，
   * 后续输入会被并进 strong（格式继承）。
   *
   * 正确做法：从最后一个文本节点向上找到它所属的块级容器（host），
   * 把空文本节点补在这个 host 里。没有文本节点时退回 root。
   */
  const host = lastTextNode ? blockAncestorOf(lastTextNode, root) : root
  const tail = document.createTextNode('')
  host.appendChild(tail)
  const range = document.createRange()
  range.setStart(tail, 0)
  range.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/** 从 node 向上找 root 的直接子元素（即"块"）；找不到时返回 root 本身 */
function blockAncestorOf(node: Node, root: HTMLElement): HTMLElement {
  let el: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  while (el && el.parentElement !== root) {
    el = el.parentElement
  }
  return (el as HTMLElement | null) ?? root
}
