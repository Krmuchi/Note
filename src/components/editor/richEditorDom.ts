/**
 * 富文本内核的 DOM 纯函数层。
 *
 * 从 RichEditor.tsx 抽出来的（该文件曾有 22 个顶层函数混在组件文件里）：
 * 这些函数只依赖传入的 DOM 节点与选区，不碰组件状态，因此可以独立单测。
 *
 * 为什么值得拆：这些函数是"静默失效"的高发区 —— 光标错位、输入被并入
 * 行内元素、表格导航失灵，全都不会有任何报错，只有真敲键盘才发现。
 * 放在可测的模块里，才能用单测守住边界行为。
 */

import { inlineMdToHtml } from '@/utils/markdownToHtml'

const INLINE_TAGS = new Set(['strong', 'em', 'code', 'del', 'a', 'mark', 'u', 'sub', 'sup'])

/** 行内标记对的正则（加粗 / 斜体 / 删除线 / 行内代码） */
const INLINE_MARKUP_RE = /\*\*[^*\n]+\*\*|(^|[^*])\*[^*\n]+\*|~~[^~\n]+~~|`[^`\n]+`/

/** 文本是否以一个"完整的标记对"结尾（如 `**加粗**`） */
function endsWithMarkupPair(text: string): boolean {
  return /(\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`)$/.test(text) || /(^|[^*])\*[^*\n]+\*$/.test(text)
}

/**
 * 读取当前选区在 root 内的**字符偏移**。
 *
 * 行内渲染会替换块的 innerHTML，DOM 节点全变，光标会丢。
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
 * placeCaretAtEnd：光标若停在 `<strong>` / `<code>` 这类行内元素的边界上，
 * 浏览器会让后续输入**继承该元素的格式** —— 实测"打完 `**加粗**` 再打字，
 * 后面的字也变粗了"。所以在末尾补一个空文本节点，把光标放进纯文本里。
 */
export function setCaretOffset(root: HTMLElement, offset: number): void {
  let remaining = offset
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
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
    node = walker.nextNode()
  }

  const tail = document.createTextNode('')
  root.appendChild(tail)
  const range = document.createRange()
  range.setStart(tail, 0)
  range.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/** 把光标放到容器末尾（建在末尾的纯文本节点里，避免继承行内格式） */
export function placeCaretAtEnd(el: HTMLElement): void {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/** 光标是否位于该容器的末尾 */
export function isCaretAtEnd(host: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return false
  if (!host.contains(range.startContainer)) return false

  const after = range.cloneRange()
  after.selectNodeContents(host)
  after.setStart(range.endContainer, range.endOffset)
  return after.toString().length === 0
}

/** 向上最近的块级容器（root 的直接子元素） */
export function currentBlock(root: HTMLElement): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  let node: Node | null = sel.getRangeAt(0).startContainer
  if (!root.contains(node)) return null
  while (node && node.parentElement !== root) node = node.parentElement
  return (node as HTMLElement | null) ?? null
}

/** 光标所在位置最内层的行内元素宿主（用于判断当前是否加粗/斜体） */
export function innermostInlineHost(root: HTMLElement): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  let node: Node | null = sel.getRangeAt(0).startContainer
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has((node as HTMLElement).tagName.toLowerCase())) {
      return node as HTMLElement
    }
    node = node.parentNode
  }
  return null
}

/** 最近的指定标签祖先（限定在 root 内） */
export function closestTag<K extends keyof HTMLElementTagNameMap>(
  node: Node | null,
  tag: K,
  root: HTMLElement,
): HTMLElementTagNameMap[K] | null {
  let el = node instanceof Element ? node : node?.parentElement ?? null
  const wanted = tag.toLowerCase()
  while (el && el !== root) {
    if (el.tagName.toLowerCase() === wanted) return el as HTMLElementTagNameMap[K]
    el = el.parentElement
  }
  return null
}

/** 光标所在的表格单元格 / 表格 / 代码块 */
export function currentCell(root: HTMLElement): HTMLTableCellElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  return closestTag(sel.getRangeAt(0).startContainer, 'td', root)
    ?? closestTag(sel.getRangeAt(0).startContainer, 'th', root)
}

export function currentTable(root: HTMLElement): HTMLTableElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  return closestTag(sel.getRangeAt(0).startContainer, 'table', root)
}

export function currentPre(root: HTMLElement): HTMLPreElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  return closestTag(sel.getRangeAt(0).startContainer, 'pre', root)
}

/** 确保表格有 tbody（部分浏览器解析时会省略） */
export function ensureTableBody(table: HTMLTableElement): HTMLTableSectionElement {
  return table.tBodies[0] ?? table.createTBody()
}

/** 聚焦到单元格并把光标放到内容末尾 */
export function focusCell(cell: HTMLTableCellElement): void {
  cell.focus()
  placeCaretAtEnd(cell)
}

/** 以参考行为模板创建空行（复制单元格数量） */
export function createEmptyRow(reference: HTMLTableRowElement): HTMLTableRowElement {
  const row = document.createElement('tr')
  for (let i = 0; i < reference.cells.length; i++) {
    const cell = document.createElement(reference.cells[i].tagName.toLowerCase() as 'td' | 'th')
    cell.appendChild(document.createElement('br'))
    row.appendChild(cell)
  }
  return row
}

