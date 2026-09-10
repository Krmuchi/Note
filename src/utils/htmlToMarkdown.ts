/**
 * 剪贴板 HTML 片段 → Markdown 的轻量转换。
 * 覆盖语雀/网页/Word 复制场景的常见标签：标题、段落、强调、行内代码、代码块、
 * 列表（含嵌套）、表格、引用、链接、图片、分割线、上/下标、高亮。
 * 不引入 turndown：只需覆盖固定标签集，自研可控制体积且无正则回溯风险。
 */

/** 超过该长度退化为纯文本插入，避免主线程长任务阻塞输入 */
export const HTML_TO_MD_MAX_LENGTH = 1024 * 1024;

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'ul', 'ol', 'li', 'table', 'pre',
  'blockquote', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

/** 文本节点归一化：制表符/换行折叠为空格，避免源码里出现奇怪换行 */
function normalizeText(text: string | null): string {
  return (text ?? '').replace(/[\r\n\t]+/g, ' ');
}

/** 行内节点 → Markdown 行内片段（文本走原文，元素按标签包裹） */
function inlineToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return normalizeText(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  // 先递归子节点，再按当前标签决定包裹方式（保证顶层行内元素也正确包裹）
  let inner = '';
  el.childNodes.forEach((child) => {
    inner += inlineToMd(child);
  });

  switch (tag) {
    case 'strong':
    case 'b':
      return inner.trim() ? `**${inner}**` : '';
    case 'em':
    case 'i':
      return inner.trim() ? `*${inner}*` : '';
    case 'del':
    case 's':
    case 'strike':
      return inner.trim() ? `~~${inner}~~` : '';
    case 'code':
      return `\`${el.textContent ?? ''}\``;
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      return href ? `[${inner}](${href})` : inner;
    }
    case 'img': {
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      return src ? `![${alt}](${src})` : '';
    }
    case 'br':
      return '\n';
    // 预览侧 rehype-raw 可解析，原样保留
    case 'sup':
    case 'sub':
    case 'u':
    case 'mark':
      return `<${tag}>${inner}</${tag}>`;
    case 'script':
    case 'style':
      return '';
    default:
      // span/font/其他容器：丢弃样式只保留文本
      return inner;
  }
}

function hasBlockChild(el: Element): boolean {
  return Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()));
}

function convertList(list: Element, depth: number): string[] {
  const out: string[] = [];
  const pad = '  '.repeat(depth);
  const ordered = list.tagName.toLowerCase() === 'ol';
  let index = Number(list.getAttribute('start') ?? '1') || 1;

  Array.from(list.children).forEach((li) => {
    if (li.tagName.toLowerCase() !== 'li') return;
    const marker = ordered ? `${index++}. ` : '- ';
    const nested: Element[] = [];
    const inlineParts: string[] = [];

    Array.from(li.childNodes).forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        inlineParts.push(normalizeText(n.textContent));
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const t = (n as Element).tagName.toLowerCase();
      if (t === 'ul' || t === 'ol') nested.push(n as Element);
      else inlineParts.push(inlineToMd(n as Element));
    });

    const text = inlineParts.join('').trim();
    out.push(`${pad}${marker}${text}`);
    nested.forEach((sub) => out.push(...convertList(sub, depth + 1)));
  });

  return out;
}

function convertTable(table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const cellText = (cell: Element) => inlineToMd(cell).trim().replace(/\|/g, '\\|');
  const matrix = rows.map((r) => Array.from(r.querySelectorAll('th, td')).map(cellText));
  const colCount = matrix.reduce((max, r) => Math.max(max, r.length), 0);
  const padRow = (row: string[]) => [...row, ...Array(Math.max(0, colCount - row.length)).fill('')];

  const header = padRow(matrix[0]);
  const body = matrix.slice(1).map(padRow);
  return [
    `| ${header.join(' | ')} |`,
    `| ${Array(colCount).fill('---').join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

/** 容器内的子节点 → Markdown 块列表（文本节点单独成段，避免顶层裸文本丢失） */
function convertBlocks(container: Element, depth = 0): string[] {
  const out: string[] = [];

  Array.from(container.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.textContent).trim();
      if (text) out.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const child = node as Element;
    const tag = child.tagName.toLowerCase();

    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      const level = Number(heading[1]);
      const text = inlineToMd(child).trim();
      if (text) out.push(`${'#'.repeat(level)} ${text}`);
      return;
    }

    switch (tag) {
      case 'ul':
      case 'ol':
        // 列表整体是一个块：行间用单换行，不能被外层的块间空行拆散
        out.push(convertList(child, depth).join('\n'));
        return;
      case 'blockquote':
        out.push(convertBlocks(child, depth).map((line) => (line ? `> ${line}` : '>')).join('\n'));
        return;
      case 'pre': {
        const code = child.querySelector('code');
        const source = code ?? child;
        const lang = /language-([\w-]+)/.exec(source.className)?.[1] ?? '';
        const text = (source.textContent ?? '').replace(/\n+$/, '');
        out.push(`\`\`\`${lang}\n${text}\n\`\`\``);
        return;
      }
      case 'table': {
        const table = convertTable(child);
        if (table) out.push(table);
        return;
      }
      case 'hr':
        out.push('---');
        return;
      default:
        break;
    }

    // 段落类容器：内部还有块级元素时继续下钻，否则作为纯文本段落
    if (hasBlockChild(child)) {
      out.push(...convertBlocks(child, depth));
      return;
    }
    const text = inlineToMd(child).trim();
    if (text) out.push(text);
  });

  return out;
}

/**
 * 将剪贴板 HTML 转换为 Markdown；无 DOMParser 环境（理论上不存在）或空结果时返回空串。
 * 调用方应先做长度校验（见 HTML_TO_MD_MAX_LENGTH）。
 */
export function htmlToMarkdown(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return '';

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  if (!body) return '';

  // 顶层没有块级元素（如选区复制的纯行内片段）时整体按行内转换，避免拆散文本
  const hasBlockElement = Array.from(body.children).some((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()));
  if (!hasBlockElement) return inlineToMd(body).trim();

  return convertBlocks(body)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
