/**
 * 提示块（GitHub Alerts 语法）→ 预览 DOM。
 *
 * 语法：
 *   > [!TIP] 可选标题
 *   > 正文
 *
 * 为什么用 remark 插件而不是预处理字符串：
 * 预览链路是 remark-gfm → rehype-raw → sanitize → katex，正文里可能含粗体、链接、
 * 公式。若把整块替换成 HTML 字符串，内部 Markdown 就不再被解析（`**粗体**` 会原样显示）；
 * 在 mdast 上改结构则保留了后续所有解析能力。
 *
 * 为什么不装 remark-github-blockquote-alert：
 * 项目约束是"零新增运行时依赖"，而且该插件只为这一种语法服务，几十行手写足够。
 */

import { CALLOUT_LABELS, normalizeCalloutKind } from './calloutMeta'

/** mdast 节点（只声明本插件用到的字段，避免引入 @types/mdast 依赖） */
interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
  data?: {
    hName?: string
    hProperties?: Record<string, unknown>
  }
}

function walk(node: MdNode, visit: (n: MdNode) => void): void {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

/**
 * remark 插件：把「首段以 [!TYPE] 开头的 blockquote」改写成带类名的 div。
 */
export function remarkCallout() {
  return (tree: MdNode): void => {
    walk(tree, (node) => {
      if (node.type !== 'blockquote' || !node.children?.length) return

      const first = node.children[0]
      if (first.type !== 'paragraph' || !first.children?.length) return

      const textNode = first.children[0]
      if (textNode.type !== 'text' || typeof textNode.value !== 'string') return

      /*
       * 只认**首行**的标记。
       *
       * 引用块里连续几行在 mdast 里是同一个 paragraph，`> [!tip] 标题\n> 正文`
       * 的文本节点值是 "…标题\n正文"。旧实现用 /^\[!(\w+)\]\s*([\s\S]*)$/ 整段吞下，
       * 结果"标题"变成"标题\n正文"、正文被塞进标题节点（实测：预览里两行挤成一行）。
       */
      const newlineAt = textNode.value.indexOf('\n')
      const firstLine = newlineAt === -1 ? textNode.value : textNode.value.slice(0, newlineAt)
      const rest = newlineAt === -1 ? '' : textNode.value.slice(newlineAt + 1)

      const match = /^\[!([\w-]+)\]\s*(.*)$/.exec(firstLine)
      if (!match) return

      const kind = normalizeCalloutKind(match[1])
      if (!kind) return

      const title = match[2].trim()

      if (rest) {
        // 标记行后面还有正文：保留原段落，只把标记与标题从文本里摘掉
        textNode.value = rest
      } else {
        // 整段只有标记行：整段移除，正文在后续段落里
        node.children.shift()
      }

      node.children.unshift({
        type: 'paragraph',
        data: {
          hName: 'div',
          hProperties: {
            // 带类型后缀的类名：预览侧据此渲染对应图标（标题节点拿不到父节点的 class）
            className: ['md-callout-title', `md-callout-title-${kind}`],
            // 标题始终有真实文本（默认文案），预览不依赖 CSS 伪元素补文案
            'data-label': CALLOUT_LABELS[kind],
          },
        },
        children: [{ type: 'text', value: title || CALLOUT_LABELS[kind] }],
      })

      node.data = {
        hName: 'div',
        hProperties: {
          className: ['md-callout', `md-callout-${kind}`],
          'data-callout': kind,
        },
      }
    })
  }
}
