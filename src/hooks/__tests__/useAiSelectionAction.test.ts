import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAiSelectionAction } from '@/hooks/useAiSelectionAction'
import type { RichSelectionPort } from '@/hooks/useAiSelectionAction'
import { subscribeToast } from '@/services/toast'
import type { ToastMessage } from '@/services/toast'

/**
 * 划词 AI 选区操作的双内核契约。
 *
 * 背景：旧实现只有 textarea 分支，默认富文本内核下 textareaRef 恒为 null，
 * open() 第一行就 return false —— 选中文字点「AI 处理」毫无反应，连提示都没有。
 * 这里锁住：两个内核都能捕获选区/回写；无选区必须有 toast；快照失配必须降级。
 */

function collectToasts(): { messages: ToastMessage[]; unsubscribe: () => void } {
  const messages: ToastMessage[] = []
  const unsubscribe = subscribeToast((m) => {
    messages.push(m)
    return 'test'
  })
  return { messages, unsubscribe }
}

function makeTextarea(value: string, start: number, end: number): HTMLTextAreaElement {
  const ta = document.createElement('textarea')
  ta.value = value
  ta.selectionStart = start
  ta.selectionEnd = end
  document.body.appendChild(ta)
  return ta
}

function makeRichPort(range: { start: number; end: number } | null): RichSelectionPort & {
  selectRange: Mock<(start: number, end: number) => boolean>
  focus: Mock<() => void>
} {
  return {
    getSelectionRange: () => range,
    selectRange: vi.fn<(start: number, end: number) => boolean>(() => true),
    focus: vi.fn<() => void>(),
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('textarea 内核', () => {
  it('有选区时捕获快照并返回 true', () => {
    const ta = makeTextarea('你好世界', 0, 2)
    const updateDocContent = vi.fn()
    const { result } = renderHook(() =>
      useAiSelectionAction({
        textareaRef: { current: ta },
        updateDocContent,
        activeDocId: 'd1',
        enabled: true,
      }),
    )
    let opened = false
    act(() => {
      opened = result.current.open()
    })
    expect(opened).toBe(true)
    // 快照对外只承诺 start/end/text（内部还带 docId/enabled/kernel 用于失效判定）
    expect(result.current.selection).toMatchObject({ start: 0, end: 2, text: '你好' })
    expect(result.current.position).not.toBeNull()
  })

  it('无选区时 toast 提示并返回 false（不静默）', () => {
    const ta = makeTextarea('你好世界', 1, 1)
    const { messages, unsubscribe } = collectToasts()
    try {
      const { result } = renderHook(() =>
        useAiSelectionAction({
          textareaRef: { current: ta },
          updateDocContent: vi.fn(),
          enabled: true,
        }),
      )
      let opened = true
      act(() => {
        opened = result.current.open()
      })
      expect(opened).toBe(false)
      expect(messages.some(m => m.message.includes('选中'))).toBe(true)
    } finally {
      unsubscribe()
    }
  })

  it('apply 用结果替换选区并回写', async () => {
    const ta = makeTextarea('你好世界', 0, 2)
    const updateDocContent = vi.fn()
    const { result } = renderHook(() =>
      useAiSelectionAction({
        textareaRef: { current: ta },
        updateDocContent,
        activeDocId: 'd1',
        enabled: true,
      }),
    )
    act(() => {
      result.current.open()
    })
    act(() => {
      result.current.apply('您好')
    })
    expect(updateDocContent).toHaveBeenCalledWith({ content: '您好世界' })
    // rAF 在 setup 里被替换为 setTimeout(0)
    await vi.waitFor(() => {
      expect(ta.selectionStart).toBe(2)
    })
  })
})

describe('富文本内核（默认）', () => {
  // '# 标题\n选中的文字与后续'：'#'=0 ' '=1 标=2 题=3 \n=4 → '选中的文字' 位于 [5,10)
  it('textareaRef 为 null 时经 richEditorRef 端口捕获选区', () => {
    const port = makeRichPort({ start: 5, end: 10 })
    const updateDocContent = vi.fn()
    const { result } = renderHook(() =>
      useAiSelectionAction({
        textareaRef: { current: null },
        richEditorRef: { current: port },
        getRichContent: () => '# 标题\n选中的文字与后续',
        updateDocContent,
        activeDocId: 'd1',
        enabled: true,
      }),
    )
    let opened = false
    act(() => {
      opened = result.current.open()
    })
    expect(opened).toBe(true)
    expect(result.current.selection).toMatchObject({ start: 5, end: 10, text: '选中的文字' })
  })

  it('富文本无选区时同样 toast 提示（旧实现这里是静默 return false）', () => {
    const port = makeRichPort({ start: 2, end: 2 })
    const { messages, unsubscribe } = collectToasts()
    try {
      const { result } = renderHook(() =>
        useAiSelectionAction({
          textareaRef: { current: null },
          richEditorRef: { current: port },
          getRichContent: () => '内容',
          updateDocContent: vi.fn(),
          enabled: true,
        }),
      )
      let opened = true
      act(() => {
        opened = result.current.open()
      })
      expect(opened).toBe(false)
      expect(messages.some(m => m.message.includes('选中'))).toBe(true)
    } finally {
      unsubscribe()
    }
  })

  it('apply 按 Markdown 偏移替换并经 selectRange 恢复光标', async () => {
    const port = makeRichPort({ start: 5, end: 10 })
    const updateDocContent = vi.fn()
    const { result } = renderHook(() =>
      useAiSelectionAction({
        textareaRef: { current: null },
        richEditorRef: { current: port },
        getRichContent: () => '# 标题\n选中的文字与后续',
        updateDocContent,
        activeDocId: 'd1',
        enabled: true,
      }),
    )
    act(() => {
      result.current.open()
    })
    act(() => {
      result.current.apply('改写后')
    })
    expect(updateDocContent).toHaveBeenCalledWith({ content: '# 标题\n改写后与后续' })
    await vi.waitFor(() => {
      expect(port.focus).toHaveBeenCalled()
      // 光标落在替换文本末尾：5 + '改写后'.length(3) = 8
      expect(port.selectRange).toHaveBeenCalledWith(8, 8)
    })
  })

  it('快照失配（弹窗期间文档被改写）时降级为当前选区', () => {
    const port = makeRichPort({ start: 0, end: 2 })
    let content = '原文内容'
    const updateDocContent = vi.fn()
    const { result } = renderHook(() =>
      useAiSelectionAction({
        textareaRef: { current: null },
        richEditorRef: { current: port },
        getRichContent: () => content,
        updateDocContent,
        activeDocId: 'd1',
        enabled: true,
      }),
    )
    act(() => {
      result.current.open()
    })
    // 文档被草稿恢复等流程改写：原快照 [0,2)='原文' 不再匹配
    content = '完全不同的新内容'
    port.getSelectionRange = () => ({ start: 5, end: 7 })
    act(() => {
      result.current.apply('替换')
    })
    // 用当前选区 [5,7)（='新内'）而非过期快照：'完全不同的' + '替换' + '容'
    expect(updateDocContent).toHaveBeenCalledWith({ content: '完全不同的替换容' })
  })

  it('两个内核都不可用时给出提示而不是静默无反应', () => {
    const { messages, unsubscribe } = collectToasts()
    try {
      const { result } = renderHook(() =>
        useAiSelectionAction({
          textareaRef: { current: null },
          updateDocContent: vi.fn(),
          enabled: true,
        }),
      )
      let opened = true
      act(() => {
        opened = result.current.open()
      })
      expect(opened).toBe(false)
      expect(messages.length).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  })
})

describe('快照失效', () => {
  it('切换文档后 position/selection 归零（避免把结果写进别的文档）', () => {
    const ta = makeTextarea('你好世界', 0, 2)
    const { result, rerender } = renderHook(
      ({ docId }: { docId: string }) =>
        useAiSelectionAction({
          textareaRef: { current: ta },
          updateDocContent: vi.fn(),
          activeDocId: docId,
          enabled: true,
        }),
      { initialProps: { docId: 'd1' } },
    )
    act(() => {
      result.current.open()
    })
    expect(result.current.selection).not.toBeNull()
    rerender({ docId: 'd2' })
    expect(result.current.selection).toBeNull()
    expect(result.current.position).toBeNull()
  })
})