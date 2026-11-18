/**
 * 富文本编辑器（contenteditable 单块 + Markdown 即时转换）。
 *
 * 设计（方案 C）：
 * - **Markdown 是唯一真实源**。每次输入 → 把 contenteditable 的 HTML 转回 Markdown 上抛。
 * - 输入 `# ` `- ` `> ` `1. ` ``` ` 等标记后**即时转换**成对应的块元素（所见即所得）。
 * - 不做块拖拽（那是方案 A/B 的范围），但拿到语雀的主要手感：
 *   标题在正文里、加粗立刻变粗、列表即时成块。
 *
 * 与 textarea 的关系：本组件是**新增的并行实现**，不替换 EditorContent。
 * 由 Editor 用一个开关决定用哪个，出问题可立即切回 textarea。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BlockHandle } from './BlockHandle'
import type { BlockTransformType } from './BlockHandle'
import { useNotesStore, selectActiveDoc } from '@/store'
import type { NoteDoc } from '@/types'
import type { FormatType } from '@/hooks/useEditorFormatting'
import { FORMAT_ACTIONS } from '@/hooks/formatActions'
import { eventToKeys } from '@/utils/shortcuts'
import { markdownToEditorHtml, inlineMdToHtml, refreshBlockDataMd } from '@/utils/markdownToHtml'
import { editorHtmlToMarkdown } from '@/utils/editorHtmlToMarkdown'
import { htmlToMarkdown, HTML_TO_MD_MAX_LENGTH } from '@/utils/htmlToMarkdown'
import { getCursorPosition } from './cursorPosition'
/* 光标工具已抽到独立模块：它们是"静默失效"高发区，独立后可单测 */
import { getCaretOffset, setCaretOffset } from './richEditorCaret'
import {
  selectByMarkdownOffset,
  readMarkdownOffset,
  detectSlashInRoot,
} from '@/utils/domOffset'
import { toast, toastWithUndo } from '@/services/toast'
import { armFocusEscape, consumeFocusEscape, resetFocusEscape } from './focusEscape'
import { useUndoRedo } from '@/hooks/useUndoRedo'

/**
 * 暴露给父组件的命令式接口。
 *
 * contenteditable 里没有 textarea 的 `selectionStart/End`，而查找跳转、
 * 评论锚点、状态栏都需要"按 Markdown 字符偏移定位"——统一走这个接口，
 * 父组件不必了解 DOM 细节。
 */
export interface RichEditorHandle {
  /** 按 Markdown 字符偏移选中一段（查找跳转 / 评论锚点跳转） */
  selectRange: (start: number, end: number) => boolean
  /** 读取当前光标在 Markdown 源码里的偏移（状态栏 / 划词评论取选区） */
  getMarkdownOffset: () => number | null
  /** 当前选区在 Markdown 里的起止（划词评论用） */
  getSelectionRange: () => { start: number; end: number } | null
  /** 聚焦编辑器 */
  focus: () => void
  /**
   * 聚焦并把光标放到正文末尾（P1-3 的兜底）。
   *
   * 文档刚打开 / 焦点还在别处时，`focus()` 之后选区对象可能仍不在正文内，
   * getSelectionRange 会返回 null —— 顶部格式按钮就无从知道作用对象。
   * 这里显式落位到最后一块，保证「格式按钮一定有地方生效」。
   */
  focusAtEnd: () => boolean
  /** 取得根节点（供外部注册滚动监听等） */
  getRoot: () => HTMLDivElement | null
  /**
   * 当前光标在 Markdown 源码里的行列号（1 基）与选中统计。
   *
   * 状态栏需要它：contenteditable 没有 selectionStart，旧实现直接 return，
   * 行列号会永久停在"行 1, 列 1"。返回 null 表示光标不在编辑器内。
   */
  getCursorInfo: () => { line: number; column: number; selectedChars: number; selectedWords: number } | null
  /**
   * 强制按当前文档内容重渲染。
   *
   * 撤销/重做必须调用它：这两者由 store 直接改内容，与"用户打字"走同一个
   * `updateDocContent` 入口，编辑器**无法从 docContent 区分**是哪种变化。
   * 实测：撤销回退到空内容后 DOM 变成无 data-md 的空段落，此时重做虽改了 store，
   * 但编辑器的"内容是否一致"比较误判为相同、跳过重渲染 —— 表现为**重做无反应**。
   */
  forceRender: () => void
  /**
   * 检测光标前的斜杠命令片段（`/` 位于行首或空白之后）。
   *
   * 与 textarea 版 detectSlashToken 用**同一套正则**，保证两种内核行为一致；
   * 返回的 start/end 是 **Markdown 源码偏移**，与 Editor 里 handleSlashRun
   * 删除 `/query` 的逻辑对齐。
   */
  detectSlash: () => { start: number; end: number; query: string } | null
  /**
   * 当前光标 / 选区所处的格式集合（供顶部工具栏高亮）。
   *
   * contenteditable 没有 textarea 的 selectionStart，旧实现由 textarea 监听
   * 推算激活态 —— 在富文本内核下 textarea 为 null，**工具栏永远不高亮**
   * （看不出当前是不是加粗/标题/列表）。这里直接读 DOM 祖先链与当前块标签。
   */
  getActiveFormats: () => Set<string>
}

export interface RichEditorProps {
  activeDoc: NoteDoc | null
  /** 内容变化：上抛 Markdown（与 textarea 版本的 updateDocContent 载荷一致） */
  updateDocContent: (updates: Partial<NoteDoc>) => void
  fontSize: string
  /** 滚动回调（供预览同步/大纲跟随复用现有逻辑） */
  onScroll?: () => void
  /** contenteditable 节点挂载回调（供外部注册监听器） */
  onMount?: (node: HTMLDivElement | null) => void
  /**
   * 斜杠命令触发状态变化。
   * source='input' 表示由输入触发（可唤出面板）；'cursor' 表示仅光标移动（只用于关闭/同步）。
   * 与 textarea 版语义一致，Editor 无需区分内核。
   */
  onSlashChange?: (
    state: { start: number; end: number; query: string; caret: { top: number; left: number } } | null,
    source: 'input' | 'cursor',
  ) => void
  /**
   * 插入图片（粘贴剪贴板图片 / 拖入图片文件）。
   *
   * 必须提供：旧内核走 useEditorPasteDrop，粘贴图片、拖入文件都是既有能力；
   * 富文本内核若只处理 `text/plain`，**粘贴图片会静默无反应** —— 这是高频操作，
   * 缺失等于明显回归。这里复用同一个 handleInsertImage，保证两种内核行为一致。
   */
  onInsertImage?: (file: File) => void
  /** 插入普通附件（拖入非图片文件） */
  onInsertFile?: (file: File) => void
  /**
   * 把一段 Markdown 插入到当前光标处。
   *
   * 粘贴网页/Word 内容时，剪贴板同时带 text/html 与 text/plain。旧实现只取
   * text/plain，**加粗、标题、列表、链接全部丢失**（语雀/Notion 都会保留）。
   * 这里把 HTML 转成 Markdown 后交给父级按源码插入，再统一重渲染。
   */
  onInsertMarkdown?: (markdown: string) => void
  /**
   * 格式化快捷键解析（与 textarea 内核共用 keyboardSlice 注册表）。
   *
   * 富文本内核此前完全不支持 Ctrl+B / I / U / E、Ctrl+1…6 等快捷键 ——
   * 工具栏标题上写着 Ctrl+B，按下去却毫无反应。这里统一接回同一套注册表，
   * 用户自定义键位也照常生效。
   */
  resolveShortcut?: (combo: string[]) => string | null
  /** 执行格式化动作（Editor.applyFormat） */
  onFormatShortcut?: (type: FormatType) => void
  /**
   * 斜杠菜单当前是否打开（状态由 Editor 持有）。
   *
   * 富文本内核据此在 selectionchange 时同步/关闭菜单：光标离开 token 即关闭。
   * 不做这件事的后果是菜单残留 —— 它在 window 捕获阶段拦截 Enter，
   * 用户点到别处按回车会把命令执行到**旧位置**。只在打开时挂监听，打字零开销。
   */
  slashActive?: boolean
  /**
   * 编辑态点击 [[双链]]（P：编辑态双链不可点）。
   *
   * 预览模式里双链由 MarkdownPreview 渲染成按钮可直接点；编辑态它是普通文本，
   * 用户看到 [[标题]] 完全不知道能跳。这里提供 **Ctrl/Cmd+点击** 打开，
   * 并在悬停时把操作提示写进 title —— 让"能点"这件事本身可被发现。
   */
  onWikiLink?: (title: string) => void
  className?: string
}

/**
 * 输入即时转换的规则表。
 *
 * 在段落里刚打出这些前缀时，把当前段落换成对应块。
 * 匹配**行首**且允许标记后为空（刚打完空格的那一刻），
 * 也允许标记后还有文字（用户先写了内容再回头补标记）。
 */
const INPUT_RULES: {
  re: RegExp
  /** 目标标签名 */
  tag: string
  /** 是否在替换后把原文字放进新块（标题/列表需要，hr 不需要） */
  keepText: boolean
  /** 从匹配结果取属性（如标题层级、有序列表起始号） */
  attrs?: (m: RegExpExecArray) => Record<string, string>
}[] = [
  { re: /^(#{1,6})\s(.*)$/, tag: 'h', keepText: true, attrs: (m) => ({ level: String(m[1].length) }) },
  /*
   * 注意：这里**没有** `- [ ] 任务项` 规则，这是刻意的。
   *
   * 用户输入 `- ` 的瞬间就命中下一条规则、变成普通列表了，
   * 等 `[ ]` 打出来时块已经是 `<ul><li>`，块级规则再也匹配不到整行
   * `- [ ] xxx`。任务项的升级由 applyInputRule 里单独的
   * 「li 内文本以 [ ] 开头 → 升级为任务项」逻辑负责。
   */
  { re: /^[-*+]\s(.*)$/, tag: 'li', keepText: true },
  { re: /^(\d+)[.)]\s(.*)$/, tag: 'li', keepText: true, attrs: (m) => ({ ordered: '1', start: m[1] }) },
  { re: /^>\s(.*)$/, tag: 'blockquote', keepText: true },
  { re: /^```(.*)$/, tag: 'pre', keepText: true },
]

/**
 * 从当前 selection 找到所在的**顶层**块元素（parentNode === root）。
 * 用于块级转换：`# ` → 标题时，要替换的是整个顶层段落。
 */
function currentBlock(root: HTMLElement): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  let node: Node | null = sel.getRangeAt(0).startContainer
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).parentNode === root) {
      return node as HTMLElement
    }
    node = node.parentNode
  }
  return null
}

/** 行内渲染的容器标签：文字直接挂在这些元素里 */
const INLINE_HOSTS = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th', 'div'])

/**
 * (x, y) 处的文本节点与偏移 —— 编辑态双链命中检测用。
 * caretRangeFromPoint 是 Chromium 专有 API（jsdom 里没有，返回 null 即可）。
 */
function caretNodeAtPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
  const range = doc.caretRangeFromPoint?.(x, y)
  if (!range) return null
  return { node: range.startContainer, offset: range.startOffset }
}

/**
 * 文本节点里包含 offset 的 [[标题]]；不在双链上返回 null。
 * 兼容 [[标题|别名]] 的写法（当前解析器只认标题，别名部分丢弃）。
 */
function wikiLinkTitleAt(node: Node, offset: number): string | null {
  if (node.nodeType !== Node.TEXT_NODE) return null
  const text = node.textContent ?? ''
  const re = /\[\[([^[]\]\n]+)\]\]/g
  let m: RegExpExecArray | null = re.exec(text)
  while (m) {
    const start = m.index
    const end = m.index + m[0].length
    if (offset >= start && offset <= end) {
      const target = m[1]
      const title = target.includes('|') ? target.slice(0, target.indexOf('|')) : target
      return title.trim()
    }
    m = re.exec(text)
  }
  return null
}

/**
 * 从当前 selection 找到**最内层**的行内容器。
 *
 * 为什么不能复用 currentBlock：列表项里的文字，currentBlock 返回的是顶层 <ul>，
 * 对它做 `innerHTML = ...` 会把整个列表结构替换成纯文本 —— **直接破坏用户的列表**。
 * 行内渲染必须作用在真正承载文字的那个元素（li / p / h*）上。
 */
function innermostInlineHost(root: HTMLElement): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  let node: Node | null = sel.getRangeAt(0).startContainer
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && INLINE_HOSTS.has((node as HTMLElement).tagName.toLowerCase())) {
      return node as HTMLElement
    }
    node = node.parentNode
  }
  // 光标直接在根上（还没成块的裸文本）：退化为返回根，由调用方决定是否处理
  return null
}

