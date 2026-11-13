import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFormatPainter } from '@/hooks/useFormatPainter'
import type { FormatType } from '@/hooks/useEditorFormatting'

/**
 * 格式刷（缺陷5）。
 *
 * 核心回归：复制了多个行内格式后，套用必须**一次算完**。
 * 旧实现 forEach 连调 applyFormat，富文本内核下每次读的都是渲染闭包里的旧内容，
 * 后一个格式整体覆盖前一个 —— 复制"加粗+斜体"刷出去只剩斜体。
 * 提供 applyFormats 时必须走批量接口，且只调用一次。
 */

function setup(activeFormats: Set<string>): {
  result: { current: ReturnType<typeof useFormatPainter> }
  applyFormat: ReturnType<typeof vi.fn>
  applyFormats: ReturnType<typeof vi.fn>
} {
  const applyFormat = vi.fn()
  const applyFormats = vi.fn()
  const { result } = renderHook(() =>
    useFormatPainter({ activeFormats, applyFormat, applyFormats }),
  )
  return { result, applyFormat, applyFormats }
}

describe('useFormatPainter 批量套用（缺陷5）', () => {
  it('复制阶段只捕获行内格式（不含块级标记）', () => {
    const { result, applyFormat, applyFormats } = setup(
      new Set(['bold', 'italic', 'heading1', 'ulist']),
    )
    act(() => result.current.handleFormatPainter())
    expect(result.current.painterFormats).toEqual(['bold', 'italic'])
    expect(applyFormat).not.toHaveBeenCalled()
    expect(applyFormats).not.toHaveBeenCalled()
  })

  it('套用阶段走批量接口且只调用一次（不逐个覆盖）', () => {
    const { result, applyFormat, applyFormats } = setup(new Set(['bold', 'italic']))
    act(() => result.current.handleFormatPainter())   // 复制
    act(() => result.current.handleFormatPainter())   // 套用
    expect(applyFormats).toHaveBeenCalledTimes(1)
    expect(applyFormats).toHaveBeenCalledWith(['bold', 'italic'])
    // 关键：不能再逐个调用 applyFormat（那正是覆盖的根因）
    expect(applyFormat).not.toHaveBeenCalled()
    expect(result.current.painterFormats).toBeNull()
  })

  it('未提供批量接口时回退到逐个 applyFormat（旧内核兼容）', () => {
    const applyFormat = vi.fn()
    const { result } = renderHook(() =>
      useFormatPainter({ activeFormats: new Set(['bold', 'strike']), applyFormat }),
    )
    act(() => result.current.handleFormatPainter())
    act(() => result.current.handleFormatPainter())
    expect(applyFormat).toHaveBeenCalledTimes(2)
    expect(applyFormat).toHaveBeenNthCalledWith(1, 'bold' as FormatType)
    expect(applyFormat).toHaveBeenNthCalledWith(2, 'strike' as FormatType)
  })

  it('Esc 取消待应用的格式（不触发任何套用）', () => {
    const { result, applyFormat, applyFormats } = setup(new Set(['bold']))
    act(() => result.current.handleFormatPainter())
    act(() => result.current.cancelFormatPainter())
    expect(result.current.painterFormats).toBeNull()
    act(() => result.current.handleFormatPainter())   // 变成"复制"而非"套用"
    expect(applyFormat).not.toHaveBeenCalled()
    expect(applyFormats).not.toHaveBeenCalled()
  })

  it('无行内格式可复制时套用为空操作（不报错）', () => {
    const { result, applyFormats } = setup(new Set(['heading1']))
    act(() => result.current.handleFormatPainter())
    expect(result.current.painterFormats).toEqual([])
    act(() => result.current.handleFormatPainter())
    expect(applyFormats).toHaveBeenCalledWith([])
  })
})