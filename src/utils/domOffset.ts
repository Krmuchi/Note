/**
 * Markdown 字符偏移 ↔ 编辑器 DOM 位置的双向换算。
 *
 * 背景：查找跳转、评论锚点、状态栏行列号都以 **Markdown 源码的字符偏移** 为接口，
 * 而 contenteditable 里是渲染后的 DOM（`**加粗**` 变成了 `<strong>加粗</strong>`，
 * 字符数变了）。所以需要一层换算。
 *
 * 换算策略：**按块累积**。
 * 每块记录它的 Markdown 源码（`data-md`）与渲染后可见文本；
 * 目标偏移先落到某个块，再在该块内按"可见文本偏移"定位 DOM。
 *
 * 局限（明确写出来，避免误以为精确）：行内标记（`**` `*` `` ` ``）在源码与可见文本里
 * 长度不同，块**内部**的偏移只能按可见字符近似。对"跳转到某个词"的场景足够
 * （查找和评论锚点都是先定位到匹配文本的起点），但不等价于逐字符精确。
 */

/**
 * 取块的 Markdown 源码。
 *
 * 兜底：空文档的初始段落（`<p><br></p>`）是渲染层补出来的，没有 data-md；
 * 用户直接在里面打字时若返回空串，偏移换算会恒为 0（实测导致斜杠检测完全失效）。
 * 用可见文本兜底，保证换算至少有正确的长度。
 */
function blockMdOf(block: Element): string {
  const stored = block.getAttribute('data-md')
  if (stored !== null) return stored
  return (block.textContent ?? '').replace(/\u00a0/g, ' ')
}

/** 块的 Markdown 源码长度（用于跨块累积） */
export function blockMdLength(block: Element): number {
  return blockMdOf(block).length
}

/**
 * 找到"第 n 个块"及其在 Markdown 里的起始偏移。
 *
 * 块之间在 Markdown 里由空行分隔（`\n\n`，2 字符），所以累加时要加上分隔长度。
 */
function locateBlock(
  root: HTMLElement,
  offset: number,
): { block: Element; blockStart: number } | null {
  const children = Array.from(root.children)
  let acc = 0
  for (const el of children) {
    const mdLen = blockMdLength(el)
    // 目标落在本块内（含块末尾边界）
    if (offset <= acc + mdLen) {
      return { block: el, blockStart: acc }
    }
    acc += mdLen + 2 // 块间空行
  }
  // 偏移超出全部块：返回最后一块（跳转到底部）
  const last = children[children.length - 1]
  return last ? { block: last, blockStart: acc - blockMdLength(last) - 2 } : null
}

/**
 * Markdown 源码前缀 → 它渲染后的**可见字符长度**。
 *
 * 用与渲染完全相同的规则剥离标记，避免"手工数标记"与渲染器不一致
 * （实测：手工跳过 `**` 时闭合标记被算漏，偏移差 1~2 个字符）。
 * 这里直接借用行内渲染器的规则：去掉成对标记、链接只留文字。
 */
function visibleLengthOfMdPrefix(mdPrefix: string): number {
  return mdPrefix
    // 行内代码：只留内容
    .replace(/`([^`\n]*)`/g, '$1')
    // 图片/链接：只留 alt/文字
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 强调标记：成对与单个都去掉
    .replace(/\*\*\*|\*\*|~~|`/g, '')
    .replace(/(^|[^*])\*/g, '$1')
    // 行内 HTML 标签不占可见字符
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .length
}

/**
 * 可见字符偏移 → Markdown 源码偏移（同一块内）。
 *
 * 与 visibleLengthOfMdPrefix 互逆：逐字符推进，遇到标记就跳过（不计数）。
 *
 * 关键细节：消费完目标数量的可见字符后，还要**跳过紧跟的标记**。
 * 否则 `这是 **加粗** 文字` 里"加粗"开头（可见偏移 3）会被算成源码偏移 3
 * （落在第一个 `*` 上），而不是正确的 5（`**` 之后）。
 * 光标位置必须指向"下一个可见字符"，所以标记要一并跳过。
 */
