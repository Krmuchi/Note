import type { Comment } from '@/types'
import { rangeByMarkdownOffset } from './domOffset'

/**
 * 评论锚点在正文里的高亮（CSS Custom Highlight API）。
 *
 * 为什么不用 `<mark class="comment">` 包裹：
 * 1. contenteditable 里插元素会被 `editorHtmlToMarkdown` 当成用户内容回写，
 *    存盘后 Markdown 里会多出一堆 `<mark>` 标签；
 * 2. 每次输入/重渲染都要重新包裹一遍，与偏移层互相干扰（包裹后文本节点被拆开，
 *    下一次偏移换算就对不上了）。
 *
 * Custom Highlight 只影响**绘制**，DOM 树完全不变 —— 这是唯一"零副作用"的做法。
 * 浏览器不支持时静默降级（评论区仍可通过引用片段跳转定位）。
 */

const HIGHLIGHT_NAME = 'note-comments'

interface HighlightRegistry {
  set(name: string, highlight: unknown): void
  delete(name: string): void
}

type HighlightCtor = new (...ranges: Range[]) => unknown

function getRegistry(): HighlightRegistry | null {
  const css = CSS as unknown as { highlights?: HighlightRegistry }
  return css?.highlights ?? null
}

/** 按当前文档的评论重建高亮；传 null root 表示清空 */
export function applyCommentHighlights(root: HTMLElement | null, comments: Comment[]): void {
  const registry = getRegistry()
  if (!registry) return
  if (!root) {
    registry.delete(HIGHLIGHT_NAME)
    return
  }
  const Ctor = (window as unknown as { Highlight?: HighlightCtor }).Highlight
  if (!Ctor) return

  const ranges: Range[] = []
  for (const comment of comments) {
    if (!comment.anchor) continue
    const range = rangeByMarkdownOffset(root, comment.anchor.start, comment.anchor.end)
    // 空区间（原文已被删）不画：否则会在光标处留下一个 1px 的高亮块
    if (range && !range.collapsed) ranges.push(range)
  }

  if (ranges.length === 0) {
    registry.delete(HIGHLIGHT_NAME)
    return
  }
  registry.set(HIGHLIGHT_NAME, new Ctor(...ranges))
}

export function clearCommentHighlights(): void {
  getRegistry()?.delete(HIGHLIGHT_NAME)
}