/** 把光标放到元素末尾 */
function placeCaretAtEnd(el: HTMLElement): void {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/** 在光标处插入纯文本（换行 / 缩进用，避免浏览器把它拆成 div 破坏 pre 的缩进） */
function insertTextAtCaret(text: string): void {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()

  /*
   * 光标在文本节点里时**就地插入**（insertData），而不是新建一个兄弟文本节点。
   * 拆成两个节点后，Chromium 会把光标停在前一个节点末尾 —— 表现为
   * "回车后继续打字，新内容跑到了换行符前面"（实测）。
   */
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const node = range.startContainer as Text
    const at = range.startOffset
    node.insertData(at, text)
    const next = document.createRange()
    next.setStart(node, at + text.length)
    next.collapse(true)
    sel.removeAllRanges()
    sel.addRange(next)
    return
  }

  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** 在光标处插入纯文本（按行拆成文本节点 + <br>，换行成为真正的块分隔） */
function insertPlainTextAtCaret(text: string): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const lines = text.split('\n')
  const frag = document.createDocumentFragment()
  lines.forEach((line, i) => {
    if (i > 0) frag.appendChild(document.createElement('br'))
    frag.appendChild(document.createTextNode(line))
  })
  const last = frag.lastChild
  range.insertNode(frag)
  if (last) {
    const after = document.createRange()
    after.setStartAfter(last)
    after.collapse(true)
    sel.removeAllRanges()
    sel.addRange(after)
  }
  return true
}

/** 从节点向上找最近的指定标签（限制在 root 内） */
function closestTag<K extends keyof HTMLElementTagNameMap>(
  node: Node | null,
  root: HTMLElement,
  tag: K,
): HTMLElementTagNameMap[K] | null {
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === tag) {
      return node as HTMLElementTagNameMap[K]
    }
    node = node.parentNode
  }
  return null
}

/** 当前光标所在的表格单元格 */
function currentCell(root: HTMLElement): HTMLTableCellElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  return closestTag(sel.getRangeAt(0).startContainer, root, 'td') ??
    closestTag(sel.getRangeAt(0).startContainer, root, 'th')
}

/** 当前光标所在的表格 */
function currentTable(root: HTMLElement): HTMLTableElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  return closestTag(sel.getRangeAt(0).startContainer, root, 'table')
}

/** 当前光标所在的代码块（只认编辑器的顶层 <pre>） */
function currentPre(root: HTMLElement): HTMLPreElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const pre = closestTag(sel.getRangeAt(0).startContainer, root, 'pre')
  if (!pre) return null
  return pre.parentElement === root ? (pre as HTMLPreElement) : null
}

/** 代码块语言清单（与预览侧高亮支持的语言对齐，另加 mermaid） */
const CODE_LANGUAGES = [
  'ts', 'js', 'tsx', 'jsx', 'python', 'java', 'go', 'rust',
  'sql', 'bash', 'json', 'yaml', 'html', 'css', 'markdown', 'mermaid', 'text',
] as const

/**
 * 确保表格有 tbody：从表头行加行时必须插到 tbody 里，
 * 否则会在 thead 中插入第二个 tr，语义与渲染都会错。
 */
function ensureTableBody(table: HTMLTableElement): HTMLTableSectionElement {
  const existing = table.querySelector(':scope > tbody') as HTMLTableSectionElement | null
  if (existing) return existing
  const tbody = document.createElement('tbody')
  table.appendChild(tbody)
  return tbody
}

/** 把光标放到单元格里（空单元格需要可落点） */
function focusCell(cell: HTMLTableCellElement): void {
  if (!cell.firstChild) {
    cell.appendChild(document.createElement('br'))
  }
  placeCaretAtEnd(cell)
}

/** 新建一个空行（单元格数与参考行一致） */
function createEmptyRow(reference: HTMLTableRowElement): HTMLTableRowElement {
  const row = document.createElement('tr')
  for (let i = 0; i < reference.cells.length; i++) {
    const td = document.createElement('td')
    td.appendChild(document.createElement('br'))
    row.appendChild(td)
  }
  return row
}

/** Tab / Shift+Tab 在单元格之间移动；越过最后一格时自动补一行 */
function moveTableCell(cell: HTMLTableCellElement, direction: -1 | 1): void {
  const table = cell.closest('table')
  if (!table) return
  const cells = Array.from(table.querySelectorAll('td, th')) as HTMLTableCellElement[]
  const index = cells.indexOf(cell)
  let next: HTMLTableCellElement | undefined = cells[index + direction]

  if (!next && direction === 1) {
    const row = cell.parentElement as HTMLTableRowElement
    const newRow = createEmptyRow(row)
    if (row.parentElement?.tagName.toLowerCase() === 'thead') ensureTableBody(table).appendChild(newRow)
    else row.after(newRow)
    next = newRow.cells[0]
  } else if (!next) {
    next = cells[0]
  }

  if (next) focusCell(next)
}

/**
 * 在光标处插入一个换行（代码块专用）。
 *
 * 不能用文本节点里的 `\n`：Chromium 在 `white-space: pre` 里无法把光标放到
 * 结尾换行符之后，回车后继续打字会落在换行符**前面**（实测）。
 * 改用 `<br>` + 一个空文本节点承载光标，回写时再把 `<br>` 还原成 `\n`。
 */
function insertLineBreakAtCaret(): void {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()

  const br = document.createElement('br')
  // 零宽空格让「下一行」有一个真实的文本节点承载光标；回写时会被剔除
  const tail = document.createTextNode('\u200B')
  const frag = document.createDocumentFragment()
  frag.appendChild(br)
  frag.appendChild(tail)
  range.insertNode(frag)

  const next = document.createRange()
  next.setStart(tail, 1)
  next.collapse(true)
  sel.removeAllRanges()
  sel.addRange(next)
}

/** 光标是否位于某个块元素的末尾（用于"标题末尾回车退出为正文"） */
function isCaretAtEnd(host: HTMLElement): boolean {  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!host.contains(range.endContainer)) return false
  const probe = range.cloneRange()
  probe.selectNodeContents(host)
  probe.setStart(range.endContainer, range.endOffset)
  return probe.toString().length === 0
}

/**
 * 取 <pre> 的纯文本，把 <br> 还原成换行、剔除零宽占位字符。
 *
 * 代码块里 Enter 插入的是 <br> + 一个零宽空格文本节点（见 insertLineBreakAtCaret），
 * 直接用 textContent 会把换行吃掉、把零宽字符留下 —— 判定末尾空行、裁剪尾行都会错。
 */
function preTextOf(pre: HTMLElement): string {
  let out = ''
  const walk = (node: Node): void => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += (child.textContent ?? '').replace(/\u200B/g, '')
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as HTMLElement).tagName.toLowerCase()
        if (tag === 'br') out += '\n'
        else walk(child)
      }
    })
  }
  walk(pre)
  return out
}

/**
 * 光标落在 <pre> 自身（而不是内部的 <code>）时，把它移进代码文本末尾。
 *
 * 浏览器在代码块的 padding 区域点击会把光标放在 <pre> 上，此后输入的文字
 * 挂在 <code> 外面，回写时整块结构错位（实测：文字跑到代码块前后）。
 */
function normalizePreCaret(root: HTMLElement): void {
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
 * 确保空块里有 `<br>`，否则**光标落不进去**。
 *
 * contenteditable 的已知行为：空元素没有可聚焦的内容，浏览器会把光标留在
 * 父节点上。实测症状：输入 `# ` 转成 h1 后继续打字，文字出现在 `<h1>` **外面**
 * （`一级标题<h1></h1>`）—— 内容看似输入了，实际结构已损坏。
 */
function ensureFocusable(el: HTMLElement): void {
  if (el.childNodes.length === 0) {
    el.appendChild(document.createElement('br'))
  }
}

/**
 * 行内标记的**统一定义**。
 *
 * 为什么要抽成一份：触发检测（hasCompleteInlineMarkup / endsWithMarkupPair）和
 * 实际渲染（inlineMdToHtml）必须认同一套语法，否则会出现「检测到了但不渲染」
 * 或「渲染了但检测不到」的静默不一致。实测就踩过：手打的 `[链接](url)` 与
 * `_斜体_` 不在检测集合里，工具栏插入的链接能渲染、手打的却一直显示源码。
 *
 * 顺序：长的、含特殊字符多的排前面，避免 `**` 被 `*` 抢先匹配。
 */
const INLINE_MARKUP_PATTERNS = [
  /\*\*\*[^*\n]+\*\*\*/,
  /\*\*[^*\n]+\*\*/,
  /~~[^~\n]+~~/,
  /`[^`\n]+`/,
  /!?\[[^\]\n]*\]\([^)\s]+\)/,
  /(^|[^*\w])\*[^*\n]+\*/,
  /(^|[^\w])_[^_\n]+_/,
]

/** 文本里是否含任意一个完整行内标记 */
function containsInlineMarkup(text: string): boolean {
  return INLINE_MARKUP_PATTERNS.some((re) => re.test(text))
}

/** 是否以某个完整的行内标记对**结尾**（后面可以只有空白） */
function endsWithMarkupPair(trimmed: string): boolean {
  const atEnd = [
    /\*\*\*[^*\n]+\*\*\*$/,
    /\*\*[^*\n]+\*\*$/,
    /~~[^~\n]+~~$/,
    /`[^`\n]+`$/,
    /!?\[[^\]\n]*\]\([^)\s]+\)$/,
    /(^|[^*\w])\*[^*\n]+\*$/,
    /(^|[^\w])_[^_\n]+_$/,
  ]
  return atEnd.some((re) => re.test(trimmed))
}

/**
 * 行内渲染的触发条件（实测得出的精确条件）。
 *
 * 有完整标记对，且**去尾空白后标记对不在末尾**时才渲染。
 *
 * 为什么不能在末尾渲染：渲染会把光标留在紧跟 `<strong>` 的文本节点末尾，
 * 此时再输入字符，**Chrome 会把新字符并入 `<strong>`** —— 实测
 * `这是 **加粗** ` + "文" 得到 `<strong>加粗文</strong>`（"文"也变粗了）。
 *
 * 为什么"后面有文字"就安全：渲染后光标落在标记对**之后**那段文字的末尾，
 * 其后没有行内元素，继续输入不会被吞。
 *
 * 末尾的情况（用户刚打完 `**加粗**`）留给 Enter / 失焦时补渲染。
 */
function hasCompleteInlineMarkup(text: string): boolean {
  if (!containsInlineMarkup(text)) return false
  return !endsWithMarkupPair(text.replace(/\s+$/, ''))
}

/**
 * 把 Markdown 里的**可见字符偏移**换算出来。
 *
 * 渲染前的偏移按源码计（含 `**` / `[文字](url)` 等标记），渲染后按可见文本计 ——
 * 两者不等长，直接沿用源码偏移会让光标落到错误位置。
 *
 * 处理顺序与 inlineMdToHtml 保持一致：先剥链接只留文字，再剥强调标记。
 * 漏掉链接会让光标偏出「括号 + URL」那么多字符（实测：写完 `[文字](url)` 后
 * 继续打字，字符落到链接中间）。
 */
