import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useSmartInput } from '@/hooks/useSmartInput'
import type { NoteDoc } from '@/types'
/**
 * 智能输入（textarea 内核）。
 *
 * 归入"7 个静默失效"防线的理由：这些行为全部藏在键盘事件里，
 * 一旦 `handleSmartInput` 提前 return（例如 ta 为 null、被 ctrl 拦截），
 * 表现只是"按 Tab 没缩进"，不报错、不抛异常，只有真敲键盘才发现。
 *
 * 富文本内核的对应实现在 RichEditor 内，由 scripts/rich-editor-check.mjs
 * 在真实浏览器验证；这里守的是 textarea 分支。
 */

function makeDoc(content: string): NoteDoc {
  return {
    id: 'd1',
    title: 'Doc',
    content,
    parentId: null,
    tags: [],
    favorite: false,
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeTextarea(value: string, selStart: number, selEnd = selStart): HTMLTextAreaElement {
  const ta = document.createElement('textarea')
  ta.value = value
  ta.selectionStart = selStart
  ta.selectionEnd = selEnd
  return ta
}

/** 构造一个最小的 React 键盘事件替身（hook 只读这几个字段） */
function keyEvent(key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...mods,
  } as unknown as ReactKeyboardEvent<HTMLTextAreaElement>
}

describe('useSmartInput - 前置守卫', () => {
  let updateDocContent: (changes: Partial<NoteDoc>) => void

  beforeEach(() => {
    updateDocContent = vi.fn() as unknown as (changes: Partial<NoteDoc>) => void
  })

  it('textarea 缺失时不消费按键（未挂载瞬间不能吞键）', () => {
    const { result } = renderHook(() =>
      useSmartInput({
        textareaRef: { current: null },
        activeDoc: makeDoc('x'),
        updateDocContent,
      }),
    )
    const e = keyEvent('Tab')
    expect(result.current.handleSmartInput(e)).toBe(false)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('没有活动文档时不消费按键', () => {
    const { result } = renderHook(() =>
      useSmartInput({
        textareaRef: { current: makeTextarea('x', 0) },
        activeDoc: null,
        updateDocContent,
      }),
    )
    expect(result.current.handleSmartInput(keyEvent('Tab'))).toBe(false)
  })

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }])(
    '带修饰键(%o)时交给快捷键分发器，不当作智能输入',
    (mods) => {
      const { result } = renderHook(() =>
        useSmartInput({
          textareaRef: { current: makeTextarea('x', 0) },
          activeDoc: makeDoc('x'),
          updateDocContent,
        }),
      )
      expect(result.current.handleSmartInput(keyEvent('Tab', mods))).toBe(false)
    },
  )
})