function sourceOffsetForVisible(md: string, visibleTarget: number): number {
  let visible = 0
  let i = 0
  while (i < md.length && visible < visibleTarget) {
    // 成对标记：整体跳过
    if (md.startsWith('***', i)) { i += 3; continue }
    if (md.startsWith('**', i) || md.startsWith('~~', i)) { i += 2; continue }
    if (md[i] === '*' || md[i] === '`') { i += 1; continue }
    if (md[i] === '<') {
      const close = md.indexOf('>', i)
      if (close !== -1) { i = close + 1; continue }
    }
    visible += 1
    i += 1
  }

  // 收尾：跳过紧跟的标记，让偏移指向下一个可见字符
  for (;;) {
    if (md.startsWith('***', i)) { i += 3; continue }
    if (md.startsWith('**', i) || md.startsWith('~~', i)) { i += 2; continue }
    if (md[i] === '*' || md[i] === '`') { i += 1; continue }
    if (md[i] === '<') {
      const close = md.indexOf('>', i)
      if (close !== -1) { i = close + 1; continue }
    }
    break
  }

  return i
}

/** 按可见字符偏移把光标放到元素内 */
export function setDomCaretByVisibleOffset(el: Element, visibleOffset: number): void {
  let remaining = Math.max(0, visibleOffset)
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
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
  // 超出：落到末尾
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/**
 * 按 Markdown 偏移选中一段文本（查找跳转、评论锚点跳转都用它）。
 *
 * @returns 是否成功定位
 */
export function selectByMarkdownOffset(root: HTMLElement, start: number, end: number): boolean {
  const found = locateBlock(root, start)
  if (!found) return false
  const { block, blockStart } = found

  // 块内偏移：源码偏移换算成"可见字符偏移"
  const mdInBlock = blockMdOf(block).slice(0, Math.max(0, start - blockStart))
  const visibleInBlock = visibleLengthOfMdPrefix(mdInBlock)
  setDomCaretByVisibleOffset(block, visibleInBlock)

  // 有选区范围时把 end 也定位过去（跨节点选择用 Range）
  if (end > start) {
    const endInBlock = blockMdOf(block).slice(0, Math.max(0, end - blockStart))
    const endVisible = visibleLengthOfMdPrefix(endInBlock)
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const target = sel.getRangeAt(0).cloneRange()
      // 找到 end 对应的文本节点位置
      let remaining = endVisible
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        const len = (node.textContent ?? '').length
        if (remaining <= len) {
          target.setEnd(node, remaining)
          sel.removeAllRanges()
          sel.addRange(target)
          break
        }
        remaining -= len
        node = walker.nextNode()
      }
    }
  }

  // 滚动到可见位置
  const el = block as HTMLElement
  el.scrollIntoView?.({ block: 'center' })
  return true
}

/**
 * 可见字符偏移 → DOM 位置（不改选区）。
 *
 * 与 `setDomCaretByVisibleOffset` 的区别：那个直接操作 Selection（用于跳转/定位），
 * 这个只返回坐标 —— 评论高亮需要**不打断用户当前光标**。
 */
function domPointByVisibleOffset(
  el: Element,
  visibleOffset: number,
): { node: Node; offset: number } | null {
  let remaining = Math.max(0, visibleOffset)
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  let last: Text | null = null
  while (node) {
    const len = (node.textContent ?? '').length
    if (remaining <= len) return { node, offset: remaining }
    remaining -= len
    last = node as Text
    node = walker.nextNode()
  }
  return last ? { node: last, offset: last.length } : null
}

