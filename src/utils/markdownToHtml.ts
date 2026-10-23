/**
 * Markdown → HTML（编辑器视图）转换。
 *
 * 用途：contenteditable 编辑器需要把 Markdown 源码渲染成带样式的 HTML，
 * 用户在其中所见即所得地编辑；每次输入后再把 HTML 转回 Markdown 存储。
 *
 * 设计要点 —— **往返保真**：
 * 1. 每个块级元素带 `data-md` 属性，保存该块的原始 Markdown 行。
 *    转回 Markdown 时优先读它，只有该块被编辑过（内容与 data-md 不一致）才重新推导。
 *    这样"没碰过的块"永远原样还原，避免 `**加粗**` 之类被反复解析后失真。
 * 2. 只支持 Markdown 能无损表达的子集。遇到无法表达的结构（复杂嵌套表格、
 *    原始 HTML 块）整块保留为纯文本 + data-md，不猜测、不丢内容。
 * 3. 不引入第三方库：只做块级解析 + 行内替换，体积可控、无正则回溯风险。
 */

import {
  calloutIconHtml,
  CALLOUT_LABELS,
  normalizeCalloutKind,
  type CalloutKind,
} from './calloutMeta'

/** 块类型：决定渲染成什么标签，以及编辑器里的行为 */
export type MdBlockType =
  | 'paragraph'
  | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6'
  | 'ulist' | 'olist' | 'tasklist'
  | 'quote'
  | 'callout'
  | 'code'
  | 'table'
  | 'divider'
  | 'aligned'

export type { CalloutKind } from './calloutMeta'

export interface MdBlock {
  type: MdBlockType
  /** 该块对应的原始 Markdown 源（含标记，如 "## 标题"） */
  md: string
  /** 标题层级（仅 heading 系列） */
  level?: number
  /** 有序列表起始序号 */
  start?: number
  /** 代码块语言 */
  lang?: string
  /** 对齐方式（仅 aligned 块） */
  align?: 'left' | 'center' | 'right'
  /** 提示块类型（仅 callout） */
  callout?: CalloutKind
  /** 提示块标题（仅 callout，可为空） */
  title?: string
  /** 列表项（ulist/olist/tasklist 用；每项是行内 Markdown） */
  items?: { md: string; checked?: boolean; depth?: number }[]
}

/* ------------------------------------------------------------------ *
 * 行内 Markdown → HTML
 * ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 行内 Markdown → HTML。
 *
 * 顺序很关键：先处理代码（避免代码里的 `*` 被当强调），
 * 再处理图片/链接（避免 URL 里的字符被当强调），最后才是强调。
 * 用占位符把已处理片段取出，避免后续规则破坏已生成的标签。
 */
