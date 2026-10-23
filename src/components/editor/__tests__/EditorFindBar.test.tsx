import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EditorFindBar from '@/components/editor/EditorFindBar'

/**
 * 文档内查找（BUG-3）的交互回归。
 * textarea 无法高亮全部命中，所以断言落在"匹配计数 + 选中区间 + 替换内容"上。
 */

const content = '第一章\n这里提到关键词\n关键词再出现一次'

let textarea: HTMLTextAreaElement

beforeEach(() => {
  textarea = document.createElement('textarea')
  textarea.value = content
  document.body.appendChild(textarea)
})

afterEach(() => {
  textarea.remove()
})

function renderBar(
  onReplaceContent = vi.fn(),
  onClose = vi.fn(),
  initialShowReplace = false,
): { onReplaceContent: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const ref = { current: textarea }
  render(
    <EditorFindBar
      content={content}
      textareaRef={ref}
      onReplaceContent={onReplaceContent}
      onClose={onClose}
      initialShowReplace={initialShowReplace}
    />,
  )
  return { onReplaceContent, onClose }
}

describe('EditorFindBar', () => {
  it('输入查询词后显示匹配计数并选中第一处命中', () => {
    renderBar()
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })

    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(textarea.selectionStart).toBe(content.indexOf('关键词'))
    expect(textarea.selectionEnd).toBe(content.indexOf('关键词') + 3)
  })

  it('下一个 / 上一个循环切换命中位置', () => {
    renderBar()
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })

    fireEvent.click(screen.getByLabelText('下一个匹配'))
    expect(screen.getByText('2/2')).toBeInTheDocument()
    expect(textarea.selectionStart).toBe(content.lastIndexOf('关键词'))

    fireEvent.click(screen.getByLabelText('下一个匹配'))
    expect(screen.getByText('1/2')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('上一个匹配'))
    expect(screen.getByText('2/2')).toBeInTheDocument()
  })

  it('无命中时显示「无结果」且按钮禁用', () => {
    renderBar()
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '不存在的词' } })
    expect(screen.getByText('无结果')).toBeInTheDocument()
    expect(screen.getByLabelText('下一个匹配')).toBeDisabled()
  })

  it('区分大小写开关生效', () => {
    const ref = { current: textarea }
    render(
      <EditorFindBar
        content="Foo foo FOO"
        textareaRef={ref}
        onReplaceContent={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: 'foo' } })
    expect(screen.getByText('1/3')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('区分大小写'))
    expect(screen.getByText('1/1')).toBeInTheDocument()
  })

  it('全部替换一次性替换所有命中', () => {
    const { onReplaceContent } = renderBar(undefined, undefined, true)
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })
    fireEvent.change(screen.getByLabelText('替换内容'), { target: { value: '术语' } })
    fireEvent.click(screen.getByRole('button', { name: '全部替换' }))

    expect(onReplaceContent).toHaveBeenCalledWith(
      '第一章\n这里提到术语\n术语再出现一次',
    )
  })

  it('替换当前只改当处命中', () => {
    const { onReplaceContent } = renderBar(undefined, undefined, true)
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })
    fireEvent.change(screen.getByLabelText('替换内容'), { target: { value: '术语' } })
    fireEvent.click(screen.getByRole('button', { name: '替换' }))

    expect(onReplaceContent).toHaveBeenCalledWith(
      '第一章\n这里提到术语\n关键词再出现一次',
    )
  })

  it('默认隐藏替换行，点 ⇄ 才展开', () => {
    renderBar()
    expect(screen.queryByLabelText('替换内容')).toBeNull()
    fireEvent.click(screen.getByTitle('替换'))
    expect(screen.getByLabelText('替换内容')).toBeInTheDocument()
  })

  it('initialQuery 预填关键词并定位到首个命中（搜索跳转场景，S1）', () => {
    const ref = { current: textarea }
    render(
      <EditorFindBar
        content={content}
        textareaRef={ref}
        onReplaceContent={vi.fn()}
        onClose={vi.fn()}
        initialQuery="关键词"
      />,
    )

    expect((screen.getByLabelText('查找内容') as HTMLInputElement).value).toBe('关键词')
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(textarea.selectionStart).toBe(content.indexOf('关键词'))
  })

  it('Esc 关闭查找栏', () => {
    const { onClose } = renderBar()
    fireEvent.keyDown(screen.getByLabelText('查找内容'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