/**
 * Markdown 偏移区间 → DOM Range（**纯函数，不改变选区**）。
 *
 * 用于评论锚点在正文里的高亮：配合 CSS Custom Highlight API，
 * 完全不用往正文插 `<mark>` —— 插了会被 `editorHtmlToMarkdown` 当成
 * 用户内容回写进 Markdown，而且每次重渲染都要重新插一遍。
 *
 * 跨块锚点按"起点块 + 终点块"分别定位；定位失败返回 null（调用方跳过该条）。
 */
export function rangeByMarkdownOffset(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const startFound = locateBlock(root, start)
  if (!startFound) return null

  const startVisible = visibleLengthOfMdPrefix(
    blockMdOf(startFound.block).slice(0, Math.max(0, start - startFound.blockStart)),
  )
  const startPoint = domPointByVisibleOffset(startFound.block, startVisible)
  if (!startPoint) return null

  let endPoint = startPoint
  if (end > start) {
    const endFound = locateBlock(root, end)
    if (endFound) {
      const endVisible = visibleLengthOfMdPrefix(
        blockMdOf(endFound.block).slice(0, Math.max(0, end - endFound.blockStart)),
      )
      endPoint = domPointByVisibleOffset(endFound.block, endVisible) ?? startPoint
    }
  }

  const range = document.createRange()
  try {
    range.setStart(startPoint.node, startPoint.offset)
    range.setEnd(endPoint.node, endPoint.offset)
  } catch {
    // 起止点不在同一文档序（DOM 刚被重建）时 setStart/setEnd 会抛错
    return null
  }
  return range
}

/**
 * 找光标所在的块及其在 Markdown 里的起始偏移。
 *
 * 供"块内源码前缀"类判断使用（如斜杠命令检测要只看当前块，避免跨块误触发）。
 */
export function locateBlockForCaret(
  root: HTMLElement,
): { block: Element; blockStart: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null

  let node: Node | null = range.startContainer
  let block: Element | null = null
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).parentNode === root) {
      block = node as Element
      break
    }
    node = node.parentNode
  }
  if (!block) return null

  let acc = 0
  for (const el of Array.from(root.children)) {
    if (el === block) break
    acc += blockMdLength(el) + 2
  }
  return { block, blockStart: acc }
}

/** 行内容器标签：文字直接挂在这些元素里，且各自对应源码的一行 */
const INLINE_HOSTS = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th'])

/**
 * 取光标所在**行内容器**（p / li / h*）以及它在块源码里对应的行号。
 *
 * 为什么需要"按行对应"：列表块的可见文本是 `列表项/`（`<li>` 之间无换行符），
 * 而源码是 `- 列表项\n- /`（含换行与列表标记）。逐字符跳过标记的换算无法
 * 跨越这个结构差异 —— 实测偏移会算成 4 而不是 8，斜杠检测因此定位到错误位置。
 * `<li>` 与源码行是一一对应的，按行取前缀才能得到正确偏移。
 */
function caretLineInfo(
  root: HTMLElement,
): { host: HTMLElement; lineIndex: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null

  // 向上找最内层的行内容器
  let node: Node | null = range.startContainer
  let host: HTMLElement | null = null
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && INLINE_HOSTS.has((node as HTMLElement).tagName.toLowerCase())) {
      host = node as HTMLElement
      break
    }
    node = node.parentNode
  }
  if (!host) return null

  // 行号：li 取其在同级 li 中的序号；其余容器（p/h*）就是该块的第 0 行
  let lineIndex = 0
  if (host.tagName.toLowerCase() === 'li') {
    const siblings = Array.from(host.parentElement?.children ?? []).filter(
      (el) => el.tagName.toLowerCase() === 'li',
    )
    lineIndex = Math.max(0, siblings.indexOf(host))
  }
  return { host, lineIndex }
}

/**
 * 光标在**当前行内**的源码偏移（相对该行起点，含行首标记）。
 *
 * 行首标记（`- ` / `1. ` / `> `）要计入，因为它在源码里占位；
 * 但斜杠匹配前会把它剥掉，所以这里返回的是"含标记"的完整行内偏移。
 */