export function inlineMdToHtml(md: string): string {
  const stash: string[] = []
  const keep = (html: string): string => {
    stash.push(html)
    // 用私用区字符做占位符：\x00 在正则里会触发 no-control-regex 规则，
    // 且真实文本里不可能出现 U+E000 段，安全性相同
    return `\uE000${stash.length - 1}\uE000`
  }

  let out = md

  // 1. 行内代码 `code`（最优先，内部不做任何其他解析）
  out = out.replace(/`([^`\n]+)`/g, (_m, code: string) => keep(`<code>${escapeHtml(code)}</code>`))

  // 2. 图片 ![alt](src)（必须早于链接，否则会被链接规则先吃掉）
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) =>
    keep(`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`),
  )

  // 3. 链接 [text](href)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) =>
    keep(`<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`),
  )

  /*
   * 4. 行内 HTML：原样保留，供 rehype-raw 渲染。
   * `<img>` 也在这里保留 —— 用户拖拽调整图片宽度后，源码会变成
   * `<img src="…" width="320">`（Markdown 没有尺寸语法），
   * 不保留的话它会被 escapeHtml 变成可见的标签文本。
   */
  out = out.replace(
    /<(u|mark|sub|sup|span|br)\b[^>]*>.*?<\/\1>|<(?:br|img)\b[^>]*\/?>/gi,
    (m) => keep(m),
  )

  // 5. 转义剩余文本中的 HTML 特殊字符（必须在上面几步之后）
  out = escapeHtml(out)

  // 6. 强调：***x*** → ** *x* **，故先处理三连
  out = out.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>')

  // 7. 还原占位符
  out = out.replace(/\uE000(\d+)\uE000/g, (_m, i: string) => stash[Number(i)] ?? '')

  return out
}

/* ------------------------------------------------------------------ *
 * Markdown → 块列表
 * ------------------------------------------------------------------ */

const FENCE_RE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/
const HEADING_RE = /^(#{1,6})\s+(.*)$/
const ULIST_RE = /^(\s*)[-*+]\s+(.*)$/
const OLIST_RE = /^(\s*)(\d+)[.)]\s+(.*)$/
const TASK_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/
const QUOTE_RE = /^>\s?(.*)$/
const DIVIDER_RE = /^\s*([-*_])\1{2,}\s*$/
/** 对齐块：编辑器工具栏写入的 `<div style="text-align:center">…</div>` */
const ALIGNED_RE = /^<div\s+style="text-align:(left|center|right)"\s*>([\s\S]*)<\/div>$/
/** 对齐标题：`<h2 style="text-align:center">…</h2>`（标题标记必须保留） */
const ALIGNED_HEADING_RE = /^<h([1-6])\s+style="text-align:(left|center|right)"\s*>([\s\S]*)<\/h\1>$/
/** 表格分隔行：|---|:--:| 之类 */
const TABLE_SEP_RE = /^\s*\|?[\s:|-]+\|[\s:|-]*$/

function isTableSep(line: string): boolean {
  return TABLE_SEP_RE.test(line) && line.includes('-')
}

/**
 * 把 Markdown 源码切成块。
 *
 * 逐个"行"判定，不做完整 AST 解析 —— 编辑器只需要块级结构，
 * 而完整解析会引入 remark 依赖（体积 + 异步），且往返更容易失真。
 */
export function parseMarkdownBlocks(md: string): MdBlock[] {
  const lines = md.split('\n')
  const blocks: MdBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // 空行：跳过（块之间由渲染层加间距，不需要保留空块）
    if (!line.trim()) {
      i++
      continue
    }

    // 代码块（``` 围栏）：整段取出，内部不做任何解析
    const fence = FENCE_RE.exec(line)
    if (fence) {
      const marker = fence[1]
      const lang = fence[2] ?? ''
      const body: string[] = []
      i++
      while (i < lines.length && !new RegExp(`^\\s*${marker}\\s*$`).test(lines[i])) {
        body.push(lines[i])
        i++
      }
      // 跳过闭合围栏（若有）
      if (i < lines.length) i++
      const raw = `${marker}${lang}\n${body.join('\n')}\n${marker}`
      blocks.push({ type: 'code', md: raw, lang })
      continue
    }

    // 对齐标题（带 style 的 <h2>…</h2>）
    const alignedHeading = ALIGNED_HEADING_RE.exec(line.trim())
    if (alignedHeading) {
      blocks.push({
        type: (`heading${alignedHeading[1]}`) as MdBlockType,
        md: line.trim(),
        level: Number(alignedHeading[1]),
        align: alignedHeading[2] as 'left' | 'center' | 'right',
      })
      i++
      continue
    }

    // 对齐块（工具栏「左/中/右对齐」写入的行内 HTML）
    const aligned = ALIGNED_RE.exec(line.trim())
    if (aligned) {
      blocks.push({
        type: 'aligned',
        md: line.trim(),
        align: aligned[1] as 'left' | 'center' | 'right',
      })
      i++
      continue
    }

    // 分割线
    if (DIVIDER_RE.test(line)) {
      blocks.push({ type: 'divider', md: line.trim() })
      i++
      continue
    }

    // 标题
    const heading = HEADING_RE.exec(line)
    if (heading) {
      const level = heading[1].length
      const type = (`heading${level}`) as MdBlockType
      blocks.push({ type, md: line, level })
      i++
      continue
    }

    // 表格：当前行含 `|` 且下一行是分隔行
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const tableLines: string[] = [line, lines[i + 1]]
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        tableLines.push(lines[i])
        i++
      }
      blocks.push({ type: 'table', md: tableLines.join('\n') })
      continue
    }

    // 引用块：连续 `>` 行合成一块
    if (QUOTE_RE.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoteLines.push(lines[i])
        i++
      }
      /*
       * 提示块 = 首行带 `[!TYPE]` 的引用块（GitHub Alerts 语法）。
       * 复用引用的"连续 > 行"收集逻辑：两者在源码层面同构，
       * 差别只在首行的类型标记与渲染样式 —— 这样粘贴 GitHub / 语雀导出的
       * 内容时能直接识别，不需要额外语法。
       */
      const marker = /^>\s*\[!([\w-]+)\]\s*(.*)$/.exec(quoteLines[0])
      if (marker) {
        const kind = normalizeCalloutKind(marker[1]) ?? 'note'
        blocks.push({
          type: 'callout',
          md: quoteLines.join('\n'),
          callout: kind,
          title: marker[2].trim(),
        })
        continue
      }
      blocks.push({ type: 'quote', md: quoteLines.join('\n') })
      continue
    }

    // 任务列表（必须先于普通列表判定）
    if (TASK_RE.test(line)) {
      const items: MdBlock['items'] = []
      while (i < lines.length && TASK_RE.test(lines[i])) {
        const m = TASK_RE.exec(lines[i])!
        items.push({ md: m[3], checked: m[2].toLowerCase() === 'x' })
        i++
      }
      blocks.push({ type: 'tasklist', md: items.map((it) => `- [${it.checked ? 'x' : ' '}] ${it.md}`).join('\n'), items })
      continue
    }

    // 无序列表
    if (ULIST_RE.test(line)) {
      const items: MdBlock['items'] = []
      const rawLines: string[] = []
      while (i < lines.length && (ULIST_RE.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        if (ULIST_RE.test(lines[i])) {
          const m = ULIST_RE.exec(lines[i])!
          items.push({ md: m[2], depth: Math.floor(m[1].length / 2) })
        }
        rawLines.push(lines[i])
        i++
      }
      blocks.push({ type: 'ulist', md: rawLines.join('\n'), items })
      continue
    }

    // 有序列表
    if (OLIST_RE.test(line)) {
      const items: MdBlock['items'] = []
      const rawLines: string[] = []
      const first = OLIST_RE.exec(line)!
      const start = Number(first[2]) || 1
      while (i < lines.length && OLIST_RE.test(lines[i])) {
        const m = OLIST_RE.exec(lines[i])!
        items.push({ md: m[3], depth: Math.floor(m[1].length / 2) })
        rawLines.push(lines[i])
        i++
      }
      blocks.push({ type: 'olist', md: rawLines.join('\n'), items, start })
      continue
    }

    // 段落：吃到下一个空行或下一个块起始行为止
    const para: string[] = []
    while (i < lines.length) {
      const cur = lines[i]
      if (!cur.trim()) break
      if (FENCE_RE.test(cur) || HEADING_RE.test(cur) || DIVIDER_RE.test(cur) || ALIGNED_RE.test(cur.trim()) || ALIGNED_HEADING_RE.test(cur.trim())) break
      if (ULIST_RE.test(cur) || OLIST_RE.test(cur) || TASK_RE.test(cur) || QUOTE_RE.test(cur)) break
      if (cur.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) break
      para.push(cur)
      i++
    }
    blocks.push({ type: 'paragraph', md: para.join('\n') })
  }

  return blocks
}

