import { describe, it, expect, vi } from 'vitest'
import { resolveTargetNotebookId } from '@/utils/targetNotebook'
import type { Notebook } from '@/types'

/**
 * 新建内容的目标知识库解析（缺陷 9）：
 * 侧栏 + / Ctrl+N / StartPage 共用。空库时必须自动建「我的知识库」，
 * 而不是像旧实现那样静默无操作。
 */

const nb = (id: string): Notebook => ({ id, title: id, docs: [] })

describe('resolveTargetNotebookId', () => {
  it('优先当前激活的知识库', () => {
    const createNotebook = vi.fn(() => 'should-not-be-used')
    const result = resolveTargetNotebookId({
      notebooks: [nb('a'), nb('b')],
      activeNotebookId: 'b',
      createNotebook,
    })
    expect(result).toBe('b')
    expect(createNotebook).not.toHaveBeenCalled()
  })

  it('激活 id 失效时回退到第一个知识库', () => {
    const createNotebook = vi.fn(() => 'should-not-be-used')
    const result = resolveTargetNotebookId({
      notebooks: [nb('a'), nb('b')],
      activeNotebookId: 'ghost',
      createNotebook,
    })
    expect(result).toBe('a')
    expect(createNotebook).not.toHaveBeenCalled()
  })

  it('一个知识库都没有时自动创建「我的知识库」', () => {
    const createNotebook = vi.fn(() => 'created-id')
    const result = resolveTargetNotebookId({
      notebooks: [],
      activeNotebookId: '',
      createNotebook,
    })
    expect(createNotebook).toHaveBeenCalledWith('我的知识库')
    expect(result).toBe('created-id')
  })

  it('创建失败（返回空串）时返回 null，调用方据此中止', () => {
    const createNotebook = vi.fn(() => '')
    const result = resolveTargetNotebookId({
      notebooks: [],
      activeNotebookId: '',
      createNotebook,
    })
    expect(result).toBeNull()
  })
})
