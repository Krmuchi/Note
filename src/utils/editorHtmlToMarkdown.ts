/**
 * 编辑器 HTML → Markdown（回写存储）。
 *
 * 与 `markdownToHtml.ts` 配对：那里给每个块写了 `data-md`（原始 Markdown），
 * 这里**优先读 data-md** —— 块未被编辑时直接返回原文，不做任何重新推导。
 * 这是往返保真的关键：`**加粗**`、表格对齐、代码块缩进等一旦被重新解析，
 * 很容易在多次编辑后慢慢失真。
 *
 * 只有当块的 DOM 内容与 data-md 已经不一致（用户改过这个块）时，
 * 才从 DOM 重新推导 Markdown。
 */

/** 从元素读回它当前的"语义文本"，用于判断块是否被编辑过 */
function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * 取元素的"语义文本"：`<br>` 记为空格，其余按 textContent。
 *
 * 为什么不能直接用 textContent：`<br>` 不产生任何文本字符，`line1<br>line2`
 * 的 textContent 是 `line1line2`，而对应源码的可见文本是 `line1 line2`。
 * 两者不等会让每个含软换行的块都被判定为"已编辑"，于是每次回写都重新推导 ——
 * 推导结果又是硬换行，等于**每次编辑都静默改写用户源码**（软换行→硬换行）。
 * 把 br 视作空格后两者相等，data-md 保真机制继续生效。
 */
function semanticText(node: Node): string {
  let out = ''
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName.toLowerCase() === 'br') {
      out += ' '
      return
    }
    out += child.nodeType === Node.TEXT_NODE ? (child.textContent ?? '') : semanticText(child)
  })
  return out
}

/**
 * 把 Markdown 源码归一化成"可见文本"，用于与 DOM 的 textContent 比较。
 *
 * 必须剥掉所有**标记符**（不只是行首的块标记）：`**加粗** 文字` 渲染成 DOM 后
 * textContent 是 `加粗 文字`，若只去行首标记，两侧永远不相等 ——
 * 那样每次回写都会走"重新推导"分支，data-md 的保真作用完全失效。
 */
