import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { render, fireEvent, act, waitFor } from '@testing-library/react'
import type React from 'react'
import { Editor } from '@/components/editor/Editor'
import { useNotesStore } from '@/store'
import { requestDocOpen } from '@/utils/docNavigation'
import type { NoteDoc } from '@/types'

/**
 * 富文本内核（默认开启）下的 Editor 级回归：
 * - 缺陷6：选中文字后粘贴 HTML/图片必须**替换选区**，而不是"旧文字+新内容"两份。
 * - lead 接线：经 requestDocOpen 通道打开当前文档后焦点回编辑器（QuickOpen 场景）。
 *
 * 用受控载体把 updateDocContent 写回 state，模拟真实 store 回流，
 * 这样粘贴后的内容断言反映的是用户最终看到的文档。
 */

const makeDoc = (content: string): NoteDoc => ({
  id: 'd1',
  title: '测试文档',
  content,
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  versions: [],
  comments: [],
  shareLinks: [],
})

/** jsdom 未实现 Range.getBoundingClientRect（划词浮层/斜杠定位用），本文件内补桩 */
beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    writable: true,
    configurable: true,
    value: (): DOMRect =>
      ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  })
})

/* Editor 内部直接调 store.updateDoc 回写，所以装配真实 store 并从 store 派生 activeDoc，
 * 这样粘贴后的内容断言反映用户最终看到的文档（与生产链路一致）。 */
function seedStore(content: string): void {
  useNotesStore.setState({
    notebooks: [{ id: 'nb1', title: '库', docs: [makeDoc(content)] }],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'd1',
    saveStatus: 'saved',
    history: {},
  })
}

function StoreEditor(): React.JSX.Element {
  const doc = useNotesStore((s) => s.notebooks[0]?.docs[0] ?? null)
  return (
    <Editor
      activeDoc={doc}
      activeNotebookId="nb1"
      activeDocId="d1"
      fontSize="15px"
      onFontSizeChange={() => {}}
    />
  )
}

beforeEach(() => {
  // 富文本内核默认开启；显式清除开关确保走 contenteditable 分支
  localStorage.removeItem('notes-rich-editor')
  document.body.innerHTML = ''
})

/** 选中顶层第一个段落里的 [from,to) 文本 */
function selectInFirstParagraph(root: HTMLElement, from: number, to: number): void {
  const textNode = root.querySelector('p')!.firstChild!
  const range = document.createRange()
  range.setStart(textNode, from)
  range.setEnd(textNode, to)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

function currentContent(): string {
  return useNotesStore.getState().notebooks[0]?.docs[0]?.content ?? ''
}

describe('Editor 富文本粘贴替换选区（缺陷6）', () => {
  it('选中文字后粘贴 HTML，旧文字被替换而非保留两份', async () => {
    seedStore('甲乙丙丁')
    render(<StoreEditor />)
    const root = document.querySelector('.rich-editor') as HTMLElement
    expect(root).not.toBeNull()

    // 选中 "乙丙"（偏移 1..3）
    selectInFirstParagraph(root, 1, 3)

    fireEvent.paste(root, {
      clipboardData: {
        items: [],
        getData: (t: string) => (t === 'text/html' ? '<b>新</b>' : '新'),
      },
    })

    // insertMarkdownAtCursor 走 rAF 恢复光标；内容回写是同步的
    await waitFor(() => {
      expect(currentContent()).toBe('甲**新**丁')
    })
    // 关键：不能是 "甲乙丙**新**丁"（旧实现只在选区末尾拼接）
    expect(currentContent()).not.toContain('乙丙')
  })

  it('无选区时粘贴仍在光标处插入（不回归）', async () => {
    seedStore('甲乙')
    render(<StoreEditor />)
    const root = document.querySelector('.rich-editor') as HTMLElement
    // 光标放到末尾
    const textNode = root.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 2)
    range.collapse(true)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.paste(root, {
      clipboardData: {
        items: [],
        getData: (t: string) => (t === 'text/html' ? '<b>丙</b>' : '丙'),
      },
    })
    await waitFor(() => {
      expect(currentContent()).toBe('甲乙**丙**')
    })
  })
})

describe('Editor QuickOpen 打开后聚焦（lead 接线）', () => {
  it('经 requestDocOpen 打开当前文档后焦点回到富文本编辑器', async () => {
    seedStore('内容')
    render(<StoreEditor />)
    const root = document.querySelector('.rich-editor') as HTMLElement
    expect(root).not.toBeNull()
    // 先把焦点移开（模拟 QuickOpen 输入框夺焦）
    ;(document.body as HTMLElement).focus?.()
    root.blur()

    await act(async () => {
      requestDocOpen({ notebookId: 'nb1', docId: 'd1' })
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })

    await waitFor(() => {
      expect(document.activeElement).toBe(root)
    })
  })
})