import { describe, it, expect } from 'vitest'
import {
  closeTabInList,
  isSameTab,
  MAX_OPEN_TABS,
  openTabInList,
  pickTabAfterClose,
  pruneTabs,
  tabKey,
  type OpenTab,
} from '@/utils/openTabs'
import { useNotesStore } from '@/store'

/**
 * 多标签页逻辑。
 *
 * 契约重点：
 * 1. 重复打开同一篇文档不能产生两个标签（要把已存在的移到末尾）；
 * 2. 关闭当前标签后要切到相邻标签，且**不能切到已经关闭的那一个**；
 * 3. 上限淘汰与失效裁剪不会留下点不开的"幽灵标签"。
 */

const tab = (docId: string, notebookId = 'nb1'): OpenTab => ({ notebookId, docId })

describe('tabKey / isSameTab', () => {
  it('同一文档生成相同 key，跨库同名 id 不混淆', () => {
    expect(tabKey(tab('d1'))).toBe(tabKey(tab('d1')))
    expect(tabKey(tab('d1', 'nbA'))).not.toBe(tabKey(tab('d1', 'nbB')))
  })

  it('isSameTab 同时比较库与文档', () => {
    expect(isSameTab(tab('d1'), tab('d1'))).toBe(true)
    expect(isSameTab(tab('d1', 'nbA'), tab('d1', 'nbB'))).toBe(false)
  })
})

describe('openTabInList', () => {
  it('追加新标签', () => {
    const tabs = openTabInList([], tab('d1'))
    expect(tabs.map((t) => t.docId)).toEqual(['d1'])
  })

  it('重复打开同一篇不新增，而是移到末尾（最近使用）', () => {
    let tabs = openTabInList([], tab('d1'))
    tabs = openTabInList(tabs, tab('d2'))
    tabs = openTabInList(tabs, tab('d3'))
    expect(tabs.map((t) => t.docId)).toEqual(['d1', 'd2', 'd3'])

    tabs = openTabInList(tabs, tab('d1'))
    expect(tabs.map((t) => t.docId)).toEqual(['d2', 'd3', 'd1'])
    expect(tabs).toHaveLength(3)
  })

  it('超过上限时淘汰最旧的标签', () => {
    let tabs: OpenTab[] = []
    for (let i = 0; i < MAX_OPEN_TABS + 3; i++) {
      tabs = openTabInList(tabs, tab('d' + i))
    }
    expect(tabs).toHaveLength(MAX_OPEN_TABS)
    // 最旧的三条被丢弃
    expect(tabs[0].docId).toBe('d3')
    expect(tabs[tabs.length - 1].docId).toBe(`d${MAX_OPEN_TABS + 2}`)
  })

  it('非法输入返回原数组（不写入空标签）', () => {
    const tabs = [tab('d1')]
    expect(openTabInList(tabs, { notebookId: '', docId: 'd1' })).toBe(tabs)
    expect(openTabInList(tabs, { notebookId: 'nb1', docId: '' })).toBe(tabs)
  })
})

describe('closeTabInList', () => {
  it('只移除目标标签', () => {
    const tabs = [tab('d1'), tab('d2'), tab('d3')]
    expect(closeTabInList(tabs, tab('d2')).map((t) => t.docId)).toEqual(['d1', 'd3'])
  })

  it('关闭不存在的标签时原样返回', () => {
    const tabs = [tab('d1')]
    expect(closeTabInList(tabs, tab('nope'))).toHaveLength(1)
  })
})

describe('pickTabAfterClose', () => {
  const tabs = [tab('d1'), tab('d2'), tab('d3')]

  it('关闭当前标签后选"右边"那个接管', () => {
    const remaining = closeTabInList(tabs, tab('d2'))
    expect(pickTabAfterClose(remaining, tab('d2'), tab('d2'))?.docId).toBe('d3')
  })

  it('关闭最后一个标签时选左边那个', () => {
    const remaining = closeTabInList(tabs, tab('d3'))
    expect(pickTabAfterClose(remaining, tab('d3'), tab('d3'))?.docId).toBe('d2')
  })

  it('关闭的不是当前标签时，当前标签保持不变', () => {
    const remaining = closeTabInList(tabs, tab('d1'))
    expect(pickTabAfterClose(remaining, tab('d1'), tab('d2'))?.docId).toBe('d2')
  })

  it('关掉最后一个标签后返回 null（此时不该跳去任何文档）', () => {
    expect(pickTabAfterClose([], tab('d1'), tab('d1'))).toBeNull()
  })
})

describe('pruneTabs', () => {
  it('过滤掉已不存在的文档（避免点出幽灵文档）', () => {
    const tabs = [tab('alive'), tab('deleted')]
    const pruned = pruneTabs(tabs, (_nb, docId) => docId === 'alive')
    expect(pruned.map((t) => t.docId)).toEqual(['alive'])
  })
})

describe('store 集成：setActiveDocId 自动登记标签', () => {
  const seed = (): void => {
    useNotesStore.setState({
      notebooks: [
        {
          id: 'nb1',
          title: '库',
          docs: [
            { id: 'd1', title: 'A', content: '', parentId: null, tags: [], favorite: false, pinned: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
            { id: 'd2', title: 'B', content: '', parentId: null, tags: [], favorite: false, pinned: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
          ],
        },
      ],
      trash: [],
      tags: [],
      searchHistory: [],
      activeNotebookId: 'nb1',
      activeDocId: '',
      openTabs: [],
    })
    localStorage.clear()
  }

  it('切换文档即自动登记标签（所有打开入口都无需单独改）', () => {
    seed()
    useNotesStore.getState().setActiveDocId('d1')
    useNotesStore.getState().setActiveDocId('d2')

    expect(useNotesStore.getState().openTabs.map((t) => t.docId)).toEqual(['d1', 'd2'])
  })

  it('pruneOpenTabs 清掉已删除文档的标签', () => {
    seed()
    useNotesStore.getState().setActiveDocId('d1')
    useNotesStore.getState().setActiveDocId('d2')

    // 删掉 d1
    useNotesStore.setState((state) => ({
      notebooks: [{ ...state.notebooks[0], docs: state.notebooks[0].docs.filter((d) => d.id !== 'd1') }],
    }))
    useNotesStore.getState().pruneOpenTabs()

    expect(useNotesStore.getState().openTabs.map((t) => t.docId)).toEqual(['d2'])
  })
})