/* ------------------------------------------------------------------ *
 * 块 → HTML（编辑器视图）
 * ------------------------------------------------------------------ */

/** 表格 Markdown → HTML 表格 */
function tableMdToHtml(md: string): string {
  const rows = md.split('\n').filter((l) => l.trim())
  if (rows.length === 0) return ''
  const cells = (row: string): string[] =>
    row
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim())

  const header = cells(rows[0])
  const body = rows.slice(2).map(cells)
  const head = `<thead><tr>${header.map((c) => `<th>${inlineMdToHtml(c)}</th>`).join('')}</tr></thead>`
  const bodyHtml = body.length
    ? `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inlineMdToHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
    : ''
  return `<table>${head}${bodyHtml}</table>`
}

/**
 * 扁平列表项（带缩进层级）→ 嵌套 HTML。
 *
 * Markdown 用 2 个空格表示一层嵌套，DOM 侧必须还原成嵌套的 `<ul>/<ol>` ——
 * 否则工具栏「增加缩进」在编辑器里看不到任何变化，且回车续行时会丢失层级。
 */
function renderListHtml(
  items: { md: string; depth?: number }[],
  ordered: boolean,
  start: number,
  attr: string,
): string {
  interface Node { md: string; children: Node[] }
  const roots: Node[] = []
  const stack: { node: Node | null; depth: number }[] = [{ node: null, depth: -1 }]

  for (const it of items) {
    const d = Math.max(0, it.depth ?? 0)
    while (stack.length > 1 && stack[stack.length - 1].depth >= d) stack.pop()
    const node: Node = { md: it.md, children: [] }
    const parent = stack[stack.length - 1].node
    if (parent) parent.children.push(node)
    else roots.push(node)
    stack.push({ node, depth: d })
  }

  const tag = ordered ? 'ol' : 'ul'
  const render = (nodes: Node[], isRoot: boolean): string => {
    const startAttr = isRoot && ordered && start !== 1 ? ` start="${start}"` : ''
    return `<${tag}${isRoot ? attr : ''}${startAttr}>${nodes
      .map((n) => `<li>${inlineMdToHtml(n.md)}${n.children.length ? render(n.children, false) : ''}</li>`)
      .join('')}</${tag}>`
  }
  return render(roots, true)
}

/**
 * 单个块 → 带 data-md 的 HTML。
 *
 * `data-md` 是往返保真的关键：转回 Markdown 时若该块未被编辑，
 * 直接返回 data-md 原文，不做任何重新推导。
 */
export function blockToHtml(block: MdBlock): string {
  const attr = ` data-md="${escapeHtml(block.md)}"`

  switch (block.type) {
    case 'heading1':
    case 'heading2':
    case 'heading3':
    case 'heading4':
    case 'heading5':
    case 'heading6': {
      const level = block.level ?? 1
      const alignAttr = block.align && block.align !== 'left' ? ` style="text-align:${block.align}"` : ''
      return `<h${level}${attr}${alignAttr}>${inlineMdToHtml(block.md.replace(/^#{1,6}\s+/, '').replace(/^<h[1-6][^>]*>([\s\S]*)<\/h[1-6]>$/, '$1'))}</h${level}>`
    }
    case 'ulist':
      return renderListHtml(block.items ?? [], false, 1, attr)
    case 'olist':
      return renderListHtml(block.items ?? [], true, block.start ?? 1, attr)
    case 'tasklist':
      return `<ul class="task-list"${attr}>${(block.items ?? [])
        .map(
          (it) =>
            `<li class="task-item"><input type="checkbox"${it.checked ? ' checked' : ''} contenteditable="false"> <span>${inlineMdToHtml(it.md)}</span></li>`,
        )
        .join('')}</ul>`
    case 'callout': {
      const kind = block.callout ?? 'note'
      const label = block.title?.trim()
      const body = block.md
        .split('\n')
        .slice(1)
        .map((l) => l.replace(/^>\s?/, ''))
      while (body.length > 0 && !body[body.length - 1].trim()) body.pop()
      const bodyHtml = body
        .map((l) => (l.trim() ? `<p>${inlineMdToHtml(l)}</p>` : ''))
        .join('')
      /*
       * 标题结构：图标 + 显式标题。
       *
       * 用户没写标题时**不能**把默认文案（"提示"）写进 DOM：
       * 回写时靠"DOM 可见文本 == data-md 去标记后的文本"判断块是否被编辑过，
       * 凭空多出的"提示"会让每块都被判定为已编辑、反复重新推导。
       * 默认文案交给 CSS `::after { content: attr(data-label) }` —— 伪元素不进 textContent。
       * 同理图标用 SVG（<path> 无文本），而不是 emoji。
       */
      const titleHtml = label
        ? `<span>${escapeHtml(label)}</span>`
        : ''
      return `<div class="md-callout md-callout-${kind}" data-callout="${kind}"${attr}>` +
        `<div class="md-callout-title${label ? '' : ' is-default'}" data-label="${CALLOUT_LABELS[kind]}">${calloutIconHtml(kind)}${titleHtml}</div>` +
        `${bodyHtml}</div>`
    }
    case 'quote':
      return `<blockquote${attr}>${block.md
        .split('\n')
        .map((l) => `<p>${inlineMdToHtml(l.replace(/^>\s?/, ''))}</p>`)
        .join('')}</blockquote>`
    case 'code': {
      const body = block.md.replace(/^\s*(```|~~~)[\w+-]*\s*\n?/, '').replace(/\n?\s*(```|~~~)\s*$/, '')
      const langAttr = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : ''
      // 代码块必须可编辑（语雀同样支持直接改代码）；Enter/Tab 由 RichEditor 拦截为换行/缩进，
      // 避免浏览器插入 <div> 破坏缩进
      return `<pre${attr}><code${langAttr}>${escapeHtml(body)}</code></pre>`
    }
    case 'table':
      return tableMdToHtml(block.md).replace('<table', `<table${attr}`)
    case 'divider':
      return `<hr${attr}>`
    case 'aligned': {
      const align = block.align ?? 'left'
      const inner = ALIGNED_RE.exec(block.md)?.[2] ?? ''
      return `<div class="md-aligned"${attr} style="text-align:${align}">${inlineMdToHtml(inner)}</div>`
    }
    case 'paragraph':
    default:
      return `<p${attr}>${inlineMdToHtml(block.md)}</p>`
  }
}

