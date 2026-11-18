import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { useEffect, useState } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import EditorFindBar from '@/components/editor/EditorFindBar'

/**
 * 文档内查找（BUG-3）的交互回归。
 * textarea 无法高亮全部命中，所以断言落在"匹配计数 + 选中区间 + 替换内容"上。
 */

/*
 * 「全部替换」现在会先弹全局确认框（confirmAction → App 层唯一的 ConfirmDialog）。
 * 组件测试里没有那棵弹窗树，所以把发射器换成一个可控替身：
 * 默认"用户点了确定"（直接执行 onConfirm），取消用例再改成什么都不做。
 */
const confirmHolder = vi.hoisted(() => ({
  /** 当前"用户的选择"：默认点确定（直接跑 onConfirm），取消用例里置空 */
  handler: null as null | ((config: { onConfirm: () => void }) => void),
  calls: [] as { title: string; message: string; onConfirm: () => void }[],
}))
vi.mock('@/hooks/useConfirmAction', () => ({
  confirmAction: (config: { title: string; message: string; onConfirm: () => void }) => {
    confirmHolder.calls.push(config)
    confirmHolder.handler?.(config)
  },
}))

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

/** 默认行为：确认框被"确定"，与用户点「全部替换」后的真实路径一致 */
beforeEach(() => {
  confirmHolder.calls = []
  confirmHolder.handler = (config) => config.onConfirm()
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

  /* 缺陷5：全词匹配 —— 'cat' 不应命中 'cat2' */
  it('全词匹配开关生效', () => {
    const ref = { current: textarea }
    render(
      <EditorFindBar
        content="cat cat2 cat"
        textareaRef={ref}
        onReplaceContent={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: 'cat' } })
    expect(screen.getByText('1/3')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('全词匹配'))
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  /* 缺陷5：正则模式 + 非法正则应给出无效态而不是崩溃 */
  it('正则模式按表达式匹配，非法表达式显示无效态', () => {
    const ref = { current: textarea }
    render(
      <EditorFindBar
        content="a1 b2 c3"
        textareaRef={ref}
        onReplaceContent={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '[a-z]\\d' } })
    // 未开正则时按字面量查找，命中 0
    expect(screen.getByText('无结果')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('正则表达式'))
    expect(screen.getByText('1/3')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '(' } })
    expect(screen.getByText('正则无效')).toBeInTheDocument()
    expect(screen.getByLabelText('下一个匹配')).toBeDisabled()
  })

  /* 缺陷3：全部替换必须先确认，确认后一次性替换且只调用一次 */
  it('全部替换经确认后一次性替换所有命中', () => {
    const { onReplaceContent } = renderBar(undefined, undefined, true)
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })
    fireEvent.change(screen.getByLabelText('替换内容'), { target: { value: '术语' } })
    fireEvent.click(screen.getByRole('button', { name: '全部替换' }))

    expect(confirmHolder.calls).toHaveLength(1)
    expect(confirmHolder.calls[0].title).toBe('全部替换')
    expect(onReplaceContent).toHaveBeenCalledTimes(1)
    expect(onReplaceContent).toHaveBeenCalledWith(
      '第一章\n这里提到术语\n术语再出现一次',
    )
  })

  /* 全部替换不能因为"替换文本里也含查询词"就跳过命中 */
  it('全部替换不跳过任何命中（替换文本仍含查询词时）', () => {
    const ref = { current: textarea }
    const onReplaceContent = vi.fn()
    render(
      <EditorFindBar
        content="关键词 关键词 关键词"
        textareaRef={ref}
        onReplaceContent={onReplaceContent}
        onClose={vi.fn()}
        initialShowReplace
      />,
    )
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })
    fireEvent.change(screen.getByLabelText('替换内容'), { target: { value: '关键词X' } })
    fireEvent.click(screen.getByRole('button', { name: '全部替换' }))

    expect(onReplaceContent).toHaveBeenCalledTimes(1)
    expect(onReplaceContent).toHaveBeenCalledWith('关键词X 关键词X 关键词X')
  })

  /* 缺陷3：取消确认则一个字都不改 */
  it('全部替换取消确认时不动正文', () => {
    confirmHolder.handler = null // 模拟"用户点了取消"：不执行 onConfirm
    const { onReplaceContent } = renderBar(undefined, undefined, true)
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })
    fireEvent.change(screen.getByLabelText('替换内容'), { target: { value: '术语' } })
    fireEvent.click(screen.getByRole('button', { name: '全部替换' }))

    expect(confirmHolder.calls).toHaveLength(1)
    expect(onReplaceContent).not.toHaveBeenCalled()
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

  /* 缺陷2：替换框里按 Enter 必须是"替换"，不是"下一个" */
  it('替换框按 Enter 执行替换而不是跳到下一个', () => {
    const { onReplaceContent } = renderBar(undefined, undefined, true)
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })
    fireEvent.change(screen.getByLabelText('替换内容'), { target: { value: '术语' } })
    fireEvent.keyDown(screen.getByLabelText('替换内容'), { key: 'Enter' })

    expect(onReplaceContent).toHaveBeenCalledTimes(1)
    expect(onReplaceContent).toHaveBeenCalledWith(
      '第一章\n这里提到术语\n关键词再出现一次',
    )
  })

  /* 缺陷4：替换行展开时 Esc 只收起替换行，再按一次才关查找栏 */
  it('Esc 先收起替换行，再按一次才关闭查找栏', () => {
    const { onClose } = renderBar(undefined, undefined, true)
    fireEvent.keyDown(screen.getByLabelText('查找内容'), { key: 'Escape' })

    expect(screen.queryByLabelText('替换内容')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByLabelText('查找内容'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  /*
   * Ctrl+H 已打开时不换 key 重挂载，initialShowReplace 变成 true 后
   * 替换行必须跟着展开（此前只在 useState 初值里取一次，第二次 Ctrl+H 无效）
   */
  it('initialShowReplace 由 false 变 true 时展开替换行且不丢关键词', () => {
    const ref = { current: textarea }
    const { rerender } = render(
      <EditorFindBar
        content={content}
        textareaRef={ref}
        onReplaceContent={vi.fn()}
        onClose={vi.fn()}
        initialShowReplace={false}
      />,
    )
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })
    expect(screen.queryByLabelText('替换内容')).toBeNull()

    rerender(
      <EditorFindBar
        content={content}
        textareaRef={ref}
        onReplaceContent={vi.fn()}
        onClose={vi.fn()}
        initialShowReplace
      />,
    )
    expect(screen.getByLabelText('替换内容')).toBeInTheDocument()
    expect((screen.getByLabelText('查找内容') as HTMLInputElement).value).toBe('关键词')
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

  /*
   * 缺陷9：关闭后焦点回编辑器。富文本内核下 textareaRef 为 null，
   * 旧实现 `textareaRef.current?.focus()` 静默跳过，焦点落 body，
   * 用户关闭查找栏后接着打字毫无反应。onFocusEditor 必须被调用。
   */
  it('关闭时调用 onFocusEditor（富文本内核焦点回编辑器）', () => {
    const onFocusEditor = vi.fn()
    render(
      <EditorFindBar
        content={content}
        textareaRef={{ current: null }}
        onReplaceContent={vi.fn()}
        onClose={vi.fn()}
        onFocusEditor={onFocusEditor}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('查找内容'), { key: 'Escape' })
    expect(onFocusEditor).toHaveBeenCalled()
  })

  it('点 × 关闭也调用 onFocusEditor', () => {
    const onFocusEditor = vi.fn()
    render(
      <EditorFindBar
        content={content}
        textareaRef={{ current: null }}
        onReplaceContent={vi.fn()}
        onClose={vi.fn()}
        onFocusEditor={onFocusEditor}
      />,
    )
    fireEvent.click(screen.getByLabelText('关闭查找'))
    expect(onFocusEditor).toHaveBeenCalled()
  })
})

/*
 * 缺陷1：替换后不前进。
 *
 * 用受控壳子模拟 Editor 的真实行为（onReplaceContent → 新内容回灌 props），
 * 断言替换后当前命中落在**下一处**，而不是又回到刚被替换的那一段。
 */
describe('EditorFindBar - 替换后前进（缺陷1）', () => {
  function ReplaceHarness(): React.ReactElement {
    const [docContent, setDocContent] = useState('关键词 关键词 关键词')
    const ref = { current: textarea }
    useEffect(() => {
      textarea.value = docContent
    }, [docContent])
    return (
      <EditorFindBar
        content={docContent}
        textareaRef={ref}
        onReplaceContent={setDocContent}
        onClose={vi.fn()}
        initialShowReplace
      />
    )
  }

  it('替换当前后跳到下一处，而不是停在原地', () => {
    textarea.value = '关键词 关键词 关键词'
    render(<ReplaceHarness />)

    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })
    expect(screen.getByText('1/3')).toBeInTheDocument()

    // 替换文本里仍然含查询词 —— 正是旧实现"卡在原地"的场景
    fireEvent.change(screen.getByLabelText('替换内容'), { target: { value: '关键词X' } })
    fireEvent.click(screen.getByRole('button', { name: '替换' }))

    // 新正文：'关键词X 关键词 关键词'，命中在 0 / 5 / 9 三处
    expect(textarea.value).toBe('关键词X 关键词 关键词')
    // 当前命中已是第二处（旧实现会停在 0，反复替换同一段）
    expect(screen.getByText('2/3')).toBeInTheDocument()

    // 再点一次：旧的实现会把**第一处**再替换一遍（'关键词XX …'），
    // 正确的实现应当替换第二处
    fireEvent.click(screen.getByRole('button', { name: '替换' }))
    expect(textarea.value).toBe('关键词X 关键词X 关键词')
  })
})