function visibleOffset(rawPrefix: string): number {
  return rawPrefix
    // 图片整体不可见（占位 0 字符），链接只保留方括号里的文字
    .replace(/!\[[^\]]*\]\([^)\s]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)\s]*\)/g, '$1')
    // 行内代码先去掉反引号（内容保留），再统一剥强调标记
    .replace(/`/g, '')
    .replace(/\*\*\*|\*\*|~~|_/g, '')
    .replace(/\*/g, '')
    .length
}

/**
 * 对指定行内容器做一次行内渲染。
 *
 * @param requireTrailing 是否要求标记对之后还有内容。
 *   输入过程中用 true（避免光标停在行内元素边界）；
 *   离开块（Enter / blur）时用 false（此时光标本来就要离开）。
 * @returns 是否发生了渲染
 */
function renderInlineMarkup(host: HTMLElement, requireTrailing: boolean): boolean {
  /*
   * 取原始行内 Markdown 时把 nbsp 还原成普通空格（contenteditable 会把行尾空格
   * 存成 &nbsp;）。这一步与 inlineMdToHtml 内部保持一致，否则后面写回 data-md 的
   * 文本带 &nbsp;、与用户实际敲的内容不符。
   */
  /*
   * 渲染输入取 DOM 当前可见文本（nbsp 归一化）。
   *
   * 这里**不能**用 data-md 当输入：data-md 是整个块的源码，而 host 可能只是
   * 块内的一层容器（li/td），整行源码喂进去会把结构写错位。
   *
   * 链接被渲染成 <a> 后失去 `[文字](url)` 标记的问题，改由 handleInput 里的
   * 顺序保证：先 commit（DOM→MD 写进 data-md），再渲染 —— 渲染只处理"尚未
   * 渲染过、标记还在文本里"的那部分。
   */
  const raw = (host.textContent ?? '').replace(/\u00a0/g, ' ')
  // 输入过程中要求"标记对后紧跟非空白"（见 hasCompleteInlineMarkup 注释）；
  // 离开块时（Enter/失焦）不要求 —— 此时光标本就离开，不会再有输入被吞。
  const complete = requireTrailing
    ? hasCompleteInlineMarkup(raw)
    : /\*\*[^*\n]+\*\*|(^|[^*])\*[^*\n]+\*|~~[^~\n]+~~|`[^`\n]+`/.test(raw)
  if (!complete) return false

  const html = inlineMdToHtml(raw)
  if (host.innerHTML === html) return false

  const rawCaret = getCaretOffset(host)
  host.innerHTML = html
  /*
   * 渲染后必须**保住这份源码**：把渲染前的原始行内 Markdown 写回块的 data-md。
   *
   * 否则 data-md 仍是渲染前更早的旧值，回写时"语义文本 vs 源码"对不上，
   * 于是走"从 DOM 重新推导"分支 —— 推导只认 `**`/`*` 只认一套写法，
   * 用户的 `_斜体_` 会被静默改写成 `*斜体*`、`[文字](url)` 也会退化成纯文本
   * （实测：打完链接再打斜体，data-md 变成 `见 官网 与 *斜体* 文字`，链接结构丢失）。
   *
   * 写 data-md 是安全的：它本来就该等于"这个块当前的 Markdown 源码"，
   * 而 raw 正是用户刚刚键入、即将被 commit 上抛的同一份源码。
   */
  /*
   * 不在这里改 data-md。
   *
   * data-md 的权威更新点是 commit()（DOM→MD 后统一刷新，见 refreshBlockDataMd）。
   * 在这里按"行内可见文本"覆写，会把整块源码（含链接、块标记）截断成残片，
   * 实测表现为后续输入再也写不进源码。
   */
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
 * 若最后一个子节点是行内元素，在其后补一个空文本节点。
 * 这样光标（在元素末尾）会落到该文本节点里，后续输入不会被并入行内元素。
 */
function ensureTrailingTextNode(host: HTMLElement): void {
  const last = host.lastChild
  if (!last) return
  if (last.nodeType === Node.TEXT_NODE) return
  const inlineTags = new Set(['strong', 'em', 'code', 'del', 'a', 'mark', 'u', 'sub', 'sup'])
  if (last.nodeType === Node.ELEMENT_NODE && inlineTags.has((last as HTMLElement).tagName.toLowerCase())) {
    host.appendChild(document.createTextNode(''))
    placeCaretAtEnd(host)
  }
}

export const RichEditor = React.forwardRef<RichEditorHandle, RichEditorProps>(function RichEditor(
  { activeDoc, updateDocContent, fontSize, onScroll, onMount, onSlashChange, onInsertImage, onInsertFile, onInsertMarkdown, resolveShortcut, onFormatShortcut, slashActive = false, onWikiLink, className = '' },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  /** 编辑器根节点（挂载后可用；块级手柄需要它算坐标） */
  const [mountedRoot, setMountedRoot] = useState<HTMLDivElement | null>(null)
  /**
   * 表格上下文工具栏：光标在表格内时浮出「加行 / 加列 / 删除」。
   *
   * 富文本里表格是 DOM 结构，用户没法像编辑 Markdown 那样手动加一行 ——
   * 没有这组操作，表格一旦插入就"只能填、不能改"，这是语雀用户最常抱怨的缺口。
   */
  const [tableBar, setTableBar] = useState<{
    table: HTMLTableElement
    cell: HTMLTableCellElement
    top: number
    left: number
  } | null>(null)

  /**
   * 代码块上下文工具条：光标在代码块内时浮出「语言 + 复制」。
   *
   * 语雀的代码块是"可配置的块"（语言标签 + 一键复制 + 换语言）；
   * 这里原先只有一个裸 <pre>，语言写进围栏后再也改不了，也没法整段复制。
   * 工具条放在 contenteditable **外面**，避免按钮 DOM 被回写成正文。
   */
  const [codeBar, setCodeBar] = useState<{
    pre: HTMLPreElement
    top: number
    left: number
    lang: string
  } | null>(null)
  /**
   * 图片选中态（语雀式：点选图片后出现缩放工具条 + 右下角拖拽手柄）。
   *
   * 工具条与手柄必须挂在 contenteditable **外面**：往 <p> 里插按钮会被
   * `editorHtmlToMarkdown` 当成正文回写，用户的 Markdown 里会多出一堆按钮文本。
   */
  const [imageSel, setImageSel] = useState<{
    img: HTMLImageElement
    top: number
    left: number
    width: number
    height: number
  } | null>(null)
  /** 拖拽缩放时的起点 */
  const imageDragRef = useRef<{ startX: number; startWidth: number; img: HTMLImageElement } | null>(null)
  /** 代码块语言下拉是否展开 */
  const [codeLangOpen, setCodeLangOpen] = useState(false)
  /** 复制成功的瞬时反馈 */
  const [codeCopied, setCodeCopied] = useState(false)
  /** 记住正在编辑的文档 id，避免切换文档时把旧内容写进新文档 */
  const editingDocIdRef = useRef<string | null>(null)
  /** 程序化设置内容时置位，避免把这次"渲染"当成用户输入再回写一次 */
  const settingContentRef = useRef(false)
  /**
   * 记录"上一次由本编辑器写出去的 Markdown"。
   *
   * 这是防止 effect 与用户输入打架的关键：用户打字 → commit → doc.content 变化
   * → 同步 effect 触发 → 若它认为"外部内容变了"就整体重渲染 → **光标被重置**，
   * 表现为后续输入被并进前一个行内元素（实测：`**加粗**` 后打"文"变成
   * `<strong>加粗文</strong>`）。
   * 只要 doc.content 等于我们自己刚写出去的值，就说明这次变化源于本编辑器，跳过重渲染。
   */
  const lastWrittenRef = useRef<string | null>(null)
  /**
   * 输入法组合态标志（缺陷3）。
   *
   * 拼音输入期间浏览器会连续派发 input 事件（内容是未确认的拼音串），
   * 此时跑输入规则/行内渲染/回写会打断组合、产生脏撤销快照。
   * compositionstart 置位、compositionend 清零并补跑一次完整处理。
   */
  const composingRef = useRef(false)
  /** Ctrl+Shift+V：下一次粘贴走纯文本（keydown 置位，paste 消费，与旧内核同机制） */
  const plainTextPasteRef = useRef(false)
  /** Ctrl+Alt+C：下一次复制写入 Markdown 源码（keydown 置位，copy 消费） */
  const copyAsMarkdownRef = useRef(false)

  /* ---------------- 渲染：Markdown → HTML ---------------- */

  /**
   * 标题折叠。
   *
   * 为什么用"隐藏兄弟块"而不是插入折叠容器：contenteditable 里插入任何包裹元素
   * 都会被 `editorHtmlToMarkdown` 当成正文读走（用户内容被污染）。这里只在
   * 被折叠的块上加 class，DOM 结构不变，回写读到的文本也完全一致 ——
   * `display:none` 不影响 textContent，所以往返保真不受影响。
   *
   * 折叠状态按"第几个标题"记在 ref 里：内容重建（换文档、外部更新）后按序号恢复，
   * 否则用户折叠了三个小节，一打字就全展开了。
   */
  const foldedHeadingsRef = useRef<Set<number>>(new Set())

  /** 按当前 DOM 应用折叠：折叠标题之后、下一个同级或更高级标题之前的块全部隐藏 */
  const applyFolds = useCallback((root: HTMLElement) => {
    let hideBelow = 0
    for (const child of Array.from(root.children) as HTMLElement[]) {
      const level = /^H([1-6])$/.exec(child.tagName)?.[1]
      if (level) {
        const lv = Number(level)
        if (hideBelow && lv <= hideBelow) hideBelow = 0
        const folded = child.dataset.folded === '1'
        child.classList.toggle('is-folded', folded)
        if (folded) hideBelow = lv
        continue
      }
      child.classList.toggle('is-folded-body', hideBelow > 0)
    }
  }, [])

  /** 内容重建后：按序号把折叠状态写回标题，再统一应用 */
  const restoreFolds = useCallback(
    (root: HTMLElement) => {
      const headings = Array.from(root.children).filter((el) => /^H[1-6]$/.test(el.tagName))
      headings.forEach((el, index) => {
        if (foldedHeadingsRef.current.has(index)) el.setAttribute('data-folded', '1')
        else el.removeAttribute('data-folded')
      })
      applyFolds(root)
    },
    [applyFolds],
  )

  /* ---------------- 图片缩放 ---------------- */

  /** 当前选中的图片（class 标记在 img 上，位置状态在 imageSel 里） */
  const selectedImgRef = useRef<HTMLImageElement | null>(null)

  const measureImage = useCallback((img: HTMLImageElement) => {
    const rect = img.getBoundingClientRect()
    setImageSel({ img, top: rect.top, left: rect.left, width: rect.width, height: rect.height })
  }, [])

  const selectImage = useCallback(
    (img: HTMLImageElement) => {
      selectedImgRef.current?.classList.remove('is-selected')
      img.classList.add('is-selected')
      selectedImgRef.current = img
      measureImage(img)
    },
    [measureImage],
  )

  const clearImageSel = useCallback(() => {
    selectedImgRef.current?.classList.remove('is-selected')
    selectedImgRef.current = null
    setImageSel(null)
  }, [])

  /**
   * 设置图片宽度（px）。传 null 表示恢复原始尺寸。
   *
   * 必须**同时**清掉 width/height 属性：markdownToHtml 渲染带尺寸的图片时写的是
   * `width="320"` 属性，若只改 style，回写时优先读属性就会拿到旧值（拖了没反应）。
   */
  const applyImageWidth = useCallback(
    (img: HTMLImageElement, px: number | null) => {
      if (px === null) {
        img.style.removeProperty('width')
      } else {
        img.style.width = `${Math.round(px)}px`
      }
      img.removeAttribute('width')
      img.removeAttribute('height')
      measureImage(img)
    },
    [measureImage],
  )

  /** 点空白处取消选中（工具条与手柄自身不触发） */
  useEffect(() => {
    if (!imageSel) return
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('.image-toolbar') || target.closest('.image-resize-handle')) return
      if (target.tagName === 'IMG' && rootRef.current?.contains(target)) return
      clearImageSel()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [imageSel, clearImageSel])

  /*
   * 图片工具条/手柄是 fixed 定位的：滚动或窗口变化后必须重新测量，
   * 否则工具条会停在原地、与图片脱锚（截图工具条和表格工具条同样处理）。
   */
  const hasImageSel = imageSel !== null
  useEffect(() => {
    if (!hasImageSel) return
    const update = (): void => {
      if (selectedImgRef.current) measureImage(selectedImgRef.current)
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [hasImageSel, measureImage])

  /**
   * 点击标题左侧折叠热区 → 折叠/展开该标题下的块。
   *
   * 顺带处理编辑态双链：Ctrl/Cmd+点击 [[标题]] 打开目标文档（P：编辑态双链不可点）。
   */
  const handleRootClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const root = rootRef.current
      if (!root) return
      // Ctrl/Cmd + 点击 [[双链]]：跳到目标文档（普通点击仍只落光标，不打断编辑）
      if (onWikiLink && (e.ctrlKey || e.metaKey)) {
        const point = caretNodeAtPoint(e.clientX, e.clientY)
        const title = point ? wikiLinkTitleAt(point.node, point.offset) : null
        if (title) {
          e.preventDefault()
          onWikiLink(title)
          return
        }
      }
      // 点图片 → 选中并浮出缩放工具条（语雀式）
      const img = (e.target as HTMLElement).closest('img') as HTMLImageElement | null
      if (img && root.contains(img)) {
        selectImage(img)
        return
      }
      const heading = (e.target as HTMLElement).closest('h1,h2,h3,h4,h5,h6') as HTMLElement | null
      // 只处理编辑器的顶层标题（blockquote 内的标题不参与折叠）
      if (!heading || heading.parentElement !== root) return
      const rect = heading.getBoundingClientRect()
      if (e.clientX - rect.left > 18) return
      e.preventDefault()
      const headings = Array.from(root.children).filter((el) => /^H[1-6]$/.test(el.tagName)) as HTMLElement[]
      const index = headings.indexOf(heading)
      if (index < 0) return
      if (heading.dataset.folded === '1') {
        heading.removeAttribute('data-folded')
        foldedHeadingsRef.current.delete(index)
      } else {
        heading.setAttribute('data-folded', '1')
        foldedHeadingsRef.current.add(index)
      }
      applyFolds(root)
    },
    [applyFolds, selectImage, onWikiLink],
  )

  /*
   * 编辑态双链的可发现性：悬停到 [[...]] 上时把操作提示写进 title。
   *
   * 没有这条，Ctrl+点击 是个"没人知道的快捷键"。rAF 合并连续 mousemove，
   * 每帧最多一次命中测试（与 BlockHandle 的 elementFromPoint 同一量级）；
   * 不在双链上时清空 title，避免整篇正文挂一个常驻 tooltip。
   */
  useEffect(() => {
    const root = rootRef.current
    if (!root || !onWikiLink) return
    let raf = 0
    const onMove = (e: MouseEvent): void => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const point = caretNodeAtPoint(e.clientX, e.clientY)
        const title = point ? wikiLinkTitleAt(point.node, point.offset) : null
        const next = title ? `Ctrl/Cmd+点击打开「${title}」` : ''
        if (root.title !== next) root.title = next
      })
    }
    root.addEventListener('mousemove', onMove)
    return () => {
      root.removeEventListener('mousemove', onMove)
      if (raf) cancelAnimationFrame(raf)
      root.title = ''
    }
  }, [onWikiLink, mountedRoot])

  const renderFromMarkdown = useCallback(
    (md: string) => {
      const root = rootRef.current
      if (!root) return
      settingContentRef.current = true
      root.innerHTML = markdownToEditorHtml(md)
      settingContentRef.current = false
      restoreFolds(root)
    },
    [restoreFolds],
  )

  // 切换文档或外部内容变化时重渲染。
  // 只在"文档切换"或"内容与当前 DOM 不一致"时重建，避免每次输入都整体重建 DOM
  // （整体重建会丢光标位置，用户打字时表现为光标乱跳）。
  const docId = activeDoc?.id ?? null
  const docContent = activeDoc?.content ?? ''
  /*
   * 撤销/重做执行序号（store 单一数据源）。
   *
   * 键盘 Ctrl+Z/Y 走 App 全局快捷键，不经过 Editor 的 forceRender 包装；
   * 若只比对 lastWrittenRef，"重做回到刚写出的值"会被误判为无需重建
   * （实测：Ctrl+Z 后 Ctrl+Y 静默无效）。订阅序号后，任何入口的撤销/重做
   * 都会让本 effect 重跑并强制重建 DOM。
   */
  const undoRedoSeq = useNotesStore((s) => s.undoRedoSeq)
  const lastUndoRedoSeqRef = useRef(undoRedoSeq)
  /** P2-11：块删除的「撤销」复用统一实现，不另造写入方 */
  const { undo } = useUndoRedo()
  /*
   * P2-11：重建之后要恢复的光标（Markdown 源码偏移）。
   *
   * 「删除块」给出带撤销按钮的提示，而撤销会走下面的整体重建 —— 光标随之丢失。
   * 与查找替换（Editor 的 pendingSelection）同一套思路：**先登记目标，重建完成后落位**。
   * 由本组件自己的 effect 消费（子 effect 内顺序确定），不依赖 rAF 排队。
   */
  const pendingCaretRef = useRef<number | null>(null)
  const applyPendingCaret = useCallback(() => {
    const offset = pendingCaretRef.current
    if (offset === null) return
    pendingCaretRef.current = null
    const root = rootRef.current
    if (!root) return
    root.focus()
    selectByMarkdownOffset(root, offset, offset)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root || !docId) return

    const docChanged = editingDocIdRef.current !== docId
    editingDocIdRef.current = docId
    // 换文档时必须清掉"自己写出的值"，否则会拿上一篇的 md 去比对
    if (docChanged) lastWrittenRef.current = null

    if (docChanged) {
      // 折叠状态属于"当前这篇文档的阅读位置"，换文档必须清空
      foldedHeadingsRef.current.clear()
      // 上一篇登记的光标对新文档没有意义，丢弃
      pendingCaretRef.current = null
      lastUndoRedoSeqRef.current = undoRedoSeq
      renderFromMarkdown(docContent)
      return
    }

    // 撤销/重做刚执行过：无条件重建（内容可能恰好等于 lastWrittenRef）
    if (lastUndoRedoSeqRef.current !== undoRedoSeq) {
      lastUndoRedoSeqRef.current = undoRedoSeq
      lastWrittenRef.current = null
      renderFromMarkdown(docContent)
      applyPendingCaret()
      return
    }

    /*
     * 同一文档：只在"外部内容变化"时重建。
     *
     * 若 docContent 正好等于本编辑器上一次写出去的值，说明这次变化是我们自己
     * 造成的（用户打字 → commit → store 更新 → 回流到这里），**必须跳过重建**：
     * 重建会替换 DOM、重置光标，表现为后续输入被并进前一个行内元素。
     * 只有撤销、AI 回写、恢复版本这类真正的外部改动才需要重建。
     */
    if (lastWrittenRef.current === docContent) return

    const currentMd = editorHtmlToMarkdown(root)
    if (currentMd !== docContent) {
      renderFromMarkdown(docContent)
      applyPendingCaret()
    }
  }, [docId, docContent, undoRedoSeq, renderFromMarkdown, applyPendingCaret])

  /* ---------------- 回写：HTML → Markdown ---------------- */

  const commit = useCallback(() => {
    const root = rootRef.current
    if (!root || settingContentRef.current) return
    const md = editorHtmlToMarkdown(root)
    /*
     * 回写后刷新各块的 data-md。
     *
     * data-md 是偏移换算的依据，但它只在渲染时写入；用户打字后块内容已变、
     * data-md 还是旧值，读光标偏移/斜杠检测都会按过期源码算 —— 位置全错。
     * 这里在每次回写后同步一次，保证换算始终基于当前内容。
     */
    refreshBlockDataMd(root, md)
    const doc = activeDoc
    if (doc && md !== doc.content) {
      // 记下写出去的值：同步 effect 见到它就知道"这是我自己的改动"，不重渲染
      lastWrittenRef.current = md
      updateDocContent({ content: md })
    }
  }, [activeDoc, updateDocContent])

  /* ---------------- 图片缩放：依赖 commit 的操作 ---------------- */

  const setImageRatio = useCallback(
    (ratio: number) => {
      const img = selectedImgRef.current
      const root = rootRef.current
      if (!img || !root) return
      const cs = getComputedStyle(root)
      const contentWidth = root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      applyImageWidth(img, contentWidth * ratio)
      commit()
    },
    [applyImageWidth, commit],
  )

  const resetImageWidth = useCallback(() => {
    const img = selectedImgRef.current
    if (!img) return
    applyImageWidth(img, null)
    commit()
  }, [applyImageWidth, commit])

  const onImageHandleDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const img = selectedImgRef.current
    if (!img) return
    e.preventDefault()
    e.stopPropagation()
    imageDragRef.current = { startX: e.clientX, startWidth: img.getBoundingClientRect().width, img }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onImageHandleMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = imageDragRef.current
      if (!drag) return
      applyImageWidth(drag.img, Math.max(60, drag.startWidth + (e.clientX - drag.startX)))
    },
    [applyImageWidth],
  )

  const onImageHandleUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!imageDragRef.current) return
      imageDragRef.current = null
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      commit()
    },
    [commit],
  )

  /* ---------------- 输入即时转换 ---------------- */

  /**
   * 处理 `# ` `- ` 之类的输入标记。
   *
   * 用 DOM API 构造目标元素（不拼 HTML 字符串）：字符串拼接在层级/属性上很容易出错，
   * 而且会重新经过 innerHTML 解析，可能被用户输入里的尖括号影响。
   */
  const applyInputRule = useCallback((): boolean => {
    const root = rootRef.current
    if (!root) return false
    const block = currentBlock(root)
    if (!block) return false

    const text = (block.textContent ?? '').replace(/\u00a0/g, ' ')

    // `---` 单独成行 → 分割线（它没有"内容"，单独处理）
    if (/^---$/.test(text)) {
      const hr = document.createElement('hr')
      hr.setAttribute('data-md', '---')
      block.replaceWith(hr)
      // 分割线后补一个空段落，否则用户没法继续输入
      const p = document.createElement('p')
      p.appendChild(document.createElement('br'))
      hr.after(p)
      placeCaretAtEnd(p)
      return true
    }

    /*
     * 列表项 → 任务项升级。
     *
     * 为什么必须在块级规则**之前**处理：用户输入 `- ` 的瞬间就变成了普通列表
     * （`- ` 规则立即命中），之后继续打 `[ ] ` 时块已经是 `<ul><li>` 了，
     * 块级规则再也匹配不到 `- [ ]` —— 实测症状是"任务列表永远生成不出勾选框，
     * `[ ]` 原样留在文字里"。
     *
     * 所以这里单独判断：光标所在的 li 里，文本以 `[ ] ` 或 `[x] ` 开头时，
     * 把该 li 升级成任务项（补 checkbox + span 结构，与 markdownToHtml 一致）。
     */
    const sel0 = window.getSelection()
    if (sel0 && sel0.rangeCount > 0) {
      let node0: Node | null = sel0.getRangeAt(0).startContainer
      let li0: HTMLElement | null = null
      while (node0 && node0 !== root) {
        if (node0.nodeType === Node.ELEMENT_NODE && (node0 as HTMLElement).tagName.toLowerCase() === 'li') {
          li0 = node0 as HTMLElement
          break
        }
        node0 = node0.parentNode
      }
      if (li0 && !li0.querySelector('input[type="checkbox"]')) {
        const raw = (li0.textContent ?? '')
        /*
         * 只在 `[ ] ` **后面已有内容**时才升级。
         *
         * 若在刚打完 `[ ] `（内容还是空）时就升级，我们建出 `box + 空 span`，
         * 随后浏览器把用户继续输入的字符插到 span **外面** ——
         * 实测 DOM 变成 `<input>待办事项<span></span>`，data-md 只剩 `- [ ] `。
         * 等有内容再升级，就能一次性把文本放进 span，结构稳定。
         */
        const tm = /^\s*\[([ xX])\]\s+([\s\S]+)$/.exec(raw)
        if (tm) {
          const list = li0.parentElement
          if (list) {
            list.classList.add('task-list')
            li0.className = tm[1].toLowerCase() === 'x' ? 'task-item task-done' : 'task-item'
            const box = document.createElement('input')
            box.type = 'checkbox'
            box.checked = tm[1].toLowerCase() === 'x'
            box.setAttribute('contenteditable', 'false')
            const span = document.createElement('span')
            span.textContent = tm[2].replace(/\u00a0/g, ' ')
            /*
             * 结构与 markdownToHtml 生成的完全一致：`<input> <span>文字</span>`。
             *
             * 中间那个空格文本节点很重要：没有它，checkbox 和 span 紧贴，
             * 浏览器在两者边界处的插入行为不稳定（实测文本会跑到 span 外面）。
             */
            li0.replaceChildren(box, document.createTextNode(' '), span)

            // 光标放进 span 内部的文本节点里，后续输入才会落进 span
            const tail = document.createTextNode('')
            span.appendChild(tail)
            const r = document.createRange()
            r.setStart(tail, 0)
            r.collapse(true)
            const s = window.getSelection()
            s?.removeAllRanges()
            s?.addRange(r)

            /*
             * 立即把正确源码写进 data-md。
             * 不写的话 editorHtmlToMarkdown 会按旧源码（含 `[ ]` 前缀）比较，
             * 勾选状态被判定为"没变"而丢失。
             */
            const mdLine = `- [${box.checked ? 'x' : ' '}] ${tm[2]}`
            li0.setAttribute('data-md', mdLine)
            list.setAttribute('data-md', mdLine)
            return true
          }
        }
      }
    }

    for (const rule of INPUT_RULES) {
      const m = rule.re.exec(text)
      if (!m) continue

      const rest = rule.keepText ? (m[m.length - 1] ?? '') : ''
      const attrs = rule.attrs?.(m) ?? {}

      let target: HTMLElement
      /** 光标最终要落进去的元素（列表是 li，其余是块本身） */
      let caretHost: HTMLElement

      if (rule.tag === 'li') {
        const list = document.createElement(attrs.ordered ? 'ol' : 'ul')
        if (attrs.start && attrs.start !== '1') list.setAttribute('start', attrs.start)
        const li = document.createElement('li')
        if (rest) li.textContent = rest
        list.appendChild(li)
        target = list
        caretHost = li
      } else if (rule.tag === 'h') {
        const h = document.createElement(`h${attrs.level ?? '1'}`)
        if (rest) h.textContent = rest
        target = h
        caretHost = h
      } else {
        const el = document.createElement(rule.tag)
        if (rest) el.textContent = rest
        target = el
        caretHost = el
      }

      // 空块必须有 <br> 才能落光标，否则后续输入会跑到块外面（实测的根因）
      ensureFocusable(caretHost)
      block.replaceWith(target)
      placeCaretAtEnd(caretHost)
      return true
    }

    return false
  }, [])

  /**
   * 同步斜杠命令触发状态。
   *
   * 用 Range 算菜单位置：拿光标所在文本节点的 client rect。
   * textarea 版用 canvas 量字符宽度，这里 DOM 已经排版好了，直接读 rect 更准。
   */
  const syncSlash = useCallback(
    (source: 'input' | 'cursor') => {
      if (!onSlashChange) return
      const root = rootRef.current
      if (!root) return
      const token = root && detectSlashInRoot(root)
      if (!token) {
        onSlashChange(null, source)
        return
      }

      const sel = window.getSelection()
      let caret = { top: 0, left: 0 }
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        /*
         * 零矩形保护：行首空块 / 刚换行时 getBoundingClientRect() 可能全 0，
         * 直接使用会把菜单摆到屏幕左上角（SelectionToolbar 有同样的保护，这里此前漏了）。
         */
        if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
          /*
           * 零矩形兜底不依赖任何额外布局读取。
           *
           * getComputedStyle / getBoundingClientRect 在 jsdom 里都要走一遍样式计算，
           * 会让这次 syncSlash 的耗时明显变长，进而改变 rAF 合并的时序
           * （实测：该测试单跑通过、全量跑超时）。这里给一个与视口无关的保守常量，
           * 由下面的视口钳制再收敛到安全位置。
           */
          caret = { top: 8, left: 8 }
        } else {
          caret = { top: rect.bottom + 4, left: rect.left }
        }
      }
      /*
       * 视口钳制：菜单宽 280px、最高 320px（见 editor.css 的 .slash-menu）。
       * 不钳制时，在编辑器右缘 / 底部输入 `/` 会让菜单伸出视口——#root 是
       * overflow:hidden，伸出去的部分既看不到也点不到（命令行使不出来）。
       */
      const MENU_W = 280
      const MENU_H = 320
      const clampX = Math.max(8, Math.min(caret.left, window.innerWidth - MENU_W - 8))
      const belowTop = caret.top
      const flipTop = belowTop + MENU_H > window.innerHeight - 8 ? caret.top - 4 - MENU_H : belowTop
      const clampY = Math.max(8, Math.min(flipTop, window.innerHeight - 48))
      onSlashChange({ ...token, caret: { top: clampY, left: clampX } }, source)
    },
    [onSlashChange],
  )

  const handleInput = useCallback((): void => {
    const root = rootRef.current
    if (!root) return
    // 输入法组合期间（拼音未确认）不做任何转换/回写：
    // 此时 DOM 里是临时拼音串，跑输入规则会打断组合、commit 会写入脏快照。
    // compositionend 后会补跑一次完整处理。
    if (composingRef.current) return

    // P1-8：一打字就解除 Tab 逃生武装，避免一次误按的 Esc 改变很久之后 Tab 的行为
    resetFocusEscape()

    // 点进代码块 padding 后直接输入时，先把光标移进 <code>（否则文字挂到代码块外）
    normalizePreCaret(root)

    // 1. 块级即时转换（`# ` → 标题、`- ` → 列表）
    const converted = applyInputRule()

    /*
     * 2. 行内即时渲染（`**加粗**` → 真的 <strong>）。
     *
     * 作用对象是最内层行内容器（li / p / h*）：对列表项文字用顶层 <ul> 的
     * innerHTML 会毁掉列表结构。
     *
     * 触发条件见 hasCompleteInlineMarkup 的注释 —— 标记对后面必须紧跟非空白
     * 字符，否则渲染会把光标留在 <strong> 边界上、后续输入被浏览器并入该元素。
     * 块末尾的情况（`**加粗**` 刚打完）留给 Enter / 失焦时补渲染。
     */
    /*
     * P1-6：一次击键只做**一遍**全文序列化。
     *
     * 旧写法是"行内渲染分支里先 commit 一次，最后再无条件 commit 一次" ——
     * 光标在加粗 / 链接 / 行内代码里打字时，每次按键都对全文做两遍
     * HTML→Markdown 序列化 + 两遍 data-md 重解析，大文档里这是打字卡顿的
     * 直接来源（另一处是文档体量本身）。现在只有"确实要渲染"才走先提交分支，
     * 且该分支自己收尾，末尾的重复提交一并去掉。
     */
    let committed = false
    if (!converted) {
      const host = innermostInlineHost(root)
      const raw = host ? (host.textContent ?? '').replace(/\u00a0/g, ' ') : ''
      if (host && hasCompleteInlineMarkup(raw)) {
        /*
         * 顺序很关键：**先把当前 DOM 回写成 Markdown 存进 data-md，再做行内渲染**。
         *
         * renderInlineMarkup 会重建 innerHTML —— 一渲染，链接的 [文字](url)、
         * 斜体的 _x_ 这些标记就从 DOM 里消失了。若此时才 commit，commit 读到的
         * 是"已经渲染过"的 DOM，只能从可见文本反推源码，链接被剥成纯文字、
         * _x_ 被改写成 *x*（实测）。
         *
         * 先 commit 一次，data-md 里就是用户真实键入的源码；随后的渲染只改 DOM、
         * 不动 data-md —— 因此这一次 commit 之后无需再提交（语义文本与源码一致，
         * 下次回写会原样取回 data-md）。
         */
        commit()
        renderInlineMarkup(host, true)
        committed = true
      }
    }

    if (!committed) commit()
    syncSlash('input')
  }, [applyInputRule, commit, syncSlash])

  /**
   * 输入法组合开始/结束（缺陷3）。
   *
   * Chromium 用回车确认拼音候选时，会先派发 isComposing=true 的 keydown Enter，
   * 随后才是 compositionend。handleKeyDown 与 handleInput 都必须跳过组合态，
   * 否则"回车选词"被当成换行/续列表，拼音组合被拆断。
   */
  const handleCompositionStart = useCallback((): void => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback((): void => {
    composingRef.current = false
    // 组合结束：补跑一次完整输入处理（转换规则 + 行内渲染 + 回写 + 斜杠同步）
    handleInput()
  }, [handleInput])

  /*
   * 斜杠菜单残留治理（缺陷4）：菜单打开期间监听 selectionchange。
   *
   * 旧实现只在 input 时同步斜杠状态，光标移开（点击别处 / 方向键）不触发 input，
   * 菜单就残留着；而它在 window 捕获阶段拦截 Enter，用户点到别处按回车会把命令
   * 执行到**旧位置**。这里选区一变就重新检测：离开 token 即上报 null 关闭菜单，
   * 仍在 token 内则更新位置。rAF 合并连续的 selectionchange，卸载时清理。
   * 只在菜单打开时挂监听，正常打字零开销。
   */
  useEffect(() => {
    if (!slashActive) return
    let raf = 0
    const onSelectionChange = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        syncSlash('cursor')
      })
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [slashActive, syncSlash])

  /* ---------------- 挂载与滚动 ---------------- */

  useEffect(() => {
    onMount?.(rootRef.current)
    /*
     * 同时记到本地 state：块级手柄需要 root 才能算坐标，
     * 而渲染期读 ref 会被 react-hooks/refs 拦（且首次渲染时 ref 还没挂上）。
     */
    setMountedRoot(rootRef.current)
    return () => {
      onMount?.(null)
      setMountedRoot(null)
    }
  }, [onMount])

  /* ---------------- 表格上下文工具栏 ---------------- */

  useEffect(() => {
    if (!mountedRoot) return
    const update = (): void => {
      const root = rootRef.current
      if (!root) return
      const table = currentTable(root)
      const cell = currentCell(root)
      if (!table || !cell) {
        setTableBar((prev) => (prev ? null : prev))
        return
      }
      const rect = table.getBoundingClientRect()
      const top = Math.max(8, rect.top - 36)
      const left = Math.max(8, Math.min(rect.right - 230, window.innerWidth - 240))
      setTableBar((prev) => {
        if (
          prev &&
          prev.table === table &&
          prev.cell === cell &&
          Math.abs(prev.top - top) < 1 &&
          Math.abs(prev.left - left) < 1
        ) {
          return prev
        }
        return { table, cell, top, left }
      })
    }
    document.addEventListener('selectionchange', update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      document.removeEventListener('selectionchange', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [mountedRoot])

  /* ---------------- 代码块工具条 ---------------- */

  useEffect(() => {
    if (!mountedRoot) return
    const update = (): void => {
      const root = rootRef.current
      if (!root) return
      const pre = currentPre(root)
      if (!pre) {
        setCodeBar((prev) => (prev ? null : prev))
        return
      }
      const rect = pre.getBoundingClientRect()
      const code = pre.querySelector('code')
      const lang = /language-([\w+-]+)/.exec(code?.className ?? '')?.[1] ?? 'text'
      const top = Math.max(8, rect.top - 34)
      const left = Math.max(8, Math.min(rect.right - 132, window.innerWidth - 140))
      setCodeBar((prev) => {
        if (
          prev &&
          prev.pre === pre &&
          prev.lang === lang &&
          Math.abs(prev.top - top) < 1 &&
          Math.abs(prev.left - left) < 1
        ) {
          return prev
        }
        return { pre, top, left, lang }
      })
    }
    document.addEventListener('selectionchange', update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      document.removeEventListener('selectionchange', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [mountedRoot])

  /**
   * 切换代码块语言。
   *
   * 语言存在两个地方，必须同时改：
   * - `<code class="language-xx">`：编辑器里的即时显示与"重新推导"时的来源；
   * - `data-md` 的围栏行：块未被编辑时回写**直接返回 data-md**，
   *   只改 class 不改围栏，换语言的结果会在下一次提交时被旧源码覆盖。
   */
  const setCodeLanguage = useCallback(
    (pre: HTMLPreElement, lang: string) => {
      const code = pre.querySelector('code')
      if (code) code.className = lang === 'text' ? '' : `language-${lang}`
      const stored = pre.getAttribute('data-md')
      if (stored) {
        const fenceLang = lang === 'text' ? '' : lang
        pre.setAttribute('data-md', stored.replace(/^(\s*(?:```|~~~))[\w+-]*/, `$1${fenceLang}`))
      }
      setCodeLangOpen(false)
      commit()
    },
    [commit],
  )

  const copyCode = useCallback(async (pre: HTMLPreElement) => {
    const text = (pre.querySelector('code')?.textContent ?? pre.textContent ?? '').replace(/\n+$/, '')
    try {
      await navigator.clipboard.writeText(text)
      setCodeCopied(true)
      window.setTimeout(() => setCodeCopied(false), 1400)
    } catch {
      /* 剪贴板不可用时静默失败：不打断编辑 */
    }
  }, [])

  /**
   * 表格结构操作（加/删行列、删除表格）。
   *
   * 直接操作 DOM 后走统一的 commit：表格的 data-md 会按当前 DOM 重新推导，
   * 所以不需要手写"把新增行序列化成 Markdown"。
   */
  const tableOp = useCallback(
    (op: 'rowAbove' | 'rowBelow' | 'colLeft' | 'colRight' | 'delRow' | 'delCol' | 'delTable') => {
      const info = tableBar
      if (!info) return
      const { table, cell } = info
      if (op === 'delTable') {
        table.remove()
        setTableBar(null)
        commit()
        return
      }
      const row = cell.parentElement as HTMLTableRowElement | null
      if (!row || !table.contains(row)) return
      const rows = Array.from(table.rows)
      const colIndex = Array.from(row.cells).indexOf(cell)
      let focusTarget: HTMLTableCellElement | null = cell

      if (op === 'rowAbove' || op === 'rowBelow') {
        const newRow = createEmptyRow(row)
        if (row.parentElement?.tagName.toLowerCase() === 'thead') {
          const tbody = ensureTableBody(table)
          if (op === 'rowAbove') tbody.insertBefore(newRow, tbody.firstChild)
          else tbody.appendChild(newRow)
        } else if (op === 'rowAbove') {
          row.before(newRow)
        } else {
          row.after(newRow)
        }
        focusTarget = newRow.cells[Math.min(colIndex, newRow.cells.length - 1)] ?? null
      } else if (op === 'colLeft' || op === 'colRight') {
        rows.forEach((r) => {
          const ref = r.cells[Math.min(colIndex, r.cells.length - 1)]
          if (!ref) return
          const copy = document.createElement(ref.tagName.toLowerCase() === 'th' ? 'th' : 'td')
          copy.appendChild(document.createElement('br'))
          if (op === 'colLeft') ref.before(copy)
          else ref.after(copy)
        })
        focusTarget = row.cells[op === 'colLeft' ? colIndex : colIndex + 1] ?? row.cells[0] ?? null
      } else if (op === 'delRow') {
        const bodyRows = table.tBodies[0] ? Array.from(table.tBodies[0].rows) : []
        if (row.parentElement?.tagName.toLowerCase() === 'thead') return
        if (bodyRows.length <= 1) {
          Array.from(row.cells).forEach((c) => c.replaceChildren(document.createElement('br')))
          focusTarget = row.cells[0] ?? null
        } else {
          const nextRow = (row.nextElementSibling ?? row.previousElementSibling) as HTMLTableRowElement | null
          row.remove()
          focusTarget = nextRow?.cells[0] ?? null
        }
      } else if (op === 'delCol') {
        if (colIndex < 0) return
        if ((rows[0]?.cells.length ?? 0) <= 1) {
          table.remove()
          setTableBar(null)
          commit()
          return
        }
        rows.forEach((r) => r.cells[Math.min(colIndex, r.cells.length - 1)]?.remove())
        focusTarget = row.cells[Math.max(0, colIndex - 1)] ?? null
      }

      if (focusTarget) focusCell(focusTarget)
      commit()
      // 表格尺寸变了，工具栏重新贴边
      requestAnimationFrame(() => {
        if (!table.isConnected) {
          setTableBar(null)
          return
        }
        const rect = table.getBoundingClientRect()
        setTableBar({
          table,
          cell: focusTarget ?? cell,
          top: Math.max(8, rect.top - 36),
          left: Math.max(8, Math.min(rect.right - 230, window.innerWidth - 240)),
        })
      })
    },
    [tableBar, commit],
  )

  /**
   * 在指定块之后插入一个空段落（块级手柄的 `+` 按钮）。
   *
   * 语雀的行为：点 `+` 在当前块下方出现一个新空块，光标立即落进去。
   * 这里保持同样语义 —— 插入后把光标放进去，用户可以接着打字。
   */
  const insertBlockAfter = useCallback(
    (block: HTMLElement) => {
      const root = rootRef.current
      if (!root) return
      const p = document.createElement('p')
      p.appendChild(document.createElement('br'))
      block.after(p)
      placeCaretAtEnd(p)
      commit()
    },
    [commit],
  )

  /**
   * 把块向上/向下移动一格（块级手柄的拖拽替代）。
   *
   * 不用原生 HTML5 拖放：contenteditable 里原生 DnD 会与选区/光标冲突，
   * 实测拖拽后内容容易错位，且移动端基本不可用。
   * 用"与相邻块交换位置"实现同样效果，行为确定且不碰选区。
   */
  const moveBlock = useCallback(
    (block: HTMLElement, direction: -1 | 1) => {
      const sibling =
        direction === -1 ? block.previousElementSibling : block.nextElementSibling
      if (!sibling) return
      if (direction === -1) sibling.before(block)
      else sibling.after(block)
      // 移动后把光标放回该块，用户可以继续在原来位置编辑
      const host = (block.querySelector('p,li,h1,h2,h3,h4,h5,h6') ?? block) as HTMLElement
      placeCaretAtEnd(host)
      commit()
    },
    [commit],
  )

  /* ---------------- 块菜单操作（删除 / 复制 / 转换） ---------------- */

  /**
   * 删除一个块。
   *
   * 必须保证编辑器里始终至少有一个可编辑块：删到空 root 后 contenteditable
   * 没有可落光标的地方，整篇文档会变成"打不了字"的状态。
   */
  const deleteBlock = useCallback(
    (block: HTMLElement) => {
      const root = rootRef.current
      if (!root) return
      // P2-11：删除前记下光标（Markdown 偏移）——点了提示里的「撤销」要回到原处
      const caretBeforeDelete = readMarkdownOffset(root)
      const prev = block.previousElementSibling as HTMLElement | null
      const next = block.nextElementSibling as HTMLElement | null
      if (root.children.length <= 1) {
        const p = document.createElement('p')
        p.appendChild(document.createElement('br'))
        block.replaceWith(p)
        placeCaretAtEnd(p)
      } else {
        block.remove()
        const host = (prev ?? next) as HTMLElement | null
        if (host) placeCaretAtEnd((host.querySelector('p,li,h1,h2,h3,h4,h5,h6') ?? host) as HTMLElement)
      }
      commit()
      /*
       * P2-11：删除块是"一次点击就没了一整段"，必须给出可撤销的出口 ——
       * 与批量删除同一套回执（toast + 撤销按钮）。撤销会触发上面的整体重建，
       * 光标由 pendingCaretRef 在重建后落回删除处。
       */
      toastWithUndo('已删除块', () => {
        pendingCaretRef.current = caretBeforeDelete
        if (!undo()) pendingCaretRef.current = null
      })
    },
    [commit, undo],
  )

  /**
   * 复制一个块（副本紧跟原块）。
   *
   * 副本的 `data-md` 要清掉：它记录的是**原块**当时的源码，原块被编辑过后
   * 该值就是过期的；commit 会按 DOM 重新推导，留着旧值会让回写读到错误源码。
   */
  const duplicateBlock = useCallback(
    (block: HTMLElement) => {
      const clone = block.cloneNode(true) as HTMLElement
      clone.removeAttribute('data-md')
      clone.querySelectorAll('[data-md]').forEach((el) => el.removeAttribute('data-md'))
      block.after(clone)
      const host = (clone.querySelector('p,li,h1,h2,h3,h4,h5,h6') ?? clone) as HTMLElement
      placeCaretAtEnd(host)
      commit()
    },
    [commit],
  )

  /**
   * 转换块类型（段落 ↔ 标题 ↔ 列表 ↔ 引用 ↔ 代码块）。
   *
   * 直接改 DOM 而不是改 Markdown 源码：块在源码里的字符区间要靠偏移层换算，
   * 改源码容易误伤相邻块；改 DOM 后交给 commit 重新推导 Markdown 更安全，
   * 也是"往返保真"测试覆盖的那条路径。
   *
   * 列表转换按**每个 li 一项**处理：把整段列表变成多个目标块，
   * 与语雀"改列表类型时逐项生效"的直觉一致。
   */
  const transformBlock = useCallback(
    (block: HTMLElement, type: BlockTransformType) => {
      const root = rootRef.current
      if (!root) return
      const isList = block.tagName === 'UL' || block.tagName === 'OL'
      const sources: HTMLElement[] = isList
        ? (Array.from(block.querySelectorAll(':scope > li')) as HTMLElement[])
        : [block]
      if (sources.length === 0) return

      const frag = document.createDocumentFragment()
      for (const src of sources) {
        const inner = src.innerHTML
        let el: HTMLElement
        switch (type) {
          case 'paragraph':
            el = document.createElement('p')
            el.innerHTML = inner
            break
          case 'h1':
          case 'h2':
          case 'h3':
            el = document.createElement(type)
            el.innerHTML = inner
            break
          case 'quote': {
            el = document.createElement('blockquote')
            const p = document.createElement('p')
            p.innerHTML = inner
            el.appendChild(p)
            break
          }
          case 'codeblock': {
            el = document.createElement('pre')
            const code = document.createElement('code')
            // 代码块只收纯文本：行内标签（strong/em）在代码里是字面量，不能保留
            code.textContent = src.textContent ?? ''
            el.appendChild(code)
            break
          }
          case 'ulist':
          case 'olist': {
            el = document.createElement(type === 'ulist' ? 'ul' : 'ol')
            const li = document.createElement('li')
            li.innerHTML = inner
            el.appendChild(li)
            break
          }
        }
        const host = (el.querySelector('p,li') ?? el) as HTMLElement
        ensureFocusable(host)
        frag.appendChild(el)
      }

      // 先记下"替换后应该落到哪个块"：replaceWith 之后 block 已脱离文档，
      // 只能靠插入点前一个兄弟的 nextElementSibling 找回第一个新块
      const anchor = block.previousElementSibling
      block.replaceWith(frag)
      const firstNew = (anchor ? anchor.nextElementSibling : root.firstElementChild) as HTMLElement | null
      if (firstNew) {
        const host = (firstNew.querySelector('p,li,h1,h2,h3,h4,h5,h6') ?? firstNew) as HTMLElement
        placeCaretAtEnd(host)
      }
      commit()
    },
    [commit],
  )

  /**
   * 任务项勾选：**事件委托 + change 事件**。
   *
   * 两处都必须踩对，否则表现为"点了没反应"（且不报错）：
   *
   * 1) 委托而非逐个绑定。旧实现在 effect 里用 WeakSet 去重后逐个 addEventListener，
   *    而 effect 依赖含 updateDocContent（随内容变化换引用）→ 反复重跑 → 每次新建
   *    一个 WeakSet，旧监听器却从未移除，同一个 checkbox 上叠了 N 个 handler。
   *
   * 2) 用 change 而不是 click。checkbox 的 `checked` 在 **click 派发之前**就被浏览器
   *    翻转了，所以在 click 里 `box.checked = !box.checked` 写回的是**原值**；
   *    更致命的是 `preventDefault()` 会让浏览器在 handler 返回后把 checked
   *    **回滚到点击前** —— 手动设置被覆盖。旧代码同时踩了这两条，于是
   *    `defaultPrevented === true` 但 `checked` 始终为 false（实测）。
   *    change 在状态提交后触发，直接读 `box.checked` 就是用户想要的终态。
   */
  useEffect(() => {
    if (!mountedRoot) return

    const handleChange = (ev: Event): void => {
      const target = ev.target as HTMLElement | null
      const box = target?.closest?.('input[type="checkbox"]') as HTMLInputElement | null
      if (!box) return
      const root = rootRef.current
      if (!root || !root.contains(box)) return

      const li = box.closest('li')
      // 只补划线类；checked 已由浏览器提交，不要改写它（会被默认行为覆盖）
      if (li) li.classList.toggle('task-done', box.checked)

      // 同步 data-md（回写依据），否则 editorHtmlToMarkdown 读到旧状态
      const list = li?.parentElement
      if (li && list) {
        const text = (li.querySelector('span')?.textContent ?? '').trim()
        li.setAttribute('data-md', `- [${box.checked ? 'x' : ' '}] ${text}`)
        const items = Array.from(list.querySelectorAll(':scope > li'))
        list.setAttribute(
          'data-md',
          items
            .map((it) => {
              const b = it.querySelector('input[type="checkbox"]') as HTMLInputElement | null
              const t = (it.querySelector('span')?.textContent ?? '').trim()
              return b ? `- [${b.checked ? 'x' : ' '}] ${t}` : `- ${t}`
            })
            .join('\n'),
        )
      }

      /*
       * 只改内容不重渲染：走 commit 会触发同步 effect 整篇重建，
       * 刚翻的 checked 会被按旧内容还原（表现为"点了没反应"）。
       */
      const doc = selectActiveDoc(useNotesStore.getState())
      if (!doc) return
      const next = editorHtmlToMarkdown(root)
      if (next !== (doc.content ?? '')) {
        lastWrittenRef.current = next
        updateDocContent({ content: next })
      }
    }

    mountedRoot.addEventListener('change', handleChange)
    return () => mountedRoot.removeEventListener('change', handleChange)
  }, [mountedRoot, updateDocContent])
  const handleScroll = useCallback((): void => {
    onScroll?.()
  }, [onScroll])

  /* ---------------- 快捷键：Enter 续列表 ---------------- */

  /**
   * 当前光标所在的**顶层块**（含它在 root.children 里的下标）。
   * 行编辑快捷键（复制行/移动行/删除行）都以块为单位操作。
   */
  const currentTopBlock = useCallback((root: HTMLElement): { block: HTMLElement; index: number } | null => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    let node: Node | null = sel.getRangeAt(0).startContainer
    while (node && node !== root) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).parentNode === root) {
        const block = node as HTMLElement
        return { block, index: Array.prototype.indexOf.call(root.children, block) }
      }
      node = node.parentNode
    }
    return null
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>): void => {
    const root = rootRef.current
    if (!root) return

    /*
     * 输入法组合态（缺陷3）：拼音未确认时不拦截任何按键。
     * Chromium 用回车确认候选词会先派发 isComposing=true 的 Enter，
     * 若被下面的续列表/换行/标题退出分支吃掉，拼音组合会被拆断、光标乱跳。
     */
    if (e.nativeEvent.isComposing || e.keyCode === 229) return

    /*
     * P1-8：Esc → Tab 逃生（见 ./focusEscape）。
     *
     * Tab 在本组件里被拦下来做缩进（这是对的），但副作用是键盘用户**永远出不了正文**：
     * 焦点困在编辑器里，到不了工具栏 / 大纲 / 评论面板。约定与语雀 / Google Docs 一致 ——
     * 先按 Esc（局部操作结束），1.5 秒内的下一个 Tab 恢复浏览器默认的焦点导航。
     * Esc 自己不 preventDefault：它还要交给 Editor 收起工具栏、交给全局链关面板。
     */
    if (e.key === 'Escape') {
      if (armFocusEscape()) {
        toast.info('提示：按 Esc 后再按 Tab，可以把焦点移出编辑器', 4000)
      }
      return
    }
    if (e.key === 'Tab' && consumeFocusEscape()) {
      // 放行：不 preventDefault，让浏览器执行默认的焦点导航
      return
    }

    /*
     * 快捷键注册表（单一数据源，含用户自定义键位）。
     * 解析放在 onFormatShortcut 之外：置位-消费类与插行类不依赖格式化回调。
     */
    const combo = eventToKeys(e)
    const action = combo.length > 0 ? resolveShortcut?.(combo) ?? null : null

    // Ctrl+Shift+V / Ctrl+Alt+C：keydown 拿不到剪贴板数据，置位后交给 paste/copy 消费
    if (action === 'plainTextPaste') {
      plainTextPasteRef.current = true
      return
    }
    if (action === 'copyAsMarkdown') {
      copyAsMarkdownRef.current = true
      return
    }
    // Ctrl+Enter / Ctrl+Shift+Enter：在当前块下方/上方插入空块（与旧内核插行语义一致）
    if (action === 'insertLineBelow' || action === 'insertLineAbove') {
      const target = currentTopBlock(root)
      if (target) {
        e.preventDefault()
        const p = document.createElement('p')
        p.appendChild(document.createElement('br'))
        if (action === 'insertLineBelow') target.block.after(p)
        else target.block.before(p)
        placeCaretAtEnd(p)
        commit()
      }
      return
    }

    /*
     * 格式化快捷键：优先注册表，未命中时回落到与 textarea 内核一致的历史硬编码。
     */
    if (onFormatShortcut) {
      if (action && (FORMAT_ACTIONS.has(action) || action === 'indent' || action === 'outdent')) {
        e.preventDefault()
        onFormatShortcut(action as FormatType)
        return
      }
      const meta = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (meta && !e.altKey && !e.shiftKey) {
        const fallback = k === 'b' ? 'bold' : k === 'i' ? 'italic' : k === 'u' ? 'underline' : k === 'e' ? 'code' : null
        if (fallback) {
          e.preventDefault()
          onFormatShortcut(fallback)
          return
        }
      }
    }

    // 代码块内的光标可能停在 <pre> 上（padding 区），先归位到 <code> 再处理按键
    normalizePreCaret(root)

    /*
     * 代码块内：Enter 插入换行、Tab 插入缩进。
     *
     * 浏览器在 <pre> 里回车会插入 <div>/<br>，textContent 回写时换行会丢失，
     * 缩进也会被 HTML 规范化吃掉。手动插入纯文本换行是唯一稳定的做法。
     */
    const preBlock = (() => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return null
      let node: Node | null = sel.getRangeAt(0).startContainer
      while (node && node !== root) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'pre') {
          return node as HTMLElement
        }
        node = node.parentNode
      }
      return null
    })()
    if (preBlock) {
      if (e.key === 'Enter') {
        e.preventDefault()
        /*
         * 代码块末尾空行按 Enter → 跳出代码块。
         *
         * 没有这条出口，用户一旦进了 <pre> 就**只能用鼠标点走**：
         * Enter 永远只是插入换行，连按多次也出不去（实测 3 次仍在 <pre> 内），
         * 写作流程直接卡死。语雀 / Notion / Typora 的约定一致：
         * 在代码块最后一行（或空行）再按一次 Enter，就在块后新建段落。
         *
         * 判定条件：当前光标所在行是块的**最后一个空行**（行首到尾只剩空白）。
         * 只要这一行有任何字符，Enter 仍然只是换行，避免用户想写空行却被踢出去。
         */
        const codeEl = (preBlock.querySelector('code') ?? preBlock) as HTMLElement
        /*
         * 判断「光标停在代码块末尾的空行上」。
         *
         * 不能用 `range.toString()` 切行：代码块里的换行是 <br>，它**不产生 \n**，
         * 文本里永远只有一行 —— 于是「最后一行是空行」这个条件永远不成立，
         * 出口形同虚设（实测连按 3 次 Enter 仍困在 <pre> 里）。
         *
         * 这里改用 preTextOf 把 <br> 还原成 \n 后再取最后一行判断。
         */
        const caretAtTrailingBlank = (() => {
          const sel = window.getSelection()
          if (!sel || sel.rangeCount === 0) return false
          const range = sel.getRangeAt(0)
          if (!range.collapsed) return false
          if (!codeEl.contains(range.startContainer)) return false
          /* 从光标到块末尾必须只剩空白（含零宽占位字符） */
          const tail = range.cloneRange()
          tail.selectNodeContents(codeEl)
          tail.setStart(range.endContainer, range.endOffset)
          const rest = tail.toString().replace(/[\u200B\s]/g, '')
          if (rest) return false
          /* 光标所在的那一行也必须是空的（把 <br> 还原成换行后再取末行） */
          const head = range.cloneRange()
          head.selectNodeContents(codeEl)
          head.setEnd(range.endContainer, range.endOffset)
          const fragment = document.createElement('div')
          fragment.appendChild(head.cloneContents())
          const lineText = preTextOf(fragment).split('\n').pop() ?? ''
          return lineText.replace(/[\u200B\s]/g, '') === ''
        })()
        if (caretAtTrailingBlank) {
          /* 把末尾空行剥掉：否则回写会多出一个空行，块看起来永远不结束 */
          const raw = preTextOf(preBlock)
          const trimmed = raw.replace(/\n+$/, '')
          const codeNode = preBlock.querySelector('code')
          if (codeNode) codeNode.textContent = trimmed
          const p = document.createElement('p')
          p.appendChild(document.createElement('br'))
          preBlock.after(p)
          placeCaretAtEnd(p)
          commit()
          return
        }
        insertLineBreakAtCaret()
        commit()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        insertTextAtCaret('  ')
        commit()
        return
      }
    }

    /*
     * Tab / Shift+Tab：缩进 / 反缩进。
     *
     * contenteditable 里 Tab 的默认行为是**焦点导航** —— 实测按 Tab 后
     * activeElement 变成了 BUTTON，焦点离开编辑器，用户接着打字毫无反应。
     * 这在写笔记时非常容易误触（想缩进却把光标弄丢）。
     *
     * 列表项里调整层级用 indent/outdent；普通段落里插入两个空格
     * （Markdown 里 2 空格是软换行，4 空格是代码块，由用户继续输入决定）。
     */
    if (e.key === 'Tab') {
      e.preventDefault()
      // 表格内 Tab 在单元格之间移动（越过最后一格自动补行），与语雀一致
      const cell = currentCell(root)
      if (cell) {
        moveTableCell(cell, e.shiftKey ? -1 : 1)
        commit()
        return
      }
      const target = currentTopBlock(root)
      if (!target) return

      // 列表项：把当前 li 移入/移出前一个同级 li，形成嵌套层级
      const li = (() => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) return null
        let node: Node | null = sel.getRangeAt(0).startContainer
        while (node && node !== root) {
          if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'li') {
            return node as HTMLElement
          }
          node = node.parentNode
        }
        return null
      })()

      if (li) {
        const prev = li.previousElementSibling as HTMLElement | null
        if (!e.shiftKey && prev) {
          // 缩进：挂到前一个 li 下（没有子列表就建一个）
          let sub = prev.querySelector(':scope > ul, :scope > ol') as HTMLElement | null
          if (!sub) {
            sub = document.createElement(li.parentElement?.tagName.toLowerCase() === 'ol' ? 'ol' : 'ul')
            prev.appendChild(sub)
          }
          sub.appendChild(li)
          commit()
        } else if (e.shiftKey && li.parentElement) {
          // 反缩进：从子列表里提出来，放到父 li 之后
          const list = li.parentElement
          const parentLi = list.parentElement
          if (parentLi && parentLi.tagName.toLowerCase() === 'li') {
            parentLi.after(li)
            if (list.children.length === 0) list.remove()
            commit()
          }
        }
        return
      }

      // 普通块：插入两个空格（Markdown 软换行）
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        const node = document.createTextNode('  ')
        range.insertNode(node)
        range.setStartAfter(node)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        commit()
      }
      return
    }


    /*
     * 块级行编辑快捷键。
     *
     * 旧内核由 useEditorKeys 提供（Ctrl+D 复制行、Alt+↑↓ 移动行、
     * Ctrl+Shift+K 删除行、Ctrl+] / Ctrl+[ 缩进、Ctrl+Enter 插入行）。
     * 那个 hook 只挂在 textarea 分支上，富文本内核下**这些键完全不工作**
     * （实测：Ctrl+D 没有任何反应）。这里按块实现同一组能力 ——
     * contenteditable 里以"块"为单位比以"行"为单位更自然。
     */
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()

    if (mod && key === 'd') {
      const target = currentTopBlock(root)
      if (target) {
        e.preventDefault()
        // 克隆整块（含行内格式），插到原块之后
        const clone = target.block.cloneNode(true) as HTMLElement
        target.block.after(clone)
        placeCaretAtEnd(clone)
        commit()
      }
      return
    }

    if (mod && e.shiftKey && key === 'k') {
      const target = currentTopBlock(root)
      if (target) {
        e.preventDefault()
        const next = target.block.nextElementSibling as HTMLElement | null
        const prev = target.block.previousElementSibling as HTMLElement | null
        target.block.remove()
        // 删完后把光标放到相邻块，避免焦点丢失
        const fallback = next ?? prev
        if (fallback) placeCaretAtEnd(fallback)
        else {
          const p = document.createElement('p')
          p.appendChild(document.createElement('br'))
          root.appendChild(p)
          placeCaretAtEnd(p)
        }
        commit()
      }
      return
    }

    if (e.altKey && (key === 'arrowup' || key === 'arrowdown')) {
      const target = currentTopBlock(root)
      if (target) {
        e.preventDefault()
        const sibling =
          key === 'arrowup' ? target.block.previousElementSibling : target.block.nextElementSibling
        if (sibling) {
          // 保持光标所在块：交换 DOM 位置后把光标放回该块
          if (key === 'arrowup') sibling.before(target.block)
          else sibling.after(target.block)
          const host = innermostInlineHost(root) ?? target.block
          placeCaretAtEnd(host as HTMLElement)
          commit()
        }
      }
      return
    }

    /*
     * 离开当前块之前，先把该块的行内标记渲染掉（`**加粗**` → <strong>）。
     *
     * 放在这里而不是输入过程中：渲染会替换 innerHTML、重置光标，
     * 与用户正在进行的输入冲突（实测会把后续字符并进行内元素）。
     * Enter 意味着用户认为"这一行写完了"，此刻渲染既符合直觉、也不影响光标。
     */
    if (e.key === 'Enter') {
      const host = innermostInlineHost(root)
      if (host) renderInlineMarkup(host, false)
    }

    /*
     * 标题 / 对齐块末尾回车 → 正文段落（语雀 / Notion 的通用行为）。
     *
     * 浏览器默认会把标题拆成两个同级标题，用户想"写完标题接着写正文"时
     * 必须再手动把新块改回正文 —— 这是最高频的排版摩擦之一。
     */
    if (e.key === 'Enter' && !e.shiftKey) {
      const top = currentTopBlock(root)
      if (top) {
        const tag = top.block.tagName.toLowerCase()
        const isHeading = /^h[1-6]$/.test(tag)
        const isAligned = tag === 'div'
        if (isHeading || isAligned) {
          const host = (top.block.querySelector('p,li,h1,h2,h3,h4,h5,h6,div') ?? top.block) as HTMLElement
          if (isCaretAtEnd(host)) {
            e.preventDefault()
            const p = document.createElement('p')
            p.appendChild(document.createElement('br'))
            top.block.after(p)
            placeCaretAtEnd(p)
            commit()
            return
          }
        }
      }
    }

    // Enter 在列表项内：续建下一项
    if (e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      let node: Node | null = sel.getRangeAt(0).startContainer
      let li: HTMLElement | null = null
      while (node && node !== root) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'li') {
          li = node as HTMLElement
          break
        }
        node = node.parentNode
      }
      if (!li) return

      const text = (li.textContent ?? '').trim()
      const list = li.parentElement
      if (!list) return

      /*
       * 空列表项按 Enter：退出列表（语雀 / Notion 的通用行为）。
       *
       * 必须**逐级**退出，不能一律 list.after(p)：
       *
       * 旧实现把新段落插到 list.after()。当这一层是嵌套列表（list 的父节点是
       * 上级 <li>）时，这个 <p> 就被塞进了父 li 内部，DOM 变成
       * <li>父项<p>新段落</p></li>；而回写只剔除 input/ul/ol、不剔除 <p>，
       * 于是整行被合并成「- 父项新段落」—— 用户的两段文字黏在一起（实测）。
       *
       * 正确行为：嵌套层先退一级（把空项从子列表里摘掉，子列表空了就连父容器
       * 一起清理），只有最外层列表的空项才真正退出成正文段落。
       */
      if (!text) {
        e.preventDefault()
        const parentLi = list.parentElement
        const isNested = parentLi?.tagName.toLowerCase() === 'li'

        if (isNested) {
          // 退一级：删掉这个空子项；子列表空了就把整个子列表移除
          li.remove()
          if (list.children.length === 0) list.remove()
          // 光标回到父项末尾，用户可以继续写父项，或再按 Enter 继续退出
          const host = (parentLi.querySelector(':scope > span') ?? parentLi) as HTMLElement
          placeCaretAtEnd(host)
          commit()
          return
        }

        // 最外层：真正退出成正文段落，插在整个列表之后
        const p = document.createElement('p')
        p.appendChild(document.createElement('br'))
        list.after(p)
        li.remove()
        if (list.children.length === 0) list.remove()
        placeCaretAtEnd(p)
        commit()
        return
      }

      /*
       * 非空：新建同级项。
       *
       * 任务列表里必须带上勾选框结构：新建裸 <li> 的话，编辑器里这一项没有
       * 复选框、缩进也和上面的任务项对不齐，而回写按 list 的 task-list 类名
       * 把它序列化成「- [ ] 任务二」—— 于是「编辑器里没框、预览里有框」。
       * 项目结构必须与 markdownToHtml 生成的一致（input + 空格 + span）。
       */
      e.preventDefault()
      const next = document.createElement('li')
      const isTaskList = list.classList.contains('task-list') || !!li.querySelector('input[type=checkbox]')
      if (isTaskList) {
        list.classList.add('task-list')
        next.className = 'task-item'
        const box = document.createElement('input')
        box.type = 'checkbox'
        box.setAttribute('contenteditable', 'false')
        const span = document.createElement('span')
        span.appendChild(document.createElement('br'))
        next.append(box, document.createTextNode(' '), span)
        li.after(next)
        placeCaretAtEnd(span)
      } else {
        next.appendChild(document.createElement('br'))
        li.after(next)
        placeCaretAtEnd(next)
      }
      commit()
      return
    }

    // Backspace 在空列表项上：退化为段落
    if (e.key === 'Backspace') {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return
      let node: Node | null = sel.getRangeAt(0).startContainer
      let li: HTMLElement | null = null
      while (node && node !== root) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'li') {
          li = node as HTMLElement
          break
        }
        node = node.parentNode
      }
      if (!li) return
      if ((li.textContent ?? '').trim()) return

      e.preventDefault()
      const list = li.parentElement
      if (!list) return
      /*
       * 与 Enter 的空项退出同理，必须区分嵌套层：
       *
       * 旧实现无条件 list.before(p)，把段落插在**子列表**前面。子列表的父节点是
       * 上级 <li>，于是段落被塞进父 li 里，回写时整行文字黏连（实测）。
       * 嵌套层这里改为退一级：删掉空子项并清理空子列表，光标回到父项末尾；
       * 只有最外层列表才真正退化成正文段落。
       */
      const parentLi = list.parentElement
      const isNested = parentLi?.tagName.toLowerCase() === 'li'

      if (isNested) {
        li.remove()
        if (list.children.length === 0) list.remove()
        const host = (parentLi.querySelector(':scope > span') ?? parentLi) as HTMLElement
        placeCaretAtEnd(host)
        commit()
        return
      }

      const p = document.createElement('p')
      p.appendChild(document.createElement('br'))
      list.before(p)
      li.remove()
      if (list.children.length === 0) list.remove()
      placeCaretAtEnd(p)
      commit()
    }
  }, [commit, currentTopBlock, onFormatShortcut, resolveShortcut])

  /* ---------------- 粘贴：保留纯文本语义 ---------------- */

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>): void => {
      /*
       * Ctrl+Shift+V 纯文本粘贴（缺陷7）：keydown 已置位，这里消费。
       * 必须最先判断 —— 否则下面的 HTML 优先分支会把格式带进来，
       * 用户按了"纯文本粘贴"却仍得到富文本，等于快捷键静默失效。
       */
      if (plainTextPasteRef.current) {
        plainTextPasteRef.current = false
        const plain = e.clipboardData?.getData('text/plain') ?? ''
        if (!plain) return
        e.preventDefault()
        if (insertPlainTextAtCaret(plain)) commit()
        return
      }

      /*
       * 优先处理剪贴板图片。
       *
       * 与旧内核（useEditorPasteDrop）行为一致：复制一张图粘进笔记是高频操作，
       * 若只取 text/plain 会**静默无反应**（图片根本没被读出来）。
       * 图片交给 onInsertImage 落盘并插入 Markdown 图片语法。
       */
      const items = e.clipboardData?.items
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile()
            if (file) {
              e.preventDefault()
              onInsertImage?.(file)
              return
            }
          }
        }
      }

      /*
       * 富文本粘贴：优先保留格式。
       *
       * 从网页 / Word / 飞书复制的内容同时带 text/html 与 text/plain，
       * 只取 text/plain 会把标题、加粗、列表、链接全部丢掉 —— 这是与语雀
       * 手感差距最明显的一处。这里转成 Markdown 后交给父级按源码插入。
       */
      const html = e.clipboardData.getData('text/html')
      if (html && onInsertMarkdown && html.length <= HTML_TO_MD_MAX_LENGTH) {
        const md = htmlToMarkdown(html)
        if (md) {
          e.preventDefault()
          onInsertMarkdown(md)
          return
        }
      }

      /*
       * 其余按纯文本插入。
       *
       * 不用 `document.execCommand('insertText')`：该 API 已废弃，浏览器正在移除，
       * 且 jsdom 里不存在（测试环境直接抛错）。改用 Range API 手动插入 ——
       * 它是有标准、长期支持的方案。
       */
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      if (!text) return
      if (insertPlainTextAtCaret(text)) commit()
    },
    [commit, onInsertImage, onInsertMarkdown],
  )

  /**
   * Ctrl+Alt+C 复制为 Markdown（缺陷7）：keydown 已置位，这里消费。
   * 把选区（无选区时为光标所在行）的 **Markdown 源码**写入剪贴板，
   * 而不是浏览器默认复制的渲染富文本。与旧内核 useEditorPasteDrop.handleCopy 同语义。
   */
  const handleCopy = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>): void => {
      if (!copyAsMarkdownRef.current) return
      copyAsMarkdownRef.current = false
      const root = rootRef.current
      if (!root) return
      const content = activeDoc?.content ?? ''
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) return

      let text = ''
      if (!sel.isCollapsed) {
        const start = readMarkdownOffset(root)
        // 终点：collapse 到末尾再读一次（与 getSelectionRange 同一套换算）
        const range = sel.getRangeAt(0)
        const probe = range.cloneRange()
        probe.collapse(false)
        const saved = sel.getRangeAt(0)
        sel.removeAllRanges()
        sel.addRange(probe)
        const end = readMarkdownOffset(root)
        sel.removeAllRanges()
        sel.addRange(saved)
        if (start !== null && end !== null) text = content.substring(start, end)
      } else {
        const pos = readMarkdownOffset(root)
        if (pos === null) return
        const lineStart = content.lastIndexOf('\n', pos - 1) + 1
        const nextBreak = content.indexOf('\n', pos)
        text = content.substring(lineStart, nextBreak === -1 ? content.length : nextBreak)
      }
      if (!text) return
      e.preventDefault()
      e.clipboardData.setData('text/plain', text)
    },
    [activeDoc?.content],
  )
  /* ---------------- 拖拽文件：与旧内核行为一致 ---------------- */

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    // 只有拖入文件时才接受：拖文本进来交给浏览器默认处理
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return
      e.preventDefault()
      // 逐个处理：一次拖多个文件时每个都要插入，只取第一个会静默丢文件
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          onInsertImage?.(file)
        } else {
          onInsertFile?.(file)
        }
      }
    },
    [onInsertImage, onInsertFile],
  )

  /* ---------------- 命令式接口（供父组件做跳转 / 读光标） ---------------- */

  React.useImperativeHandle(
    ref,
    (): RichEditorHandle => ({
      selectRange: (start: number, end: number) => {
        const root = rootRef.current
        if (!root) return false
        return selectByMarkdownOffset(root, start, end)
      },
      getMarkdownOffset: () => {
        const root = rootRef.current
        if (!root) return null
        return readMarkdownOffset(root)
      },
      getSelectionRange: () => {
        const root = rootRef.current
        if (!root) return null
        const start = readMarkdownOffset(root)
        if (start === null) return null
        // 选区终点：用同一套换算取 range 的 end 位置
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) return null
        const range = sel.getRangeAt(0)
        if (range.collapsed) return { start, end: start }
        // 终点偏移：克隆 range、把起点设到容器开头，再走同一个读取逻辑
        const probe = range.cloneRange()
        probe.collapse(false)
        const saved = sel.getRangeAt(0)
        sel.removeAllRanges()
        sel.addRange(probe)
        const end = readMarkdownOffset(root)
        sel.removeAllRanges()
        sel.addRange(saved)
        return { start, end: end ?? start }
      },
      focus: () => rootRef.current?.focus(),
      focusAtEnd: () => {
        const root = rootRef.current
        if (!root) return false
        root.focus()
        // 放到最后一块里而不是 root 上：根级空文本节点打字不会进任何段落
        const last = root.lastElementChild
        placeCaretAtEnd(last instanceof HTMLElement ? last : root)
        return true
      },
      getRoot: () => rootRef.current,
      getCursorInfo: () => {
        const root = rootRef.current
        if (!root) return null
        const offset = readMarkdownOffset(root)
        if (offset === null) return null
        const content = activeDoc?.content ?? ''
        // 复用状态栏的行列换算，保证两种内核的显示规则一致
        const { line, column } = getCursorPosition(content, offset)

        // 选中统计：取选区文本，按中文习惯统计字符数与词数
        const sel = window.getSelection()
        let selectedChars = 0
        let selectedWords = 0
        if (sel && !sel.isCollapsed) {
          const text = sel.toString()
          selectedChars = text.length
          selectedWords = text.trim() ? text.trim().split(/\s+/).length : 0
        }
        return { line, column, selectedChars, selectedWords }
      },
      forceRender: () => {
        /*
         * 清掉 lastWrittenRef 再渲染：它代表"本编辑器写出去的值"，
         * 撤销/重做改的是 store 而不是这里，继续保留会让同步 effect 误判为
         * "变化源于自己"从而跳过重建（实测：重做点了没反应）。
         */
        lastWrittenRef.current = null
        renderFromMarkdown(activeDoc?.content ?? '')
      },
      detectSlash: () => {
        const root = rootRef.current
        if (!root) return null
        return detectSlashInRoot(root)
      },
      getActiveFormats: () => {
        const formats = new Set<string>()
        const root = rootRef.current
        if (!root) return formats
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) return formats

        // 块级：沿祖先链找到顶层块
        let block: HTMLElement | null = null
        let node: Node | null = sel.getRangeAt(0).startContainer
        while (node && node !== root) {
          if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).parentNode === root) {
            block = node as HTMLElement
            break
          }
          node = node.parentNode
        }
        if (block) {
          const tag = block.tagName.toLowerCase()
          if (/^h[1-6]$/.test(tag)) formats.add(`heading${tag[1]}`)
          else if (tag === 'ul' || tag === 'ol') {
            formats.add(block.classList.contains('task-list') ? 'tasklist' : tag === 'ol' ? 'olist' : 'ulist')
          } else if (tag === 'blockquote') formats.add('quote')
          else if (tag === 'pre') formats.add('codeblock')
          else if (tag === 'div') {
            const align = (block.style.textAlign || '').toLowerCase()
            if (align === 'center') formats.add('alignCenter')
            else if (align === 'right') formats.add('alignRight')
          }
        }

        // 行内：从选区起点向上找格式标签
        let n: Node | null = sel.getRangeAt(0).startContainer
        while (n && n !== root) {
          if (n.nodeType === Node.ELEMENT_NODE) {
            const el = n as HTMLElement
            const tag = el.tagName.toLowerCase()
            if (tag === 'strong' || tag === 'b') formats.add('bold')
            else if (tag === 'em' || tag === 'i') formats.add('italic')
            else if (tag === 'u') formats.add('underline')
            else if (tag === 's' || tag === 'del' || tag === 'strike') formats.add('strike')
            else if (tag === 'mark') formats.add('highlight')
            else if (tag === 'a') formats.add('link')
            else if (tag === 'code' && el.parentElement?.tagName.toLowerCase() !== 'pre') formats.add('code')
            else if (tag === 'span' && el.style.fontSize) formats.add('fontSize')
          }
          n = n.parentNode
        }
        return formats
      },
    }),
  )

  return (
    <>
      <div
        ref={rootRef}
        className={`rich-editor ${className}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        spellCheck={false}
        style={{ fontSize }}
        onInput={handleInput}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onKeyDown={handleKeyDown}
        onMouseUp={() => {
          const root = rootRef.current
          if (root) normalizePreCaret(root)
        }}
        onPaste={handlePaste}
        onCopy={handleCopy}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onBlur={() => {
          // 失焦时把当前块的行内标记渲染掉（用户已经离开这块，渲染不影响光标）
          const root = rootRef.current
          if (root) {
            const host = innermostInlineHost(root)
            if (host) renderInlineMarkup(host, false)
          }
          commit()
        }}
        onClick={handleRootClick}
        onScroll={handleScroll}
      />
      {/*
        块级悬浮手柄：挂在 root **外面**。
        root 是 contenteditable，往里插任何 DOM 都会被 editorHtmlToMarkdown
        当成正文读走（污染用户内容）。独立一层只做定位与按钮。
      */}
      <BlockHandle
        root={mountedRoot}
        onInsertAfter={insertBlockAfter}
        onMove={moveBlock}
        onDelete={deleteBlock}
        onDuplicate={duplicateBlock}
        onTransform={transformBlock}
      />
      {/*
        表格上下文工具栏：光标在表格内时贴在表格右上角。
        与块手柄一样放在 contenteditable 外面，避免按钮 DOM 被当成正文回写。
      */}
      {tableBar && (
        <div
          className="table-toolbar"
          style={{ top: tableBar.top, left: tableBar.left }}
          onMouseDown={(e) => e.preventDefault()}
          role="toolbar"
          aria-label="表格操作"
        >
          <button type="button" title="在下方插入行" onClick={() => tableOp('rowBelow')}>+行</button>
          <button type="button" title="在右侧插入列" onClick={() => tableOp('colRight')}>+列</button>
          <span className="table-toolbar-sep" aria-hidden="true" />
          <button type="button" title="删除当前行" onClick={() => tableOp('delRow')}>−行</button>
          <button type="button" title="删除当前列" onClick={() => tableOp('delCol')}>−列</button>
          <button type="button" title="删除表格" onClick={() => tableOp('delTable')} className="table-toolbar-danger">删表</button>
        </div>
      )}
      {/*
        代码块工具条：语言标签（可切换）+ 复制。
        同样挂在 contenteditable 外面 —— 往 <pre> 里插按钮会被回写成代码内容。
      */}
      {codeBar && (
        <div
          className="code-toolbar"
          style={{ top: codeBar.top, left: codeBar.left }}
          onMouseDown={(e) => e.preventDefault()}
          role="toolbar"
          aria-label="代码块操作"
        >
          <div className="code-lang-wrap">
            <button
              type="button"
              className="code-lang-btn"
              title="切换代码语言"
              aria-haspopup="listbox"
              aria-expanded={codeLangOpen}
              onClick={() => setCodeLangOpen((v) => !v)}
            >
              {codeBar.lang}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {codeLangOpen && (
              <div className="code-lang-menu" role="listbox">
                {CODE_LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    role="option"
                    aria-selected={codeBar.lang === lang}
                    className={`code-lang-option ${codeBar.lang === lang ? 'active' : ''}`}
                    onClick={() => setCodeLanguage(codeBar.pre, lang)}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="code-copy-btn"
            title="复制代码"
            onClick={() => void copyCode(codeBar.pre)}
          >
            {codeCopied ? '已复制' : '复制'}
          </button>
        </div>
      )}
      {/*
        图片缩放：选中图片后浮出尺寸工具条 + 右下角拖拽手柄。
        与块手柄/表格工具条一样挂在 contenteditable 外面 —— 放进去会被回写成正文。
      */}
      {imageSel && (
        <>
          <div
            className="image-toolbar"
            style={{ top: Math.max(8, imageSel.top - 38), left: imageSel.left }}
            onMouseDown={(e) => e.preventDefault()}
            role="toolbar"
            aria-label="图片尺寸"
          >
            <span className="image-size-label">{Math.round(imageSel.width)}px</span>
            <button type="button" onClick={() => setImageRatio(0.25)}>小</button>
            <button type="button" onClick={() => setImageRatio(0.5)}>中</button>
            <button type="button" onClick={() => setImageRatio(0.75)}>大</button>
            <button type="button" onClick={resetImageWidth}>原始</button>
          </div>
          <div
            className="image-resize-handle"
            style={{
              top: imageSel.top + imageSel.height - 7,
              left: imageSel.left + imageSel.width - 7,
            }}
            onPointerDown={onImageHandleDown}
            onPointerMove={onImageHandleMove}
            onPointerUp={onImageHandleUp}
            onPointerCancel={onImageHandleUp}
            role="separator"
            aria-label="拖动调整图片宽度"
            title="拖动调整宽度"
          />
        </>
      )}
    </>
  )
})

export default RichEditor
