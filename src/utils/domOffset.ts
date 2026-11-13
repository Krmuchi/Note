/**
 * Markdown 字符偏移 ↔ 编辑器 DOM 位置的双向换算。
 *
 * 背景：查找跳转、评论锚点、状态栏行列号、划词格式都以 **Markdown 源码的字符偏移**
 * 为接口，而 contenteditable 里是渲染后的 DOM（`**加粗**` 变成 `<strong>加粗</strong>`，
 * 列表 `- a\n- b` 变成两个 `<li>`，字符数与结构都变了）。所以需要一层换算。
 *
 * 换算策略：**按块累积 + 块内按行定位**。
 * - 块之间在源码里由空行（`\n\n`，2 字符）分隔，跨块累加 data-md 长度 + 2。
 * - 块内部：列表 / 引用 / 提示块的可见文本与源码**结构不同**（源码有行首标记与换行，
 *   可见文本没有），必须把每个行内容器（li / p / 标题 span）对应到源码的**某一行**，
 *   行首标记（`- ` / `1. ` / `> ` / `- [ ] `）计入偏移，行内标记（`**` 等）再单独剥。
 *   只有"整块按可见字符近似"会在列表第二项起整体错位（实测：给第二项加粗落到第一项）。
 * - 代码块正文是字面文本（无行内标记），换行以 `<br>` 承载，按 1:1 + 围栏偏移换算。
 * - 段落 / 标题等单行块沿用"可见 ↔ 源码"的行内标记换算。
 */

/** 取块的 Markdown 源码（data-md 优先；空段落用可见文本兜底，保证长度正确） */
function blockMdOf(block: Element): string {
  const stored = block.getAttribute('data-md')
  if (stored !== null) return stored
  return (block.textContent ?? '').replace(/\u00a0/g, ' ')
}

/** 块的 Markdown 源码长度（用于跨块累积） */
export function blockMdLength(block: Element): number {
  return blockMdOf(block).length
}

/** 找到"第 n 个块"及其在 Markdown 里的起始偏移（块间空行 2 字符） */
function locateBlock(
  root: HTMLElement,
  offset: number,
): { block: Element; blockStart: number } | null {
  const children = Array.from(root.children)
  let acc = 0
  for (const el of children) {
    const mdLen = blockMdLength(el)
    if (offset <= acc + mdLen) {
      return { block: el, blockStart: acc }
    }
    acc += mdLen + 2
  }
  const last = children[children.length - 1]
  return last ? { block: last, blockStart: acc - blockMdLength(last) - 2 } : null
}

/* ------------------------------------------------------------------ *
 * 可见长度 / DOM 点（<br> 计为一个换行字符）
 * ------------------------------------------------------------------ */

/** 子树的可见字符数：文本按长度，<br> 记 1（代码块/软换行用它承载换行） */
function visibleLengthOfNode(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').length
  if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') return 1
  let n = 0
  node.childNodes.forEach((c) => {
    n += visibleLengthOfNode(c)
  })
  return n
}

/** 光标在某个行内容器内的可见偏移（<br> 计入） */
function caretVisibleOffset(host: Element): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  const pre = range.cloneRange()
  pre.selectNodeContents(host)
  try {
    pre.setEnd(range.startContainer, range.startOffset)
  } catch {
    return 0
  }
  return visibleLengthOfNode(pre.cloneContents())
}

/** 可见偏移 → DOM 点（不改选区）；<br> 占一个字符位 */
function domPointByVisibleOffset(
  el: Element,
  visibleOffset: number,
): { node: Node; offset: number } | null {
  let remaining = Math.max(0, visibleOffset)
  let last: { node: Node; offset: number } | null = null
  const walk = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? '').length
      if (remaining <= len) return { node, offset: remaining }
      remaining -= len
      last = { node, offset: len }
      return null
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as HTMLElement).tagName === 'BR') {
        if (remaining === 0 && node.parentNode) {
          const idx = Array.prototype.indexOf.call(node.parentNode.childNodes, node)
          return { node: node.parentNode, offset: idx }
        }
        remaining -= 1
        return null
      }
      for (const c of Array.from(node.childNodes)) {
        const r = walk(c)
        if (r) return r
      }
    }
    return null
  }
  const found = walk(el)
  if (found) return found
  return last ?? { node: el, offset: el.childNodes.length }
}