/**
 * P0-1 / P1-7：富文本内核下的两条新约束。
 *
 * P0-1：替换回写会让 RichEditor 整体重建 contenteditable，立即设置的选区会落在
 * 被销毁的旧 DOM 上 —— 本组件改为只"登记目标区间"，由 Editor 在重建后恢复。
 * P1-7：jumpTo 依赖 content，直接挂在它上面意味着**在正文里每敲一个字**
 * 光标都被拽回命中处（textarea 与富文本内核都中招）。
 */
describe('EditorFindBar - 富文本内核（P0-1 / P1-7）', () => {
  it('替换当前时通过 deferRichSelection 登记新命中的区间', () => {
    const defer = vi.fn()
    const onReplaceContent = vi.fn()
    render(
      <EditorFindBar
        content={content}
        textareaRef={{ current: textarea }}
        onReplaceContent={onReplaceContent}
        onClose={vi.fn()}
        initialShowReplace
        deferRichSelection={defer}
      />,
    )

    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })
    fireEvent.change(screen.getByLabelText('替换内容'), { target: { value: '术语' } })
    fireEvent.click(screen.getByRole('button', { name: '替换' }))

    expect(onReplaceContent).toHaveBeenCalledTimes(1)
    expect(defer).toHaveBeenCalledTimes(1)
    const [start, end] = defer.mock.calls[0] as [number, number]
    // 只替换第一处：新正文是 '第一章\n这里提到术语\n关键词再出现一次'，
    // 登记的区间必须指向**剩下那处命中**（用户下一步就在那里继续）
    const replaced = '第一章\n这里提到术语\n关键词再出现一次'
    expect(replaced.slice(start, end)).toBe('关键词')
  })

  it('正文内容变化不再把选区拽回命中处，计数仍然同步更新', () => {
    const select = vi.fn()
    function Harness({ text }: { text: string }): React.JSX.Element {
      return (
        <EditorFindBar
          content={text}
          textareaRef={{ current: textarea }}
          onReplaceContent={vi.fn()}
          onClose={vi.fn()}
          selectRangeInRichEditor={select}
        />
      )
    }
    const { rerender } = render(<Harness text={content} />)
    fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })
    // 查询意图变化 → 重定位一次（先证明这条路是通的）
    expect(select).toHaveBeenCalledTimes(1)

    select.mockClear()
    // 模拟用户在正文里打字：content 变了，查找意图没变 —— 不能抢光标
    rerender(<Harness text={content + '\n新输入的句子'} />)
    expect(select).not.toHaveBeenCalled()
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('刻度带上抛防抖 200ms，计数仍是同步的', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    try {
      const onMatchesChange = vi.fn()
      render(
        <EditorFindBar
          content={content}
          textareaRef={{ current: textarea }}
          onReplaceContent={vi.fn()}
          onClose={vi.fn()}
          onMatchesChange={onMatchesChange}
        />,
      )
      fireEvent.change(screen.getByLabelText('查找内容'), { target: { value: '关键词' } })

      // 计数立即可见（用户正在输入查询词）
      expect(screen.getByText('1/2')).toBeInTheDocument()
      // 刻度带上抛延后一拍
      expect(onMatchesChange).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(250)
      })
      expect(onMatchesChange).toHaveBeenCalled()
      const payload = onMatchesChange.mock.calls.at(-1)?.[0] as {
        matches: { index: number }[]
        current: number
      }
      expect(payload.matches).toHaveLength(2)
      expect(payload.current).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

