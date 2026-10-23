import { describe, it, expect } from 'vitest'
import { getCursorPosition } from '@/components/editor/cursorPosition'

/**
 * 状态栏光标行列计算。
 *
 * 这里锁两件事：
 * 1. 行列数值必须正确（含首行、末行、行首、行尾等边界）；
 * 2. 换行位置缓存必须以**内容本身**为键 —— 旧实现曾按 `text.length` 判断失效，
 *    等长替换（如把 "ab" 改成 "cd"）会读到过期缓存，行列显示错误。
 */

describe('getCursorPosition', () => {
  const text = '第一行\n第二行\n第三行'

  it('空文本返回 1 行 1 列', () => {
    expect(getCursorPosition('', 0)).toEqual({ line: 1, column: 1 })
  })

  it('文本开头是 1 行 1 列', () => {
    expect(getCursorPosition(text, 0)).toEqual({ line: 1, column: 1 })
  })

  it('首行行尾', () => {
    // '第一行' 是 3 个字符，光标在第 3 位 → 第 1 行第 4 列
    expect(getCursorPosition(text, 3)).toEqual({ line: 1, column: 4 })
  })

  it('第二行行首（紧跟换行之后）', () => {
    // 换行在下标 3，光标 4 → 第 2 行第 1 列
    expect(getCursorPosition(text, 4)).toEqual({ line: 2, column: 1 })
  })

  it('第二行中间', () => {
    expect(getCursorPosition(text, 6)).toEqual({ line: 2, column: 3 })
  })

  it('第三行行首', () => {
    // '第一行\n' = 4，'第二行\n' = 4，共 8
    expect(getCursorPosition(text, 8)).toEqual({ line: 3, column: 1 })
  })

  it('末行行尾', () => {
    expect(getCursorPosition(text, text.length)).toEqual({ line: 3, column: 4 })
  })

  it('越界位置收敛到文本末尾（不返回 NaN / 负数）', () => {
    expect(getCursorPosition(text, text.length + 100)).toEqual({ line: 3, column: 4 })
  })

  it('负数位置收敛到开头', () => {
    expect(getCursorPosition(text, -5)).toEqual({ line: 1, column: 1 })
  })

  it('等长替换后行列仍然正确（缓存不能按长度失效）', () => {
    // 先算一次，让缓存里存下 "aaa\nbbb"
    expect(getCursorPosition('aaa\nbbb', 3)).toEqual({ line: 1, column: 4 })

    // 换成等长的另一段内容：换行位置不同（这里换行在更靠前的位置）
    // 若缓存按 length 判断，会错误地沿用上一份结果
    expect(getCursorPosition('aa\nbbbb', 3)).toEqual({ line: 2, column: 1 })
  })

  it('纯粹是换行的文本', () => {
    expect(getCursorPosition('\n\n', 2)).toEqual({ line: 3, column: 1 })
  })
})