/* ------------------------------------------------------------------ *
 * 行内标记换算（单行源码 ↔ 可见文本）
 * ------------------------------------------------------------------ */

/** Markdown 源码前缀 → 可见字符长度（剥行内标记 / 链接 URL / 行内 HTML） */
function visibleLengthOfMdPrefix(mdPrefix: string): number {
  return mdPrefix
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*\*|\*\*|~~|`/g, '')
    .replace(/(^|[^*])\*/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .length
}

/** 可见偏移 → 源码偏移（同一行内，跳过行内标记；消费完目标后再跳过紧跟的闭合标记） */
function sourceOffsetForVisible(md: string, visibleTarget: number): number {
  let visible = 0
  let i = 0
  const skipMarks = (): boolean => {
    if (md.startsWith('***', i)) { i += 3; return true }
    if (md.startsWith('**', i) || md.startsWith('~~', i)) { i += 2; return true }
    if (md[i] === '*' || md[i] === '`') { i += 1; return true }
    if (md[i] === '<') {
      const close = md.indexOf('>', i)
      if (close !== -1) { i = close + 1; return true }
    }
    return false
  }
  while (i < md.length && visible < visibleTarget) {
    if (skipMarks()) continue
    visible += 1
    i += 1
  }
  for (;;) {
    if (!skipMarks()) break
  }
  return i
}

/* ------------------------------------------------------------------ *
 * 块内"行内容器 ↔ 源码行"映射
 * ------------------------------------------------------------------ */

interface LineEntry {
  /** 承载该行可见文本的 DOM 元素 */
  host: HTMLElement
  /** 对应块源码的行号 */
  lineIndex: number
  /** 该行源码里行首标记的长度（`- ` / `1. ` / `> ` / `- [ ] ` / 缩进） */
  prefixLen: number
}

/** 行首块标记长度（含任务项勾选框与缩进） */
function linePrefixLen(line: string): number {
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|>\s?)/.exec(line)
  return m ? m[0].length : 0
}

/** 某行在块源码里的起始偏移（前行长度 + 换行符） */
function lineStartOffset(lines: string[], lineIndex: number): number {
  let acc = 0
  for (let i = 0; i < lineIndex; i++) acc += (lines[i]?.length ?? 0) + 1
  return acc
}

/**
 * 建立块内行内容器到源码行的映射。
 * 返回 null 表示该块按"整块行内换算"处理（段落 / 标题 / 表格等单行或近似块）。
 * 代码块（pre）单独按字面文本处理，不走这里。
 */
function blockLineMap(block: Element): LineEntry[] | null {
  const tag = block.tagName.toLowerCase()
  const lines = blockMdOf(block).split('\n')

  if (tag === 'ul' || tag === 'ol') {
    // querySelectorAll 按文档序返回 li（含嵌套），与源码"父项在前、子项随后"一致
    const lis = Array.from(block.querySelectorAll('li'))
    return lis.map((li, i) => {
      // 任务项文本在 span 里（li 直接文本含勾选框后的空格，须排除）
      const span = li.querySelector(':scope > span')
      const host = (span ?? li) as HTMLElement
      return { host, lineIndex: i, prefixLen: linePrefixLen(lines[i] ?? '') }
    })
  }

  if (tag === 'blockquote') {
    const ps = Array.from(block.children).filter((c) => c.tagName.toLowerCase() === 'p')
    const hosts = ps.length ? ps : [block]
    return hosts.map((h, i) => ({
      host: h as HTMLElement,
      lineIndex: i,
      prefixLen: linePrefixLen(lines[i] ?? ''),
    }))
  }

  if (tag === 'div' && block.classList.contains('md-callout')) {
    const entries: LineEntry[] = []
    const title = block.querySelector('.md-callout-title')
    if (title) {
      const marker = /^>\s*\[![\w-]+\]\s*/.exec(lines[0] ?? '')
      entries.push({ host: title as HTMLElement, lineIndex: 0, prefixLen: marker ? marker[0].length : 0 })
    }
    const ps = Array.from(block.children).filter((c) => c.tagName.toLowerCase() === 'p')
    ps.forEach((p, i) => {
      entries.push({ host: p as HTMLElement, lineIndex: i + 1, prefixLen: linePrefixLen(lines[i + 1] ?? '') })
    })
    return entries
  }

  return null
}