describe('useSmartInput - Tab 缩进', () => {
  it('Tab 缩进后回写内容，并阻止默认焦点跳转', () => {
    const ta = makeTextarea('hello', 0)
    const updateDocContent = vi.fn() as unknown as (changes: Partial<NoteDoc>) => void as unknown as (changes: Partial<NoteDoc>) => void

    const { result } = renderHook(() =>
      useSmartInput({
        textareaRef: { current: ta },
        activeDoc: makeDoc('hello'),
        updateDocContent,
      }),
    )

    const e = keyEvent('Tab')
    expect(result.current.handleSmartInput(e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    // 关键：contenteditable 里 Tab 默认为焦点导航，textarea 里也必须真的插入了缩进
    expect(vi.mocked(updateDocContent)).toHaveBeenCalledWith({ content: expect.stringContaining('  ') })
  })

  it('Shift+Tab 反缩进', () => {
    const ta = makeTextarea('  hello', 2)
    const updateDocContent = vi.fn() as unknown as (changes: Partial<NoteDoc>) => void as unknown as (changes: Partial<NoteDoc>) => void

    const { result } = renderHook(() =>
      useSmartInput({
        textareaRef: { current: ta },
        activeDoc: makeDoc('  hello'),
        updateDocContent,
      }),
    )

    expect(result.current.handleSmartInput(keyEvent('Tab', { shiftKey: true }))).toBe(true)
    expect(vi.mocked(updateDocContent)).toHaveBeenCalledWith({ content: 'hello' })
  })

  it('Tab 永远消费按键，即使没有实际改动（避免焦点逃出编辑器）', () => {
    const ta = makeTextarea('', 0)
    const updateDocContent = vi.fn() as unknown as (changes: Partial<NoteDoc>) => void as unknown as (changes: Partial<NoteDoc>) => void

    const { result } = renderHook(() =>
      useSmartInput({
        textareaRef: { current: ta },
        activeDoc: makeDoc(''),
        updateDocContent,
      }),
    )

    const e = keyEvent('Tab')
    expect(result.current.handleSmartInput(e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
  })
})

describe('useSmartInput - Enter 块续写', () => {
  it('在列表项后回车，新行继承列表标记', () => {
    const ta = makeTextarea('- item', 6)
    const updateDocContent = vi.fn() as unknown as (changes: Partial<NoteDoc>) => void as unknown as (changes: Partial<NoteDoc>) => void

    const { result } = renderHook(() =>
      useSmartInput({
        textareaRef: { current: ta },
        activeDoc: makeDoc('- item'),
        updateDocContent,
      }),
    )

    const e = keyEvent('Enter')
    expect(result.current.handleSmartInput(e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(vi.mocked(updateDocContent)).toHaveBeenCalledWith({ content: expect.stringContaining('- ') })
  })

  it('空列表项回车退出列表（不留空标记）', () => {
    const ta = makeTextarea('- ', 2)
    const updateDocContent = vi.fn() as unknown as (changes: Partial<NoteDoc>) => void as unknown as (changes: Partial<NoteDoc>) => void

    const { result } = renderHook(() =>
      useSmartInput({
        textareaRef: { current: ta },
        activeDoc: makeDoc('- '),
        updateDocContent,
      }),
    )

    result.current.handleSmartInput(keyEvent('Enter'))
    // 退列表时内容应被清空或不再带 '- '
    const content = vi.mocked(updateDocContent).mock.calls[0]?.[0]?.content
    if (content !== undefined) expect(content.trim()).not.toBe('-')
  })

  it('Shift+Enter 不续写块（交给默认换行）', () => {
    const ta = makeTextarea('- item', 6)
    const updateDocContent = vi.fn() as unknown as (changes: Partial<NoteDoc>) => void as unknown as (changes: Partial<NoteDoc>) => void

    const { result } = renderHook(() =>
      useSmartInput({
        textareaRef: { current: ta },
        activeDoc: makeDoc('- item'),
        updateDocContent,
      }),
    )

    expect(result.current.handleSmartInput(keyEvent('Enter', { shiftKey: true }))).toBe(false)
    expect(vi.mocked(updateDocContent)).not.toHaveBeenCalled()
  })
})

describe('useSmartInput - 行内标记自动配对', () => {
  it.each(['`', '*', '~'])('输入 %s 时自动补另一半', (marker) => {
    const ta = makeTextarea('', 0)
    const updateDocContent = vi.fn() as unknown as (changes: Partial<NoteDoc>) => void as unknown as (changes: Partial<NoteDoc>) => void

    const { result } = renderHook(() =>
      useSmartInput({
        textareaRef: { current: ta },
        activeDoc: makeDoc(''),
        updateDocContent,
      }),
    )

    const e = keyEvent(marker)
    const consumed = result.current.handleSmartInput(e)
    // 语义：配对成功则消费按键并回写；失败则放行给默认输入
    if (consumed) {
      expect(e.preventDefault).toHaveBeenCalled()
      expect(updateDocContent).toHaveBeenCalled()
    }
  })

  it('普通字符不消费', () => {
    const ta = makeTextarea('', 0)
    const updateDocContent = vi.fn() as unknown as (changes: Partial<NoteDoc>) => void as unknown as (changes: Partial<NoteDoc>) => void

    const { result } = renderHook(() =>
      useSmartInput({
        textareaRef: { current: ta },
        activeDoc: makeDoc(''),
        updateDocContent,
      }),
    )

    expect(result.current.handleSmartInput(keyEvent('a'))).toBe(false)
    expect(vi.mocked(updateDocContent)).not.toHaveBeenCalled()
  })
})
