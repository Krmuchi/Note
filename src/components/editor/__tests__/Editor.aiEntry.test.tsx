import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Editor } from '@/components/editor/Editor'
import { useNotesStore } from '@/store'
import { subscribeToast } from '@/services/toast'
import type { NoteDoc } from '@/types'

/**
 * P1-9：编辑器里的两个 AI 入口。
 *
 * 旧实现里「AI 处理选中文本」藏在「⋯ 更多格式」里，而「AI 帮你写」（AiWriter）
 * 只挂在开始页 —— 写作中途想生成内容必须退回开始页。现在主工具条直接给两个入口。
 */

const doc: NoteDoc = {
  id: 'd1',
  title: '测试文档',
  content: '正文内容',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  localStorage.removeItem('notes-rich-editor')
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

describe('Editor - AI 入口（P1-9）', () => {
  it('主工具条同时提供「AI 帮你写」与「AI 处理选中文本」', () => {
    renderEditor()
    expect(screen.getByTitle('AI 帮你写：按主题生成新内容')).toBeInTheDocument()
    expect(
      screen.getByTitle('AI 处理选中文本（润色 / 改写 / 扩写 / 总结 / 风格转换）'),
    ).toBeInTheDocument()
  })

  it('点「AI 帮你写」打开面板，Esc 关闭', () => {
    renderEditor()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByTitle('AI 帮你写：按主题生成新内容'))
    const topic = screen.getByPlaceholderText(/请输入你想写的主题/)
    expect(topic).toBeInTheDocument()

    // 面板打开时焦点进入主题输入框；Esc 走面板的 keydown → 关闭
    fireEvent.keyDown(topic, { key: 'Escape' })
    expect(screen.queryByPlaceholderText(/请输入你想写的主题/)).toBeNull()
  })

  it('没有选区时点「AI 处理选中文本」明确提示，而不是静默失败', () => {
    const received: string[] = []
    const off = subscribeToast((message) => {
      received.push(message.message)
      return 'test-toast-' + received.length
    })
    try {
      renderEditor()
      fireEvent.click(
        screen.getByTitle('AI 处理选中文本（润色 / 改写 / 扩写 / 总结 / 风格转换）'),
      )
      expect(received.join('|')).toContain('请先选中要处理的文本')
      // 没有选区就不该弹 AI 浮层
      expect(screen.queryByRole('dialog')).toBeNull()
    } finally {
      off()
    }
  })
})