/** 代码块围栏首行长度（含语言标记） */
function preFenceLen(firstLine: string): number {
  const m = /^\s*(```|~~~)[\w+-]*\s*/.exec(firstLine)
  return m ? m[0].length : 0
}

/**
 * 找光标所在的行映射项。
 * 必须取**最后一个**匹配：嵌套列表里父 li 的 host 也包含子 li 的文本，
 * 取第一个匹配会把子项的光标算到父项行上。文档序最后一项即最深层容器。
 */
function findLineEntry(map: LineEntry[], node: Node): LineEntry | null {
  let hit: LineEntry | null = null
  for (const e of map) {
    if (e.host.contains(node)) hit = e
  }
  return hit
}

/* ------------------------------------------------------------------ *
 * 光标所在块 / 行
 * ------------------------------------------------------------------ */

/** 找光标所在的顶层块及其源码起始偏移 */
function locateBlockForCaret(
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

/* ------------------------------------------------------------------ *
 * 对外：源码偏移 → DOM 点 / 选区
 * ------------------------------------------------------------------ */

/** Markdown 源码偏移 → DOM 点（纯函数，不改选区） */
function domPointBySourceOffset(
  root: HTMLElement,
  offset: number,
): { node: Node; offset: number } | null {
  const found = locateBlock(root, offset)
  if (!found) return null
  const { block, blockStart } = found
  const inBlock = Math.max(0, offset - blockStart)
  const md = blockMdOf(block)
  const lines = md.split('\n')
  const tag = block.tagName.toLowerCase()

  // 代码块：正文是字面文本，偏移 = 围栏首行 + 换行 + 可见偏移
  if (tag === 'pre') {
    const code = (block.querySelector('code') ?? block) as HTMLElement
    const bodyStart = preFenceLen(lines[0] ?? '') + 1
    const visible = Math.max(0, inBlock - bodyStart)
    return domPointByVisibleOffset(code, visible)
  }

  const map = blockLineMap(block)
  if (!map) {
    const visible = visibleLengthOfMdPrefix(md.slice(0, inBlock))
    return domPointByVisibleOffset(block, visible)
  }

  let acc = 0
  for (const e of map) {
    const line = lines[e.lineIndex] ?? ''
    if (inBlock <= acc + line.length) {
      const srcInLine = inBlock - acc
      const visible = srcInLine <= e.prefixLen
        ? 0
        : visibleLengthOfMdPrefix(line.slice(e.prefixLen, srcInLine))
      return domPointByVisibleOffset(e.host, visible)
    }
    acc += line.length + 1
  }
  const last = map[map.length - 1]
  return domPointByVisibleOffset(last.host, Number.MAX_SAFE_INTEGER)
}

/** 按 Markdown 偏移选中一段文本（查找跳转 / 评论锚点跳转） */
export function selectByMarkdownOffset(root: HTMLElement, start: number, end: number): boolean {
  const startPoint = domPointBySourceOffset(root, start)
  if (!startPoint) return false
  const sel = window.getSelection()
  if (!sel) return false

  const range = document.createRange()
  try {
    range.setStart(startPoint.node, startPoint.offset)
    if (end > start) {
      const endPoint = domPointBySourceOffset(root, end)
      if (endPoint) range.setEnd(endPoint.node, endPoint.offset)
      else range.collapse(true)
    } else {
      range.collapse(true)
    }
  } catch {
    return false
  }
  sel.removeAllRanges()
  sel.addRange(range)

  const found = locateBlock(root, start)
  ;(found?.block as HTMLElement | undefined)?.scrollIntoView?.({ block: 'center' })
  return true
}

/**
 * Markdown 偏移区间 → DOM Range（纯函数，不改选区）。
 * 评论锚点高亮用：配合 CSS Custom Highlight，不往正文插标签。
 */
export function rangeByMarkdownOffset(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const startPoint = domPointBySourceOffset(root, start)
  if (!startPoint) return null
  let endPoint = startPoint
  if (end > start) {
    endPoint = domPointBySourceOffset(root, end) ?? startPoint
  }
  const range = document.createRange()
  try {
    range.setStart(startPoint.node, startPoint.offset)
    range.setEnd(endPoint.node, endPoint.offset)
  } catch {
    return null
  }
  return range
}

/* ------------------------------------------------------------------ *
 * 对外：DOM 光标 → 源码偏移
 * ------------------------------------------------------------------ */

/** 读取当前光标在 Markdown 源码里的偏移（状态栏 / 划词评论 / 格式命令） */
export function readMarkdownOffset(root: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null

  const info = locateBlockForCaret(root)
  if (!info) return null
  const { block, blockStart } = info
  const md = blockMdOf(block)
  const lines = md.split('\n')
  const tag = block.tagName.toLowerCase()

  // 代码块：字面文本，围栏偏移 + 可见偏移
  if (tag === 'pre') {
    const code = (block.querySelector('code') ?? block) as HTMLElement
    const bodyStart = preFenceLen(lines[0] ?? '') + 1
    return blockStart + bodyStart + caretVisibleOffset(code)
  }

  const map = blockLineMap(block)
  if (!map) {
    // 段落 / 标题 / 表格：整块行内换算（<br> 计入可见长度）
    return blockStart + sourceOffsetForVisible(md, caretVisibleOffset(block))
  }

  const entry = findLineEntry(map, range.startContainer)
  if (!entry) {
    return blockStart + sourceOffsetForVisible(md, caretVisibleOffset(block))
  }
  const line = lines[entry.lineIndex] ?? ''
  const visible = caretVisibleOffset(entry.host)
  const srcInLine = entry.prefixLen + sourceOffsetForVisible(line.slice(entry.prefixLen), visible)
  return blockStart + lineStartOffset(lines, entry.lineIndex) + srcInLine
}

/* ------------------------------------------------------------------ *
 * 对外：斜杠命令检测
 * ------------------------------------------------------------------ */

/**
 * 检测光标前的斜杠命令片段（`/` 位于行首或空白之后）。
 * 与 textarea 版 detectSlashToken 同一套正则；返回 Markdown 源码偏移。
 * 复用按行定位，保证列表 / 引用里的偏移与 readMarkdownOffset 一致。
 */
export function detectSlashInRoot(
  root: HTMLElement,
): { start: number; end: number; query: string } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)

  const info = locateBlockForCaret(root)
  if (!info) return null
  const { block, blockStart } = info
  const md = blockMdOf(block)
  const lines = md.split('\n')
  const tag = block.tagName.toLowerCase()
  if (tag === 'pre') return null

  const map = blockLineMap(block)
  let lineIndex = 0
  let prefixLen = 0
  let host: Element = block
  if (map) {
    const entry = findLineEntry(map, range.startContainer)
    if (!entry) return null
    lineIndex = entry.lineIndex
    prefixLen = entry.prefixLen
    host = entry.host
  }

  const line = lines[lineIndex] ?? ''
  const visible = caretVisibleOffset(host)
  const srcInLine = prefixLen + sourceOffsetForVisible(line.slice(prefixLen), visible)
  const offset = blockStart + lineStartOffset(lines, lineIndex) + srcInLine

  // 只在该行内匹配；行首块标记不参与命令判定
  const prefix = line.slice(0, srcInLine)
  const matched = /(?:^|\s)\/([^\s/]*)$/.exec(prefix)
  if (!matched) return null
  const query = matched[1]
  return { start: offset - query.length - 1, end: offset, query }
}