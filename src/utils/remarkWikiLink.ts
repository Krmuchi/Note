/**
 * 把 Markdown 文本里的 `[[文档标题]]` 转成链接节点（K1）。
 *
 * 为什么写成 remark（mdast）插件而不是"先把正文正则替换成 Markdown 链接"：
 * 后者会把代码块与行内代码里的 `[[x]]` 一起替换掉（代码示例被改坏）。
 * mdast 层只会遍历到真正的文本节点，代码是独立节点类型，天然不受影响。
 *
 * 输出用自定义协议前缀 `#wiki:`，由 MarkdownPreview 拦截成内部跳转按钮。
 */

/** 双链在 href 里的协议前缀 */
export const WIKI_LINK_PREFIX = '#wiki:'

interface TextNode {
  type: 'text'
  value: string
}

interface WikiLinkNode {
  type: 'link'
  url: string
  children: TextNode[]
}

interface TreeNode {
  type: string
  value?: string
  url?: string
  children?: TreeNode[]
}

const PATTERN = /\[\[([^\]\n]+)\]\]/g

function splitText(value: string): Array<TextNode | WikiLinkNode> {
  const parts: Array<TextNode | WikiLinkNode> = []
  let lastIndex = 0

  for (const match of value.matchAll(PATTERN)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      parts.push({ type: 'text', value: value.slice(lastIndex, index) })
    }

    const title = match[1].trim()
    if (title) {
      parts.push({
        type: 'link',
        url: WIKI_LINK_PREFIX + encodeURIComponent(title),
        children: [{ type: 'text', value: title }],
      })
    } else {
      // 空标题 [[ ]] 原样保留，避免"看起来点了没反应"
      parts.push({ type: 'text', value: match[0] })
    }

    lastIndex = index + match[0].length
  }

  if (lastIndex < value.length) {
    parts.push({ type: 'text', value: value.slice(lastIndex) })
  }

  return parts
}

function walk(node: TreeNode): void {
  if (!Array.isArray(node.children)) return

  const next: TreeNode[] = []
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('[[')) {
      next.push(...(splitText(child.value) as TreeNode[]))
      continue
    }
    walk(child)
    next.push(child)
  }
  node.children = next
}

/** remark 插件：`remarkPlugins={[remarkGfm, remarkMath, remarkWikiLink]}` */
export function remarkWikiLink() {
  return (tree: TreeNode): void => {
    walk(tree)
  }
}

export default remarkWikiLink