function mdToVisibleText(md: string): string {
  return normalizeForCompare(
    md
      // 提示块类型标记（必须在剥 `>` 之前处理，否则标记行已变成 "[!tip] …"）
      .replace(/^\s*>\s*\[![\w-]+\]\s*/gm, '')
      // 代码围栏与语言标记
      .replace(/^\s*(```|~~~)[\w+-]*\s*$/gm, '')
      // 行首块标记：# > - * 1. - [ ] 等
      .replace(/^\s*(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+|[-*+]\s+\[[ xX]\]\s+)/gm, '')
      // 行内标记：** * ~~ ` 以及链接/图片的括号部分
      /*
       * 行内强调标记：`***` `**` `*` `~~` 反引号，以及下划线斜体 `_`。
       * `_` 必须在这里一起剥：`_斜体_` 渲染成 <em>斜体</em> 后 textContent 是 `斜体`，
       * 不剥下划线的话两边永远不相等 → 每块都被判为已编辑 → data-md 保真失效，
       * 回写会把用户的 `_斜体_` 静默改写成 `*斜体*`（实测）。
       * `_` 只在成对出现时才剥，避免吃掉 `snake_case` 里的下划线。
       */
      .replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, '$1$2')
      .replace(/\*\*\*|\*\*|~~|`/g, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      // 表格分隔行与竖线
      .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, '')
      .replace(/\|/g, ' ')
      // 行内 HTML 标签
      .replace(/<\/?[a-z][^>]*>/gi, ''),
  )
}

/** 行内 DOM → Markdown */
function inlineNodeToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()

  // 复选框不参与文本（任务列表状态由 li 的 class/属性决定）
  if (tag === 'input') return ''

  let inner = ''
  el.childNodes.forEach((child) => {
    inner += inlineNodeToMd(child)
  })

  switch (tag) {
    case 'strong':
    case 'b':
      return inner.trim() ? `**${inner}**` : inner
    /*
     * 斜体：`<em>` 本身不记录用户当初写的是 `*x*` 还是 `_x_`。
     *
     * 这里统一输出 `*x*`（最通用的写法）。要保住用户原始写法靠的是 data-md
     * 保真机制：块没被编辑时直接返回渲染时存下的源码，根本不会走到这个分支。
     * 只有当块**确实被改过**、且改后语义文本仍与源码一致时才需要这里兜底。
     */
    case 'em':
    case 'i':
      return inner.trim() ? `*${inner}*` : inner
    case 'del':
    case 's':
    case 'strike':
      return inner.trim() ? `~~${inner}~~` : inner
    case 'code':
      return `\`${el.textContent ?? ''}\``
    case 'a': {
      const href = el.getAttribute('href') ?? ''
      return href ? `[${inner}](${href})` : inner
    }
    case 'img': {
      const src = el.getAttribute('src') ?? ''
      const alt = el.getAttribute('alt') ?? ''
      if (!src) return ''
      /*
       * 尺寸：Markdown 没有图片尺寸语法，所以"调过宽度"的图片写成 HTML。
       * 优先读 width 属性（markdownToHtml 渲染时写的就是它），
       * 兼容 style.width（拖拽过程中直接改的是 style）。
       */
      const widthAttr = el.getAttribute('width') ?? ''
      const styleWidth = (el as HTMLElement).style?.width ?? ''
      const width = widthAttr || (/^\d+(\.\d+)?px$/.test(styleWidth) ? String(Math.round(parseFloat(styleWidth))) : '')
      return width
        ? `<img src="${src}" alt="${alt}" width="${width}">`
        : `![${alt}](${src})`
    }
    /*
     * 段内 <br>（Shift+Enter 软换行）→ 行尾两个空格的**硬换行**。
     *
     * 为什么不能写裸 `\n`：Markdown 里单个换行只是软换行，预览侧会把它折叠成
     * 空格 —— 实测「编辑器里两行、预览里一行」。行尾两空格是 CommenMark/GFM 的
     * 标准硬换行语法，配合 markdownToHtml 把 `\n` 渲染成 <br>，往返才闭环。
     *
     * 写成 '\n' + '  ' 而不是 '  ' + '\n'：换行符本身由调用方按顺序拼接，
     * 这里返回的字符串要成为「本行结尾」，两个空格必须紧贴在本行末尾。
     */
    case 'br':
      return '  \n'
    // 行内 HTML：原样保留，预览侧 rehype-raw 可解析
    case 'u':
    case 'mark':
    case 'sub':
    case 'sup':
    case 'span':
      return `<${tag}>${inner}</${tag}>`
    /*
     * 未知行内元素：**连标签一起原样返回**，不要只返回内容。
     *
     * 用户正文里写的是字面量 `<div>`、`<Foo>`（讨论代码时极常见），
     * 渲染时被 escapeHtml 变成文本节点、DOM 里是个普通文本 `使用 <div> 标签`。
     * 若这里只 return inner，尖括号就被静默丢掉 —— 实测回写成 `使用 div 标签`，
     * 用户的内容被改写。保留成 HTML 源码形态，至少不丢字符。
     */
    default:
      if (inner === '') return ''
      return `<${tag}>${inner}</${tag}>`
  }
}

function inlineHtmlToMd(el: Element | null): string {
  if (!el) return ''
  let out = ''
  el.childNodes.forEach((child) => {
    out += inlineNodeToMd(child)
  })
  return out.replace(/\u00a0/g, ' ').trim()
}

/** 列表项：处理任务列表的勾选状态与嵌套层级 */
function listItemsToMd(list: Element, ordered: boolean, start = 1, depth = 0): string {
  const lines: string[] = []
  let index = start
  const pad = '  '.repeat(depth)
  Array.from(list.children).forEach((li) => {
    if (li.tagName.toLowerCase() !== 'li') return
    const checkbox = li.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null
    const isTask = list.classList.contains('task-list') || Boolean(checkbox)
    // 任务项的文本在 span 里，普通项直接取 li 行内内容（排除复选框）
    const span = li.querySelector(':scope > span')
    const textEl = span ?? li

    /*
     * 去掉复选框与嵌套列表本身的影响：嵌套列表在下面单独递归输出。
     *
     * 同时必须移除**块级**子元素（p / div / h*）。contenteditable 里回车或退格
     * 可能把段落塞进 <li>（`<li>父项<p>新段落</p></li>`），只剔除 input/ul/ol
     * 的话 inlineHtmlToMd 会把 p 的文本直接拼到父项后面，得到「- 父项新段落」——
     * 两条内容黏成一条（实测）。这里先把块级子元素摘出来，下面按独立块输出，
     * 保持用户看到的分段。
     */
    const clone = textEl.cloneNode(true) as HTMLElement
    const looseBlocks: string[] = []
    Array.from(clone.children).forEach((child) => {
      const tagName = child.tagName.toLowerCase()
      const isBlockLevel = /^(p|div|h[1-6])$/.test(tagName)
      if (!isBlockLevel) return
      const t = inlineHtmlToMd(child)
      if (t) looseBlocks.push(t)
      child.remove()
    })
    clone.querySelectorAll('input, ul, ol').forEach((n) => n.remove())
    const text = inlineHtmlToMd(clone)

    if (isTask) {
      lines.push(`${pad}- [${checkbox?.checked ? 'x' : ' '}] ${text}`)
    } else if (ordered) {
      lines.push(`${pad}${index++}. ${text}`)
    } else {
      lines.push(`${pad}- ${text}`)
    }

    /*
     * 误嵌进 li 的块级内容单独成块输出。
     *
     * 不输出就等于**静默丢内容** —— 用户在这些段落里写的字会消失，
     * 而界面上它们仍在（直到下次重渲染才不见），是最坏的一类数据损坏。
     * 且必须插在列表项文本之后、嵌套列表之前，保持阅读顺序。
     */
    looseBlocks.forEach((block) => lines.push(block))

    // 嵌套列表：每层缩进 2 个空格，Markdown 解析回来自动还原层级
    Array.from(li.children).forEach((child) => {
      const tag = child.tagName.toLowerCase()
      if (tag !== 'ul' && tag !== 'ol') return
      const nested = listItemsToMd(child, tag === 'ol', 1, depth + 1)
      if (nested) lines.push(nested)
    })
  })
  return lines.join('\n')
}

/** 代码块内的可见文本：把 <br> 还原成换行（Enter 在代码块里插入的是 <br>） */
function preText(node: Node): string {
  let out = ''
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += (child.textContent ?? '').replace(/\u200B/g, '')
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as HTMLElement).tagName.toLowerCase()
      out += tag === 'br' ? '\n' : preText(child)
    }
  })
  return out
}

