import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Editor } from '@/components/editor/Editor'
import { useNotesStore } from '@/store'
import type { NoteDoc } from '@/types'

/**
 * 回归锁：查找词不能因为「打开替换行 / 再次按 Ctrl+F」被清空。
 *
 * 根因史：FindBar 的 key 曾含 replace 维度，且 Ctrl+F/Ctrl+H 用整体对象 setFindBar ——
 * 任何 key 变化都会重挂载组件，而用户输入的查找词只存在组件内部 state 里。
 * 实机表现（rich-editor-check 第 21 步曾卡死）：输入关键词 → Ctrl+H →
 * 计数变空串、命中归零、替换按钮恒 disabled。
 */

const doc: NoteDoc = {
  id: 'd1',
  title: '测试文档',
  content: '开头\n关键词甲\n关键词乙',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  // 与兄弟测试同款：断言聚焦查找栏行为本身，不引入内核差异
  localStorage.setItem('notes-rich-editor', '0')
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
    <Editor activeDoc={doc} activeNotebookId="nb1" activeDocId="d1" fontSize="15px" onFontSizeChange={() => {}} />,
  )

/** Editor 的查找快捷键挂在 window capture 阶段 */
const press = (key: string): void => {
  fireEvent.keyDown(window, { key, ctrlKey: true })
}

describe('Editor - 查找词在开合替换行时不丢（回归锁）', () => {
  it('输入关键词后按 Ctrl+H：查找词保留、计数仍在、替换行展开', () => {
    renderEditor()
    press('f')
    const input = screen.getByLabelText('查找内容') as HTMLInputElement
    fireEvent.change(input, { target: { value: '关键词' } })
    expect(screen.getByText('1/2')).toBeInTheDocument()

    press('h')

    // 核心断言：key 重挂载会把 value 打回空串、计数变成 ''
    expect(screen.getByLabelText('查找内容')).toHaveValue('关键词')
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByLabelText('替换内容')).toBeInTheDocument()
  })

  it('已打开查找栏时再按 Ctrl+F 不清空查找词（setFindBar 改为函数式更新）', () => {
    renderEditor()
    press('f')
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })

    press('f')

    expect(screen.getByLabelText('查找内容')).toHaveValue('关键词')
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })
});
