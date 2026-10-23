/**
 * 在 **Markdown 源码**上应用格式（富文本内核用）。
 *
 * 为什么单独做一份：旧内核的 `wrapSelection` 直接改 `textarea.value` 并操作
 * `selectionStart/End`，contenteditable 里没有这些属性 —— 调用它会直接 `return`，
 * 表现为"新内核下顶部工具栏按钮没反应"。
 *
 * 这里把同样的语义实现在 Markdown 字符串上：给定选区 [start, end)，
 * 返回新内容与新选区。与 `editorTextOps.wrapSelection` 的行为保持一致
 * （已包裹则取消包裹、包裹后选中内部文字），保证两种内核手感相同。
 */

import { buildTableMarkdown } from './editorTextOps'

/** 行内包裹类格式：前缀 + 后缀 */
const INLINE_WRAPPERS: Record<string, { prefix: string; suffix: string }> = {
  bold: { prefix: '**', suffix: '**' },
  italic: { prefix: '*', suffix: '*' },
  strike: { prefix: '~~', suffix: '~~' },
  underline: { prefix: '<u>', suffix: '</u>' },
  code: { prefix: '`', suffix: '`' },
  highlight: { prefix: '<mark>', suffix: '</mark>' },
}

/** 块级标记：`mark` 为插入的源码前缀，`detect` 用于识别已存在的同类标记（含序号变化的有序列表） */
const BLOCK_MARKS: Record<string, { mark: string; detect: RegExp }> = {
  heading1: { mark: '# ', detect: /^#{1,6}\s+/ },
  heading2: { mark: '## ', detect: /^#{1,6}\s+/ },
  heading3: { mark: '### ', detect: /^#{1,6}\s+/ },
  heading4: { mark: '#### ', detect: /^#{1,6}\s+/ },
  heading5: { mark: '##### ', detect: /^#{1,6}\s+/ },
  heading6: { mark: '###### ', detect: /^#{1,6}\s+/ },
  quote: { mark: '> ', detect: /^>\s?/ },
  ulist: { mark: '- ', detect: /^[-*+]\s+(?!\[[ xX]\])/ },
  olist: { mark: '1. ', detect: /^\d+[.)]\s+/ },
  tasklist: { mark: '- [ ] ', detect: /^[-*+]\s+\[[ xX]\]\s+/ },
}

const ALIGN_TYPES = new Set(['alignLeft', 'alignCenter', 'alignRight'])

export interface MarkdownFormatResult {
  content: string
  /** 应用后应恢复的选区 */
  start: number
  end: number
}

/** 取 start 所在行的行首偏移 */
function lineStartOf(text: string, index: number): number {
  return text.lastIndexOf('\n', index - 1) + 1
}

/** 取 start 所在行的行尾偏移（不含换行符） */
function lineEndOf(text: string, index: number): number {
  const next = text.indexOf('\n', index)
  return next === -1 ? text.length : next
}

/**
 * 在 Markdown 上应用格式。
 *
 * @returns 新内容与选区；无法应用（如未知类型）时返回 null
 */
export function applyMarkdownFormat(
  content: string,
  start: number,
  end: number,
  type: string,
  options?: { color?: string; size?: string; language?: string; rows?: number; cols?: number; callout?: string },
): MarkdownFormatResult | null {
  // 颜色 / 字号 / 高亮带参数，单独处理
  if (type === 'textColor') {
    const prefix = `<span style="color:${options?.color || '#1677ff'}">`
    const suffix = '</span>'
    return wrap(content, start, end, prefix, suffix)
  }
  if (type === 'fontSize') {
    const prefix = `<span style="font-size:${options?.size || '15px'}">`
    const suffix = '</span>'
    return wrap(content, start, end, prefix, suffix)
  }
  if (type === 'highlight' && options?.color) {
    const prefix = `<mark style="background-color:${options.color}">`
    const suffix = '</mark>'
    return wrap(content, start, end, prefix, suffix)
  }
  if (type === 'link') {
    return wrap(content, start, end, '[', '](url)')
  }

  const inline = INLINE_WRAPPERS[type]
  if (inline) return wrap(content, start, end, inline.prefix, inline.suffix)

  const mark = BLOCK_MARKS[type]
  if (mark) return toggleLineMark(content, start, end, mark.mark, mark.detect)

  if (type === 'codeblock') return toggleCodeBlock(content, start, end, options?.language)
  if (type === 'divider') return insertBlock(content, start, end, '---')
  /*
   * 公式 / 图表：预览侧早已支持（remark-math + KaTeX / Mermaid），
   * 但编辑器一直没有插入入口 —— 用户只能自己背语法手打。
   * 选中内容时把它作为公式体/图表体，未选中时给一个可直接改的模板。
   */
  if (type === 'math') {
    const body = content.slice(start, end).trim() || 'E = mc^2'
    return insertBlock(content, start, end, `$$\n${body}\n$$`)
  }
  if (type === 'mermaid') {
    const body = content.slice(start, end).trim() || 'graph TD\n  A[开始] --> B[结束]'
    return insertBlock(content, start, end, '```mermaid\n' + body + '\n```')
  }
  /*
   * 提示块：GitHub Alerts 语法 `> [!tip]`。
   * 选中内容时把它作为正文，未选中时给一句占位文案让用户直接改。
   */
  if (type === 'callout') {
    const kind = options?.callout || 'tip'
    const body = content.slice(start, end).trim() || '在这里输入提示内容'
    return insertBlock(content, start, end, `> [!${kind}]\n> ${body}`)
  }
  if (type === 'table') {
    return insertBlock(content, start, end, buildTableMarkdown(options?.rows ?? 3, options?.cols ?? 3))
  }
  if (ALIGN_TYPES.has(type)) {
    const align = type === 'alignCenter' ? 'center' : type === 'alignRight' ? 'right' : 'left'
    return setAlignment(content, start, end, align)
  }
  if (type === 'indent') return changeIndent(content, start, end, true)
  if (type === 'outdent') return changeIndent(content, start, end, false)
  if (type === 'clearFormat') return clearFormat(content, start, end)

  return null
}

/** 行内包裹（已包裹则取消），与 textarea 版 wrapSelection 语义一致 */
function wrap(
  content: string,
  start: number,
  end: number,
  prefix: string,
  suffix: string,
): MarkdownFormatResult {
  const selected = content.substring(start, end)
  // 已包裹 → 取消
  if (
    selected.startsWith(prefix) &&
    selected.endsWith(suffix) &&
    selected.length > prefix.length + suffix.length
  ) {
    const inner = selected.substring(prefix.length, selected.length - suffix.length)
    return {
      content: content.substring(0, start) + inner + content.substring(end),
      start,
      end: start + inner.length,
    }
  }
  // 空选区时插入标记并把光标放中间（用户接着打字就是加粗内容）
  const next = prefix + selected + suffix
  return {
    content: content.substring(0, start) + next + content.substring(end),
    start: start + prefix.length,
    end: start + prefix.length + selected.length,
  }
}

/**
 * 行首标记：已是同类标记则移除，否则替换/插入。
 *
 * **按行处理整个选区**：选中两段再点列表，语雀会得到两个列表项；
 * 旧实现只改光标所在的第一行，第二行留在原地 —— 用户得逐行重复操作。
 */
function toggleLineMark(
  content: string,
  start: number,
  end: number,
  mark: string,
  detect: RegExp,
): MarkdownFormatResult {
  const ls = lineStartOf(content, start)
  // end 是开区间：用 end-1 找选区真正覆盖的最后一行
  const le = lineEndOf(content, end > start ? end - 1 : end)
  const block = content.slice(ls, le)
  const sourceLines = block.split('\n')

  /*
   * 多段转列表时把段落间的空行去掉，生成**紧凑列表**。
   *
   * 编辑器里每个段落是独立块，序列化后块之间是 `\n\n`；如果原样加列表标记，
   * 会得到 `- a\n\n- b`，被解析成两个列表（中间空一行）—— 看起来像两个断开的列表。
   * 语雀会把选中的多段合并成一个列表，这里保持同样手感。
   */
  const isListMark = mark === '- ' || mark === '1. ' || mark === '- [ ] '
  const hadBlank = sourceLines.some((line) => !line.trim())
  const lines = isListMark ? sourceLines.filter((line) => line.trim()) : sourceLines

  const meaningful = lines.filter((line) => line.trim())
  const allMatch = meaningful.length > 0 && meaningful.every((line) => {
    const m = detect.exec(line)
    return !!m && m[0] === mark
  })

  const shifts: number[] = []
  const nextLines = lines.map((line) => {
    if (!line.trim()) {
      shifts.push(0)
      return line
    }
    if (allMatch) {
      const m = detect.exec(line)!
      shifts.push(-m[0].length)
      return line.slice(m[0].length)
    }
    // 先清掉该行已有的块标记（含标题层级 / 有序列表序号变化），避免叠加
    let removed = 0
    for (const def of Object.values(BLOCK_MARKS)) {
      const m = def.detect.exec(line)
      if (m) {
        removed = m[0].length
        break
      }
    }
    shifts.push(mark.length - removed)
    return mark + line.slice(removed)
  })

  /** 某个偏移在经过整段改写后的位移：累加它所在行及其之前所有行的变化量 */
  const shiftAt = (pos: number): number => {
    let acc = 0
    let lineStart = ls
    for (let i = 0; i < lines.length; i++) {
      const lineEnd = lineStart + lines[i].length
      acc += shifts[i]
      if (pos <= lineEnd) return acc
      lineStart = lineEnd + 1
    }
    return acc
  }

  const newBlock = nextLines.join('\n')

  // 去掉过空行时偏移已不可逐行对应，直接把整段结果作为选区
  if (isListMark && hadBlank) {
    return {
      content: content.slice(0, ls) + newBlock + content.slice(le),
      start: ls,
      end: ls + newBlock.length,
    }
  }

  return {
    content: content.slice(0, ls) + newBlock + content.slice(le),
    start: Math.max(ls, start + shiftAt(start)),
    end: Math.max(ls, end + shiftAt(end)),
  }
}

/** 代码块包裹：已包裹则取消 */
function toggleCodeBlock(
  content: string,
  start: number,
  end: number,
  language?: string,
): MarkdownFormatResult {
  /*
   * 先扫描全部**独立成行**的栅栏，按成对关系判断光标是否在某个代码块内。
   *
   * 不能只看"光标所在行是否以 ``` 开头"：光标通常在**内容行**上，
   * 那一行当然不以栅栏开头 —— 实测会导致取消失效、反而又包一层。
   */
  const fences: number[] = []
  let scan = 0
  for (;;) {
    const found = content.indexOf('```', scan)
    if (found === -1) break
    if (found === 0 || content[found - 1] === '\n') fences.push(found)
    scan = found + 3
  }

  for (let i = 0; i + 1 < fences.length; i += 2) {
    const open = fences[i]
    const close = fences[i + 1]
    // 光标落在这一对栅栏之间（含边界）→ 属于本块
    if (start >= open && start <= close + 3) {
      const openLineEnd = content.indexOf('\n', open)
      if (openLineEnd === -1 || openLineEnd > close) break
      const inner = content.slice(openLineEnd + 1, close - 1)
      return {
        content: content.slice(0, open) + inner + content.slice(close + 3),
        start: open,
        end: open + inner.length,
      }
    }
  }

  const selected = content.substring(start, end)
  const lang = language ?? ''
  const before = content.slice(0, start)
  const after = content.slice(end)
  /*
   * 围栏必须**独立成行**。
   *
   * 旧实现直接拼在光标处：光标在列表项里时会得到 `- ```js`，
   * 整段内容被当成列表文字，代码块根本没生成（实测）。
   * 这里与插入表格用同一套"前后补空行"规则。
   */
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const tail = after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  const block = '```' + lang + '\n' + selected + '\n```'
  const caret = start + lead.length + 3 + lang.length + 1
  return {
    content: before + lead + block + tail + after,
    start: caret,
    end: caret + selected.length,
  }
}

/**
 * 插入独立块（表格 / 分割线）。
 *
 * 必须保证块前后各有空行：Markdown 的表格只有紧跟在**独立段落**开头时才会被
 * 解析成表格，直接接在上一行文字后面会退化成一整段纯文本。
 * 插入后光标落在块末尾的空行上，用户可以立刻继续写。
 */
function insertBlock(
  content: string,
  start: number,
  end: number,
  block: string,
): MarkdownFormatResult {
  const before = content.slice(0, start)
  const after = content.slice(end)
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const tail = after === '' ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  const inserted = lead + block + tail
  const caret = start + lead.length + block.length + tail.length
  return {
    content: before + inserted + after,
    start: caret,
    end: caret,
  }
}

/** 在行首增删两个空格的缩进（仅列表项：Markdown 里只有列表能表达嵌套层级） */
function changeIndent(
  content: string,
  start: number,
  end: number,
  increase: boolean,
): MarkdownFormatResult {
  const ls = lineStartOf(content, start)
  const le = lineEndOf(content, end)
  const block = content.slice(ls, le)
  const lines = block.split('\n')
  const listRe = /^(\s*)([-*+]|\d+[.)])\s+/

  // 普通段落 / 标题没有缩进语法：直接原样返回，避免插入无意义的空格
  if (!lines.some((line) => listRe.test(line))) {
    return { content, start, end }
  }

  const first = listRe.exec(lines[0])
  const shift = increase ? 2 : -Math.min(2, first ? first[1].length : 2)
  const nextLines = lines.map((line) => {
    if (!listRe.test(line)) return line
    if (increase) return '  ' + line
    if (line.startsWith('  ')) return line.slice(2)
    if (line.startsWith(' ')) return line.slice(1)
    return line
  })

  return {
    content: content.slice(0, ls) + nextLines.join('\n') + content.slice(le),
    start: Math.max(ls, start + shift),
    end: Math.max(ls, end + shift),
  }
}

/**
 * 段落对齐。
 *
 * Markdown 没有原生对齐语法，沿用旧内核的约定写成行内 HTML：
 * - 普通段落：`<div style="text-align:center">…</div>`
 * - 标题：`<h2 style="text-align:center">…</h2>`（标题的 `##` 标记必须保留，
 *   否则会被当成普通 HTML 块，`##` 原样显示出来）
 *
 * 预览侧由 rehype-raw 渲染，编辑器侧由 markdownToHtml 还原样式。
 */
function setAlignment(
  content: string,
  start: number,
  end: number,
  align: 'left' | 'center' | 'right',
): MarkdownFormatResult {
  const ls = lineStartOf(content, start)
  const le = lineEndOf(content, end)
  const line = content.slice(ls, le)

  // 先剥掉已有的对齐包装，再按新对齐方式重写（避免层层嵌套）
  const headingWrapped = /^<h([1-6])\s+style="text-align:(?:left|center|right)"\s*>([\s\S]*)<\/h\1>$/.exec(line)
  const blockWrapped = /^<div\s+style="text-align:(?:left|center|right)"\s*>([\s\S]*)<\/div>$/.exec(line)
  const base = headingWrapped
    ? `${'#'.repeat(Number(headingWrapped[1]))} ${headingWrapped[2]}`
    : blockWrapped
      ? blockWrapped[1]
      : line

  // 列表 / 引用 / 代码块的源码标记无法与 HTML 包装共存，保持原样
  if (/^\s*([-*+]|\d+[.)])\s+/.test(base) || /^>/.test(base) || /^```/.test(base)) {
    return { content, start, end }
  }

  const heading = /^(#{1,6})\s+(.*)$/.exec(base)
  let wrapped: string
  if (heading) {
    const level = heading[1].length
    wrapped = align === 'left'
      ? base
      : `<h${level} style="text-align:${align}">${heading[2]}</h${level}>`
  } else if (align === 'left') {
    wrapped = base
  } else {
    wrapped = `<div style="text-align:${align}">${base}</div>`
  }

  const delta = wrapped.length - line.length
  return {
    content: content.slice(0, ls) + wrapped + content.slice(le),
    start: Math.max(ls, start + delta),
    end: Math.max(ls, end + delta),
  }
}

/** 清除选区（或光标所在行）内的 Markdown / 行内 HTML 格式标记 */
function clearFormat(
  content: string,
  start: number,
  end: number,
): MarkdownFormatResult {
  const collapsed = start === end
  const from = collapsed ? lineStartOf(content, start) : start
  const to = collapsed ? lineEndOf(content, start) : end
  const target = content.slice(from, to).replace(
    /^<div\s+style="text-align:[^"]*"\s*>([\s\S]*)<\/div>$/gm,
    '$1',
  )
    .replace(/^<h([1-6])\s+style="[^"]*"\s*>([\s\S]*)<\/h\1>$/gm, '$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+(?!\[[ xX]\])/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/<u>(.+?)<\/u>/g, '$1')
    .replace(/<mark[^>]*>(.+?)<\/mark>/g, '$1')
    .replace(/<span[^>]*>(.+?)<\/span>/g, '$1')
    .replace(/<sub>(.+?)<\/sub>/g, '$1')
    .replace(/<sup>(.+?)<\/sup>/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  return {
    content: content.slice(0, from) + target + content.slice(to),
    start: from,
    end: from + target.length,
  }
}
