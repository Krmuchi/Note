import { describe, it, expect, beforeEach } from 'vitest'
import { useNotesStore } from '@/store'
import { filterAndSortDocs } from '@/utils/docSort'
import { buildBacklinkIndex } from '@/utils/wikiLinks'
import { parseWikiLinks } from '@/utils/wikiLinks'
import type { NoteDoc, Notebook } from '@/types'

/**
 * 性能基线（F1/F2/F4）。
 *
 * 目的不是"跑得比谁快"，而是**把已知热路径的耗时钉住**：
 * 搜索、文档树排序、反向链接索引、大文档解析 —— 这四条都是随文档量线性增长、
 * 且跑在用户每次输入路径上的逻辑。阈值取得比实测宽松（3~5 倍），
 * 只拦"数量级变差"，不拦机器抖动。
 */

const DOC_COUNT = 2000
const CONTENT_SIZE = 2000

const makeDoc = (index: number): NoteDoc => {
  const body = ('这是第 ' + index + ' 篇文档的正文。关键词出现在部分文档里。' + '填充内容'.repeat(30)).slice(0, CONTENT_SIZE)
  return {
    id: 'doc-' + index,
    title: index % 7 === 0 ? '关键词标题 ' + index : '普通文档 ' + index,
    content: index % 3 === 0 ? body + ' 关键词' : body,
    parentId: null,
    tags: index % 5 === 0 ? ['tag-1'] : [],
    favorite: false,
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index % 60)).toISOString(),
  }
}

const bigNotebook: Notebook = {
  id: 'nb1',
  title: '压力测试库',
  docs: Array.from({ length: DOC_COUNT }, (_, i) => makeDoc(i)),
}

const time = (label: string, fn: () => void): number => {
  const start = performance.now()
  fn()
  const cost = performance.now() - start
  // eslint-disable-next-line no-console -- 性能基线测试：输出各项耗时便于人工比对阈值
  console.log('[perf] ' + label + ': ' + cost.toFixed(1) + 'ms')
  return cost
}

beforeEach(() => {
  useNotesStore.setState({
    notebooks: [bigNotebook],
    trash: [],
    tags: [{ id: 'tag-1', name: '标签', color: '#f00', icon: '', parentId: null, usageCount: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'doc-0',
  })
})

describe('性能基线', () => {
  it('F4 全库搜索（' + DOC_COUNT + ' 篇 × ' + CONTENT_SIZE + ' 字符）', () => {
    const cost = time('search', () => {
      useNotesStore.getState().search('关键词')
    })
    expect(cost).toBeLessThan(400)
  })

  it('文档树过滤 + 排序（' + DOC_COUNT + ' 篇）', () => {
    const cost = time('filterAndSortDocs', () => {
      filterAndSortDocs(bigNotebook.docs, '', 'updated')
    })
    expect(cost).toBeLessThan(200)
  })

  it('K1 反向链接索引（' + DOC_COUNT + ' 篇，每篇 1 条双链）', () => {
    // 关键：每篇都带一条 [[双链]]，才会真正走到"解析标题 → 找目标文档"这条路径。
    // 不带链接的合成数据测不出 O(链接数 × 文档数) 的问题
    const linked = {
      ...bigNotebook,
      docs: bigNotebook.docs.map((doc, i) => ({
        ...doc,
        content: doc.content + '\n参见 [[普通文档 ' + (((i + 3) * 2) % DOC_COUNT) + ']]',
      })),
    }

    const first = time('buildBacklinkIndex(带双链)', () => {
      buildBacklinkIndex([linked])
    })
    expect(first).toBeLessThan(600)
  })

  it('F2 超大文档解析双链（500KB 单篇）', () => {
    const huge = '# 标题\n\n' + ('正文段落 [[目标文档]] 继续。'.repeat(20000))
    const cost = time('parseWikiLinks(500KB)', () => {
      parseWikiLinks(huge)
    })
    expect(cost).toBeLessThan(200)
  })
})
