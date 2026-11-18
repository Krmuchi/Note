import { describe, it, expect, beforeEach } from 'vitest'
import { useNotesStore } from '@/store'
import type { OpenTab } from '@/utils/openTabs'

/**
 * 标签页重开栈与方向切换（P1-10）。
 * reopenClosedTab 会校验目标文档真实存在（防幽灵标签），
 * 所以这里必须用 createNotebook/createDoc 造真数据，不能只 setState 空 notebooks。
 */

let nbId = 'nb1'
let d1 = 'd1'
let d2 = 'd2'

const tab = (docId: string): OpenTab => ({ notebookId: nbId, docId })

beforeEach(() => {
  const s = useNotesStore.getState()
  for (const t of [...s.openTabs]) s.closeTab(t)
  useNotesStore.setState({ closedTabs: [], notebooks: [], trash: [], activeNotebookId: '', activeDocId: '' })

  nbId = useNotesStore.getState().createNotebook('标签测试库')
  d1 = useNotesStore.getState().createDoc(nbId, null, { title: '文档一' }) as string
  d2 = useNotesStore.getState().createDoc(nbId, null, { title: '文档二' }) as string
  useNotesStore.setState({ activeNotebookId: nbId, activeDocId: d1 })
  const s2 = useNotesStore.getState()
  s2.openTab(nbId, d1)
  s2.openTab(nbId, d2)
})

describe('tabSlice: cycleTab / reopenClosedTab', () => {
  it('cycleTab next 从当前标签走到下一个', () => {
    // openTabs = [d1, d2]，当前 d1 → next = d2
    expect(useNotesStore.getState().cycleTab('next')?.docId).toBe(d2)
  })

  it('cycleTab prev 从第一个 wrap 到最后一个', () => {
    expect(useNotesStore.getState().cycleTab('prev')?.docId).toBe(d2)
  })

  it('只剩 1 个标签时 cycleTab 返回 null', () => {
    useNotesStore.getState().closeTab(tab(d2))
    expect(useNotesStore.getState().cycleTab('next')).toBeNull()
  })

  it('closeTab 把关闭项压入 closedTabs（去重，最新在最前）', () => {
    const s = useNotesStore.getState()
    s.closeTab(tab(d1))
    s.closeTab(tab(d2))
    s.openTab(nbId, d1)
    s.closeTab(tab(d1))
    const stack = useNotesStore.getState().closedTabs
    expect(stack[0]?.docId).toBe(d1)
    expect(stack.filter((t) => t.docId === d1)).toHaveLength(1)
  })

  it('reopenClosedTab 弹回栈顶并压入 openTabs', () => {
    useNotesStore.getState().closeTab(tab(d2))
    const target = useNotesStore.getState().reopenClosedTab()
    expect(target).toEqual(tab(d2))
    expect(useNotesStore.getState().openTabs.some((t) => t.docId === d2)).toBe(true)
    expect(useNotesStore.getState().closedTabs.some((t) => t.docId === d2)).toBe(false)
  })

  it('栈里的失效文档（已被删除）被跳过而不是重开幽灵标签', () => {
    useNotesStore.setState({ closedTabs: [tab('ghost-doc'), tab(d2)] })
    const target = useNotesStore.getState().reopenClosedTab()
    expect(target).toEqual(tab(d2))
    expect(useNotesStore.getState().closedTabs.some((t) => t.docId === 'ghost-doc')).toBe(false)
  })

  it('栈空时 reopenClosedTab 返回 null', () => {
    useNotesStore.setState({ closedTabs: [] })
    expect(useNotesStore.getState().reopenClosedTab()).toBeNull()
  })
});
