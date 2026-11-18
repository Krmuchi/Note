import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import type { NoteDoc } from '@/types'

/**
 * P1-6：一次击键只做一遍全文 HTML→Markdown 序列化。
 *
 * 旧行为：行内渲染分支里先 commit 一次、函数末尾再无条件 commit 一次 ——
 * 光标在任何段落里打字都会对全文序列化两遍 + 重写两遍 data-md，
 * 是大文档打字卡顿的直接来源。这里用模块 spy 数调用次数把它钉住。
 */
const calls = vi.hoisted(() => ({ count: 0 }))

vi.mock('@/utils/editorHtmlToMarkdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/editorHtmlToMarkdown')>()
  return {
    ...actual,
    editorHtmlToMarkdown: (root: HTMLElement) => {
      calls.count += 1
      return actual.editorHtmlToMarkdown(root)
    },
  }
})

import { RichEditor } from '@/components/editor/RichEditor'

const doc = (content: string): NoteDoc => ({
  id: 'd1',
  title: '文档',
  content,
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

function renderEditor(content: string): HTMLElement {
  const { container } = render(
    <RichEditor activeDoc={doc(content)} updateDocContent={vi.fn()} fontSize="15px" />,
  )
  return container.querySelector('.rich-editor') as HTMLElement
}

/** 把光标放进 root 的第一个文本节点里（模拟用户正在这里打字） */
function caretInFirstText(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const node = walker.nextNode() as Text | null
  if (!node) return
  const range = document.createRange()
  range.setStart(node, Math.min(2, (node.textContent ?? '').length))
  range.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

beforeEach(() => {
  calls.count = 0
})

describe('RichEditor 输入链路序列化次数（P1-6）', () => {
  it('普通段落里敲一个字：只序列化一次', () => {
    const root = renderEditor('这是普通段落')
    expect(calls.count).toBe(0)
    caretInFirstText(root)

    fireEvent.input(root)
    expect(calls.count).toBe(1)
  })

  it('光标在行内格式（加粗）里打字：仍然只序列化一次', () => {
    const root = renderEditor('**加粗内容** 后续文字')
    caretInFirstText(root)

    fireEvent.input(root)
    expect(calls.count).toBe(1)
  })

  it('连敲三个字不会累计成 6 次序列化', () => {
    const root = renderEditor('多字测试')
    caretInFirstText(root)

    fireEvent.input(root)
    fireEvent.input(root)
    fireEvent.input(root)
    expect(calls.count).toBe(3)
  })
})