/** 表格内按方向移动焦点 */
export function moveTableCell(cell: HTMLTableCellElement, direction: -1 | 1): void {
  const row = cell.parentElement as HTMLTableRowElement | null
  const table = cell.closest('table')
  if (!row || !table) return

  const cells = Array.from(row.cells)
  const colIndex = cells.indexOf(cell) + direction
  if (colIndex >= 0 && colIndex < cells.length) {
    focusCell(cells[colIndex])
    return
  }

  const rows = Array.from(ensureTableBody(table).rows)
  const rowIndex = rows.indexOf(row) + direction
  if (rowIndex >= 0 && rowIndex < rows.length) {
    const nextRow = rows[rowIndex]
    const target = direction > 0 ? nextRow.cells[0] : nextRow.cells[nextRow.cells.length - 1]
    if (target) focusCell(target)
  }
}

/** 在光标处插入换行（用 <br>，contenteditable 里不能直接插 \n） */
export function insertLineBreakAtCaret(): void {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const br = document.createElement('br')
  range.insertNode(br)
  range.setStartAfter(br)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** 在光标处插入纯文本 */
export function insertTextAtCaret(text: string): void {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

/**
 * 确保空块里有 `<br>`，否则**光标落不进去**。
 *
 * contenteditable 的已知行为：空元素没有可聚焦的内容，浏览器会把光标留在
 * 父节点上。实测症状：输入 `# ` 转成 h1 后继续打字，文字出现在 `<h1>` **外面**
 * （`一级标题<h1></h1>`）—— 内容看似输入了，实际结构已损坏。
 */
export function ensureFocusable(el: HTMLElement): void {
  if (el.childNodes.length === 0) {
    el.appendChild(document.createElement('br'))
  }
}

/** 光标在 `<pre>` 内但不在其中的 `<code>` 里时，把光标移进 code（否则打字跑到代码块外） */
export function normalizePreCaret(root: HTMLElement): void {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  let node: Node | null = range.startContainer
  let pre: HTMLElement | null = null
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'pre') {
      pre = node as HTMLElement
      break
    }
    node = node.parentNode
  }
  if (!pre) return
  const code = pre.querySelector('code')
  if (!code || code.contains(range.startContainer)) return
  placeCaretAtEnd(code)
}

/**
 * 对指定行内容器做一次行内渲染。
 *
 * @param requireTrailing 是否要求标记对之后还有内容。
 *   输入过程中用 true（避免光标停在行内元素边界）；
 *   离开块（Enter / blur）时用 false（此时光标本来就要离开）。
 * @returns 是否发生了渲染
 */
export function renderInlineMarkup(host: HTMLElement, requireTrailing: boolean): boolean {
  const raw = (host.textContent ?? '').replace(/\u00a0/g, ' ')
  // 输入过程中要求"标记对后紧跟非空白"（见 hasCompleteInlineMarkup 注释）；
  // 离开块时（Enter/失焦）不要求 —— 此时光标本就离开，不会再有输入被吞。
  const complete = requireTrailing ? hasCompleteInlineMarkup(raw) : hasAnyInlineMarkup(raw)
  if (!complete) return false

  const html = inlineMdToHtml(raw)
  if (host.innerHTML === html) return false

  const rawCaret = getCaretOffset(host)
  host.innerHTML = html
  if (rawCaret !== null) {
    // 偏移要按"可见字符"换算，否则光标会落到错误位置
    setCaretOffset(host, visibleOffset(raw.slice(0, rawCaret)))
  }

  /*
   * 关键收尾：光标若停在行内元素（strong/code/em）的**右边界**上，
   * 浏览器会把后续输入**并入该元素** —— 实测：`**加粗**` 后打空格再打"文"，
   * 结果是 `<strong>加粗文</strong>`（"文"也变粗了）。
   * 在末尾补一个独立文本节点，让光标落在纯文本节点里，后续输入就不会被吞。
   */
  ensureTrailingTextNode(host)
  return true
}

/**
 * 文本里是否有一个**完整且不在末尾**的行内标记对。
 *
 * "后面还有文字"才安全：渲染后光标落在标记对之后那段文字的末尾，
 * 其后没有行内元素，继续输入不会被吞。末尾情况（用户刚打完 `**加粗**`）
 * 留给 Enter / 失焦时补渲染。
 */
export function hasCompleteInlineMarkup(text: string): boolean {
  if (!INLINE_MARKUP_RE.test(text)) return false
  return !endsWithMarkupPair(text.replace(/\s+$/, ''))
}

/** 文本里是否存在任意完整的行内标记对（不要求后面还有内容） */
export function hasAnyInlineMarkup(text: string): boolean {
  return INLINE_MARKUP_RE.test(text)
}

/**
 * Markdown 源码偏移 → 可见字符偏移。
 *
 * 渲染前偏移按源码计（含 `**` 等标记），渲染后按可见文本计 —— 两者不等长。
 * 直接沿用源码偏移会让光标落到错误位置。
 */
export function visibleOffset(rawPrefix: string): number {
  return rawPrefix.replace(/\*\*|\*|~~|`/g, '').length
}

/**
 * 若最后一个子节点是行内元素，在其后补一个空文本节点。
 *
 * 这样光标（在元素末尾）会落到该文本节点里，后续输入不会被并入行内元素。
 */
export function ensureTrailingTextNode(host: HTMLElement): void {
  const last = host.lastChild
  if (!last) return
  if (last.nodeType === Node.TEXT_NODE) return
  if (last.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has((last as HTMLElement).tagName.toLowerCase())) {
    host.appendChild(document.createTextNode(''))
    placeCaretAtEnd(host)
  }
}