/**
 * Markdown 全文 → 编辑器 HTML（块之间不加空行，间距由 CSS 控制）。
 *
 * **空文档必须渲染出一个空段落**：contenteditable 里若没有任何块元素，
 * 用户点进去无处落光标、无法输入 —— 表现为"新建文档后打不了字"。
 */
export function markdownToEditorHtml(md: string): string {
  const blocks = parseMarkdownBlocks(md)
  if (blocks.length === 0) return '<p><br></p>'
  return blocks.map(blockToHtml).join('')
}

/**
 * 把 Markdown 重新解析出的块源码写回各元素的 `data-md`。
 *
 * 为什么需要：`data-md` 是偏移换算（光标位置、斜杠检测、评论锚点）的依据，
 * 但它只在渲染时写入。用户打字后块内容已变、`data-md` 仍是旧值 ——
 * 读偏移就会按过期源码计算，位置全错。
 *
 * 对应关系：**空块单独处理，非空块按顺序对应解析结果**。
 * 不能要求块数与解析数相等后整体跳过 —— 用户按 Enter 产生的新段落是空的，
 * 而 parseMarkdownBlocks 会跳过空行，数量必然不等；整体跳过会让新段落永远
 * 没有 data-md（实测：在空段落里输入 `/` 唤不出斜杠菜单）。
 */
export function refreshBlockDataMd(root: HTMLElement, md: string): void {
  const blocks = parseMarkdownBlocks(md)
  const els = Array.from(root.children)
  let bi = 0
  for (const el of els) {
    /*
     * 判定"空块"必须排除**自带源码但无文本**的块。
     *
     * `<hr>` 就是这类：它没有 textContent，但源码是 `---`。
     * 若把它当空块跳过，后续块的源码会**整体前移一位** ——
     * 实测：`<hr>` 的 data-md 变成空串，而下一个 `<p>` 拿到了 `---`。
     * 这会让后续回写按错误的源码比较，可能改写用户内容。
     */
    const tag = el.tagName.toLowerCase()
    const isSelfContained = tag === 'hr' || tag === 'img' || tag === 'pre' || tag === 'table'
    const isEmpty =
      !isSelfContained && (el.textContent ?? '').trim() === '' && !el.querySelector('img')
    if (isEmpty) {
      if (el.getAttribute('data-md') !== '') el.setAttribute('data-md', '')
      continue
    }
    const next = blocks[bi++]
    if (next && el.getAttribute('data-md') !== next.md) {
      el.setAttribute('data-md', next.md)
    }
  }
}