/** 表格 DOM → Markdown */
function tableToMd(table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr'))
  if (rows.length === 0) return ''

  const cellText = (cell: Element): string => inlineHtmlToMd(cell).replace(/\|/g, '\\|')
  const matrix = rows.map((r) => Array.from(r.querySelectorAll('th, td')).map(cellText))
  const colCount = matrix.reduce((max, r) => Math.max(max, r.length), 0)
  const pad = (row: string[]): string[] => [...row, ...Array(Math.max(0, colCount - row.length)).fill('')]

  const header = pad(matrix[0])
  const body = matrix.slice(1).map(pad)
  return [
    `| ${header.join(' | ')} |`,
    `| ${Array(colCount).fill('---').join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n')
}

/**
 * 单个块 DOM → Markdown。
 *
 * 先看 data-md：若块的当前文本与渲染时一致（说明没被编辑），直接返回原文。
 * 一致性的判定用"规范化后的语义文本"比较 —— 浏览器会把连续空格折叠、
 * 给 <p> 加 <br>，逐字节比较必然失败。
 */
export function blockElementToMd(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const stored = el.getAttribute('data-md')

  // 表格：内容未被改动时保留 data-md（重新推导会丢失 `:--:` 之类的对齐写法）
  if (tag === 'table' && stored) {
    const rows = stored.split('\n').filter((line) => line.trim())
    const cellsOf = (row: string): string[] =>
      row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
    // 分隔行不参与比较
    const storedCells = [...cellsOf(rows[0] ?? ''), ...rows.slice(2).flatMap(cellsOf)]
    const currentCells = Array.from(el.querySelectorAll('th, td')).map((c) =>
      (c.textContent ?? '').trim(),
    )
    const same =
      storedCells.length === currentCells.length &&
      storedCells.every((cell, i) => cell === currentCells[i])
    if (same) return stored
  }

  // 分割线没有可编辑内容：data-md 就是真相
  if (tag === 'hr' && stored) return stored

  // 代码块：用户编辑过就必须重新推导（否则改了代码却被 data-md 原样覆盖）
  if (tag === 'pre' && stored) {
    const body = stored
      .replace(/^\s*(```|~~~)[\w+-]*\s*\n?/, '')
      .replace(/\n?\s*(```|~~~)\s*$/, '')
    const current = preText(el).replace(/\n+$/, '')
    if (current === body) return stored
  }

  /*
   * 判断是否被编辑过：比较"去掉标记后的可见文本"。
   *
   * 含 <img> 的块必须排除：图片没有可见文本，改了宽度/删了图片，可见文本
   * 依然相等，会直接返回 data-md —— 表现为"拖了宽度、保存后一刷新又变回去"。
   */
  if (stored && tag !== 'pre' && !el.querySelector('img')) {
    const currentText = normalizeForCompare(semanticText(el))
    const storedText = mdToVisibleText(stored)
    /*
     * 含行内 HTML（a/em/strong/code…）的块：只要语义文本一致，就以 data-md 为准。
     *
     * 这一条把「用户原始写法」完整保住：`_斜体_`、`[文字](url)`、`**粗**` 都按
     * 用户敲的样子留在源码里，而不是被 DOM 推导成同义的另一种写法。
     * markdownToHtml 渲染这些块时本来就在 data-md 里存了原文，这里只是信任它。
     */
    if (currentText === storedText) return stored
  }

  switch (tag) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const level = Number(tag[1])
      const align = ((el as HTMLElement).style.textAlign || '').toLowerCase()
      const inner = inlineHtmlToMd(el)
      // 对齐必须连同标题标记一起写入，否则会被当成普通 HTML 块、`##` 直接显示
      return align === 'center' || align === 'right'
        ? `<h${level} style="text-align:${align}">${inner}</h${level}>`
        : `${'#'.repeat(level)} ${inner}`
    }
    case 'ul':
      return listItemsToMd(el, false)
    case 'ol': {
      const start = Number(el.getAttribute('start') ?? '1') || 1
      return listItemsToMd(el, true, start)
    }
    case 'blockquote': {
      // 引用块内部可能是多个 <p>
      const paras = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'p')
      const lines = paras.length
        ? paras.map((p) => inlineHtmlToMd(p))
        : [inlineHtmlToMd(el)]
      return lines.map((l) => (l ? `> ${l}` : '>')).join('\n')
    }
    case 'pre': {
      const code = el.querySelector('code')
      const lang = /language-([\w-]+)/.exec(code?.className ?? '')?.[1] ?? ''
      // 取整个 <pre> 的文本：光标偶尔会落在 <code> 之外的 padding 区域，
      // 只看 <code> 会把那部分输入**静默丢掉**
      const text = preText(el).replace(/\n+$/, '')
      return `\`\`\`${lang}\n${text}\n\`\`\``
    }
    case 'table':
      return tableToMd(el)
    case 'hr':
      return '---'
    case 'div': {
      /*
       * 提示块：`> [!TIP] 标题` 渲染成的 <div class="md-callout">。
       * 必须在这里重建源码（而不是复用 data-md），因为用户可能改了标题或正文；
       * 默认标题不写进 DOM，所以只取显式 <span>，不会把"提示"两个字带进源码。
       */
      if (el.classList.contains('md-callout')) {
        const kind = el.getAttribute('data-callout') || 'note'
        const title = (el.querySelector('.md-callout-title span')?.textContent ?? '').trim()
        const paras = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'p')
        const body = paras.map((p) => inlineHtmlToMd(p))
        if (body.length === 0) body.push('')
        return [`> [!${kind}]${title ? ` ${title}` : ''}`, ...body.map((l) => (l ? `> ${l}` : '>'))].join('\n')
      }
      // 对齐块：工具栏写入的 <div style="text-align:…">，预览侧由 rehype-raw 还原样式
      const align = ((el as HTMLElement).style.textAlign || '').toLowerCase()
      const inner = inlineHtmlToMd(el)
      return align === 'center' || align === 'right'
        ? `<div style="text-align:${align}">${inner}</div>`
        : inner
    }
    case 'p':
    default:
      return inlineHtmlToMd(el)
  }
}