function caretOffsetInLine(host: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  const pre = range.cloneRange()
  pre.selectNodeContents(host)
  pre.setEnd(range.startContainer, range.startOffset)
  const visible = pre.toString().length
  // 行内标记不占可见字符，需换算回源码偏移
  const raw = (host.textContent ?? '').replace(/\u00a0/g, ' ')
  return sourceOffsetForVisible(raw, visible)
}

/**
 * 检测光标前的斜杠命令片段（`/` 位于行首或空白之后）。
 *
 * 与 textarea 版 `detectSlashToken` 用**同一套正则**，保证两种内核行为一致。
 * 返回的 start/end 是 **Markdown 源码偏移**，与 Editor 里删除 `/query` 的逻辑对齐。
 *
 * 放在这里而不是 RichEditor.tsx：组件文件里导出非组件函数会让
 * react-refresh 失效（改一行就要整页重载）。
 */
export function detectSlashInRoot(
  root: HTMLElement,
): { start: number; end: number; query: string } | null {
  const blockInfo = locateBlockForCaret(root)
  if (!blockInfo) return null
  const lineInfo = caretLineInfo(root)
  if (!lineInfo) return null

  const { block, blockStart } = blockInfo
  const { host, lineIndex } = lineInfo

  // 该块源码的第 lineIndex 行
  const mdLines = blockMdOf(block).split('\n')
  const line = mdLines[lineIndex] ?? ''
  // 该行起点在整个块/文档里的绝对偏移
  let lineStartAbs = blockStart
  for (let i = 0; i < lineIndex; i++) lineStartAbs += (mdLines[i]?.length ?? 0) + 1

  /*
   * 行内偏移 = **行首块标记长度** + 光标在行内容器内的偏移。
   *
   * 漏掉行标记会算少字符数（实测：源码行 `- /`、光标在 `/` 之后应为 3，
   * 只算 li 内的偏移会得到 1 —— 前缀截成 `-`，正则匹配不到 `/`，菜单唤不出）。
   */
  const markerMatch = /^(?:[-*+]\s+|\d+[.)]\s+|>\s?)/.exec(line)
  const markerLen = markerMatch ? markerMatch[0].length : 0
  const offset = lineStartAbs + markerLen + caretOffsetInLine(host)

  // 只在该行内匹配；行首块标记不参与
  const prefix = line.slice(0, Math.max(0, offset - lineStartAbs))
  const stripped = prefix.replace(/^(?:[-*+]\s+|\d+[.)]\s+|>\s?)/, '')
  const matched = /(?:^|\s)\/([^\s/]*)$/.exec(stripped)
  if (!matched) return null

  const query = matched[1]
  return { start: offset - query.length - 1, end: offset, query }
}

/**
 * 读取当前光标在 **Markdown 源码**里的偏移。
 *
 * 用于状态栏行列号与"划词评论"取选区。做法与 selectByMarkdownOffset 相反：
 * 先找光标所在块，累加之前块的源码长度，再加上块内偏移（可见 → 源码的近似）。
 */
export function readMarkdownOffset(root: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null

  // 找到光标所在的顶层块
  let node: Node | null = range.startContainer
  let block: Element | null = null
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).parentNode === root) {
      block = node as Element
      break
    }
    node = node.parentNode
  }
  if (!block) return null

  // 累加前面所有块的源码长度（含块间空行）
  let acc = 0
  for (const el of Array.from(root.children)) {
    if (el === block) break
    acc += blockMdLength(el) + 2
  }

  // 块内偏移：先算可见偏移，再换算回源码偏移
  const pre = range.cloneRange()
  pre.selectNodeContents(block)
  pre.setEnd(range.startContainer, range.startOffset)
  const visibleBefore = pre.toString().length

  const md = blockMdOf(block)
  const srcIdx = sourceOffsetForVisible(md, visibleBefore)

  return acc + srcIdx
}
