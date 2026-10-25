import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { Editor } from '@/components/editor/Editor'
import { useNotesStore } from '@/store'
import { requestSearchJump, resetSearchJump } from '@/utils/searchJump'
import type { NoteDoc } from '@/types'

/**
 * S1 端到端：搜索结果 → 编辑器打开查找栏并定位到首个命中。
 * 这条链路跨了 AppPanels / MainContent 多层，用模块级事件传递，
 * 所以必须在真实 Editor 上验证"收到请求后确实打开了查找栏并预填了关键词"。
 */

const content = '开头\n这里有关键词\n关键词再来一次'
const doc: NoteDoc = {
  id: 'd1',
  title: '测试文档',
  content,
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  /*
   * 这条测试断言的是 **textarea 内核**的查找跳转（读 `textarea.selectionStart`）。
   * 富文本内核已是默认开启，渲染的是 contenteditable、根本没有 textarea，
   * 不显式关闭会让测试因"找不到 textarea"而失败 ——
   * 那是测试前提过时，不是产品缺陷。
   * 富文本内核的查找跳转由 scripts/rich-editor-check.mjs 在真实浏览器里验证。
   */
  localStorage.setItem('notes-rich-editor', '0')
  resetSearchJump()
  useNotesStore.setState({
    notebooks: [{ id: 'nb1', title: '库', docs: [doc] }],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'd1',
    saveStatus: 'saved',
  })
})

const renderEditor = (): ReturnType<typeof render> =>
  render(
    <Editor
      activeDoc={doc}
      activeNotebookId="nb1"
      activeDocId="d1"
      fontSize="15px"
      onFontSizeChange={() => {}}
    />,
  )

describe('Editor - 搜索跳转定位（S1）', () => {
  it('默认不显示查找栏', () => {
    renderEditor()
    expect(screen.queryByLabelText('查找内容')).toBeNull()
  })

  it('收到跳转请求后打开查找栏、预填关键词并选中首个命中', async () => {
    renderEditor()

    await act(async () => {
      requestSearchJump({ docId: 'd1', query: '关键词' })
    })

    expect(screen.getByLabelText('查找内容')).toHaveValue('关键词')
    expect(screen.getByText('1/2')).toBeInTheDocument()

    /*
     * 旧内核（EditorContent）已改成 React.lazy —— 富文本是默认内核，
     * textarea 分支只有显式关闭富文本才渲染，没必要进首屏。
     * 因此这里必须等异步分块解析完成，不能再同步取 DOM。
     */
    const textarea = await waitFor(() => {
      const el = document.querySelector('textarea')
      expect(el).not.toBeNull()
      return el as HTMLTextAreaElement
    })
    expect(textarea.selectionStart).toBe(content.indexOf('关键词'))
  })

  it('请求指向其它文档时不打开查找栏（避免把关键词强加给当前文档）', async () => {
    renderEditor()

    await act(async () => {
      requestSearchJump({ docId: 'other-doc', query: '关键词' })
    })

    expect(screen.queryByLabelText('查找内容')).toBeNull()
  })
})