/** 块级标签集合：用于从编辑器根节点筛出块 */
const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote,pre,table,hr,div'

/**
 * 编辑器根节点 → Markdown 全文。
 *
 * 只遍历**顶层**块元素（用 :scope > 限定），避免把嵌套在 li/blockquote 里的
 * 子块重复取出来。顶层裸文本节点（用户直接打字、还没成块）单独成段。
 */
export function editorHtmlToMarkdown(root: HTMLElement): string {
  const parts: string[] = []

  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/\u00a0/g, ' ').trim()
      if (text) parts.push(text)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (tag === 'br') {
      return
    }
    if (!BLOCK_SELECTOR.split(',').includes(tag)) {
      // 行内元素直接挂在根上（少见）：按其内容成段
      const text = inlineHtmlToMd(el)
      if (text) parts.push(text)
      return
    }

    const md = blockElementToMd(el)
    if (md.trim()) parts.push(md)
  })

  /*
   * 收尾只去掉**末尾**的空行，绝不能 trim 行首。
   *
   * 行首空格是有语义的：Markdown 里 4 个空格 = 代码块，丢掉会**改变渲染结果**。
   * 实测（模糊测试）：`  行首有空格的段落。` 往返后变成 `行首有空格的段落。`，
   * 首块的行首空格被文档级 trim 吃掉 —— 这是静默的数据损坏。
   */
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '')
}
