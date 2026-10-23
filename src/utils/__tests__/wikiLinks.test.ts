import { describe, it, expect } from 'vitest'
import {
  buildBacklinkIndex,
  collectBacklinks,
  getDocWikiTitles,
  parseWikiLinks,
  resolveWikiLink,
} from '@/utils/wikiLinks'
import type { NoteDoc, Notebook } from '@/types'

const doc = (over: Partial<NoteDoc> & { id: string; title: string }): NoteDoc => ({
  content: '',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('parseWikiLinks', () => {
  it('提取全部标题并去重、保持顺序', () => {
    expect(parseWikiLinks('见 [[项目计划]] 与 [[会议纪要]]，还有 [[项目计划]]')).toEqual([
      '项目计划',
      '会议纪要',
    ])
  })

  it('去掉标题两侧空白，忽略空标题', () => {
    expect(parseWikiLinks('[[  带空格  ]][[]][[   ]]')).toEqual(['带空格'])
  })

  it('不跨行匹配（避免把整段吞进去）', () => {
    expect(parseWikiLinks('[[第一行\n第二行]]')).toEqual([])
  })

  it('没有双链时返回空数组，且不做多余扫描', () => {
    expect(parseWikiLinks('普通正文')).toEqual([])
    expect(parseWikiLinks('')).toEqual([])
  })
})

describe('resolveWikiLink', () => {
  const docs = [doc({ id: 'a', title: '项目计划' }), doc({ id: 'b', title: 'Meeting Notes' })]

  it('精确匹配优先', () => {
    expect(resolveWikiLink('项目计划', docs)?.id).toBe('a')
  })

  it('退回不区分大小写匹配', () => {
    expect(resolveWikiLink('meeting notes', docs)?.id).toBe('b')
  })

  it('找不到时返回 null（未创建的引用不该报错）', () => {
    expect(resolveWikiLink('还不存在', docs)).toBeNull()
    expect(resolveWikiLink('   ', docs)).toBeNull()
  })
})

describe('反向链接', () => {
  const notebooks: Notebook[] = [
    {
      id: 'nb1',
      title: '工作',
      docs: [
        doc({ id: 'target', title: '项目计划' }),
        doc({ id: 'src1', title: '周报', content: '本周进展见 [[项目计划]]' }),
      ],
    },
    {
      id: 'nb2',
      title: '个人',
      docs: [doc({ id: 'src2', title: '待办', content: '- [[项目计划]] 要更新' })],
    },
  ]

  it('跨知识库收集引用方', () => {
    const refs = collectBacklinks(notebooks, 'target')
    expect(refs.map((r) => r.docId).sort()).toEqual(['src1', 'src2'])
    expect(refs[0].notebookId).toBeTruthy()
  })

  it('没有引用时返回空数组', () => {
    expect(collectBacklinks(notebooks, 'src1')).toEqual([])
    expect(collectBacklinks(notebooks, '')).toEqual([])
  })

  it('自己引用自己不算反向链接', () => {
    const selfRef: Notebook[] = [
      { id: 'nb', title: '库', docs: [doc({ id: 'x', title: '自引用', content: '看 [[自引用]]' })] },
    ]
    expect(collectBacklinks(selfRef, 'x')).toEqual([])
  })

  it('指向不存在文档的引用不会产生反向链接', () => {
    const dangling: Notebook[] = [
      { id: 'nb', title: '库', docs: [doc({ id: 'x', title: 'X', content: '见 [[还没写]]' })] },
    ]
    expect(buildBacklinkIndex(dangling).size).toBe(0)
  })

  it('标题解析带缓存：同一文档内容未变时不重复解析', () => {
    const target = doc({ id: 'c', title: 'C', content: '[[A]]' })
    const first = getDocWikiTitles(target)
    const second = getDocWikiTitles(target)
    expect(second).toBe(first)
  })

  it('文档内容变化后会重新解析', () => {
    const target = doc({ id: 'd', title: 'D', content: '[[A]]', updatedAt: '2026-01-01T00:00:00.000Z' })
    expect(getDocWikiTitles(target)).toEqual(['A'])
    const updated = { ...target, content: '[[B]]', updatedAt: '2026-02-01T00:00:00.000Z' }
    expect(getDocWikiTitles(updated)).toEqual(['B'])
  })
})
