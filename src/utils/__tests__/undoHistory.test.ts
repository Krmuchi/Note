import { describe, it, expect } from 'vitest'
import { extractInsertedText, isHistoryBoundaryChar, shouldStartNewHistory } from '@/utils/undoHistory'

/**
 * 撤销历史的合并策略。
 *
 * 背景：旧实现只有一个固定 1 秒窗口 —— 持续打字会把整段输入合并成**一次**撤销，
 * 一次 Ctrl+Z 回退好几个句子。这里锁定修复后的三条规则：停顿分界、句子边界分界、
 * 以及"删除不开启新历史"（否则撤销删除会变成撤销整段编辑）。
 */

describe('isHistoryBoundaryChar', () => {
  it('中英文标点与空白算句子边界', () => {
    for (const ch of [' ', '\n', '.', '。', '，', '!', '？', '、', '；']) {
      expect(isHistoryBoundaryChar(ch), ch).toBe(true)
    }
  })

  it('普通字符不算边界', () => {
    for (const ch of ['a', '字', '9', '-']) {
      expect(isHistoryBoundaryChar(ch), ch).toBe(false)
    }
  })

  it('空值不算边界（避免 undefined 抛错）', () => {
    expect(isHistoryBoundaryChar(undefined)).toBe(false)
    expect(isHistoryBoundaryChar('')).toBe(false)
  })
})

describe('shouldStartNewHistory', () => {
  const base = { mergeWindow: 1000, now: 10_000 }

  it('还没有历史时必须开启一条', () => {
    expect(shouldStartNewHistory({ ...base, lastHistoryAt: 0 })).toBe(true)
  })

  it('停顿超过窗口时开启新历史', () => {
    expect(shouldStartNewHistory({ ...base, lastHistoryAt: 8_500 })).toBe(true)
  })

  it('窗口内连续输入同一句话时不开启（避免逐字压栈）', () => {
    expect(
      shouldStartNewHistory({ ...base, lastHistoryAt: 9_500, insertedText: '常' }),
    ).toBe(false)
  })

  it('窗口内但刚输入了句号时开启，让"逐句撤销"成立', () => {
    expect(
      shouldStartNewHistory({ ...base, lastHistoryAt: 9_500, insertedText: '好。' }),
    ).toBe(true)
  })

  it('刚输入空格也算边界', () => {
    expect(
      shouldStartNewHistory({ ...base, lastHistoryAt: 9_500, insertedText: 'word ' }),
    ).toBe(true)
  })

  it('删除不开启新历史（否则撤销删除会跳掉整段编辑）', () => {
    // insertedText 为空代表本次是删除
    expect(
      shouldStartNewHistory({ ...base, lastHistoryAt: 9_500, insertedText: '' }),
    ).toBe(false)
  })
})

describe('extractInsertedText', () => {
  it('取出行中插入的片段', () => {
    expect(extractInsertedText('abc', 'abXc')).toBe('X')
  })

  it('末尾追加', () => {
    expect(extractInsertedText('abc', 'abc好。')).toBe('好。')
  })

  it('纯删除返回空串（用于区分"删"与"增"）', () => {
    expect(extractInsertedText('abcdef', 'abc')).toBe('')
    expect(extractInsertedText('abc', 'abXc').length).toBe(1)
  })

  it('内容未变返回空串', () => {
    expect(extractInsertedText('abc', 'abc')).toBe('')
  })

  it('中间替换能取到新片段', () => {
    // 把 "b" 换成 "XY"
    expect(extractInsertedText('abc', 'aXYc')).toBe('XY')
  })
})
