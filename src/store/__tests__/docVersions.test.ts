import { describe, it, expect } from 'vitest'
import {
  AUTO_VERSION_MERGE_WINDOW_MS,
  LARGE_DOC_THRESHOLD,
  MAX_VERSIONS,
  MAX_VERSIONS_LARGE_DOC,
  VERSION_BUDGET_BYTES_PER_DOC,
  commitVersions,
  createVersion,
  pushAutoVersion,
} from '@/store/docVersions'
import type { DocVersion, NoteDoc } from '@/types'

function makeDoc(content = 'hello'): NoteDoc {
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
    versions: [],
  }
}

function makeVersion(overrides: Partial<DocVersion> & Pick<DocVersion, 'type'>): DocVersion {
  return {
    id: `v-${Math.random().toString(16).slice(2)}`,
    docId: 'd1',
    notebookId: 'nb1',
    title: 'Doc',
    content: 'x',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('commitVersions - 条数上限', () => {
  it('普通文档最多保留 MAX_VERSIONS 份', () => {
    const doc = makeDoc()
    const many = Array.from({ length: 120 }, () => makeVersion({ type: 'auto' }))
    commitVersions(doc, many)
    expect(doc.versions).toHaveLength(MAX_VERSIONS)
  })

  it('大文档收紧到 MAX_VERSIONS_LARGE_DOC 份', () => {
    const doc = makeDoc('x'.repeat(LARGE_DOC_THRESHOLD + 1))
    const many = Array.from({ length: 40 }, () => makeVersion({ type: 'auto' }))
    commitVersions(doc, many)
    expect(doc.versions!.length).toBeLessThanOrEqual(MAX_VERSIONS_LARGE_DOC)
  })

  it('手动版本优先保留，不被自动版本挤掉', () => {
    const doc = makeDoc()
    const auto = Array.from({ length: 60 }, () => makeVersion({ type: 'auto' }))
    const manual = Array.from({ length: 3 }, (_, i) =>
      makeVersion({ type: 'manual', versionTag: `m${i}` }),
    )
    // 手动版本排在很后面（模拟"很旧的定版"）
    commitVersions(doc, [...auto, ...manual])
    const kept = doc.versions!.filter(v => v.type === 'manual')
    expect(kept).toHaveLength(3)
  })
})

describe('commitVersions - 字节预算', () => {
  it('大正文的连续快照不会累积超过预算', () => {
    // 200KB 正文（每份快照估算 600KB），8MB 预算下最多十几份
    const doc = makeDoc('a'.repeat(200_000))
    const many = Array.from({ length: 50 }, () =>
      makeVersion({ type: 'auto', content: 'a'.repeat(200_000) }),
    )
    commitVersions(doc, many)

    const total = doc.versions!.reduce((sum, v) => sum + (v.content?.length ?? 0) * 3, 0)
    expect(total).toBeLessThanOrEqual(VERSION_BUDGET_BYTES_PER_DOC)
    // 至少保留一份，否则版本历史直接消失
    expect(doc.versions!.length).toBeGreaterThan(0)
  })

  it('至少保留一份，即使单份就超预算', () => {
    const doc = makeDoc()
    const huge = makeVersion({ type: 'manual', content: 'a'.repeat(VERSION_BUDGET_BYTES_PER_DOC) })
    commitVersions(doc, [huge])
    expect(doc.versions).toHaveLength(1)
  })
})

describe('pushAutoVersion', () => {
  it('30s 窗口内的连续编辑合并为一份', () => {
    const doc = makeDoc()
    pushAutoVersion(doc, 'nb1', { content: 'first' })
    expect(doc.versions).toHaveLength(1)
    pushAutoVersion(doc, 'nb1', { content: 'second' })
    expect(doc.versions).toHaveLength(1)
  })

  it('超过合并窗口后新建一份', () => {
    const doc = makeDoc()
    pushAutoVersion(doc, 'nb1', { content: 'first' })

    // 把已有快照时间推到窗口之外
    const stale = new Date(Date.now() - AUTO_VERSION_MERGE_WINDOW_MS - 1000).toISOString()
    doc.versions![0].createdAt = stale

    pushAutoVersion(doc, 'nb1', { content: 'second' })
    expect(doc.versions).toHaveLength(2)
    expect(doc.versions![0].content).toBe('second')
  })

  it('content 缺失时不抛 TypeError（脏数据防线）', () => {
    const doc = makeDoc()
    // 模拟备份导入 / 草稿恢复里 content 缺失的文档
    delete (doc as Partial<NoteDoc>).content
    expect(() => pushAutoVersion(doc, 'nb1', { title: 'only title' })).not.toThrow()
    expect(doc.versions).toHaveLength(1)
  })
})

describe('createVersion', () => {
  it('默认取文档当前内容与标题', () => {
    const doc = makeDoc('current body')
    const v = createVersion(doc, 'nb1', { type: 'manual' })
    expect(v.content).toBe('current body')
    expect(v.title).toBe('Doc')
    expect(v.notebookId).toBe('nb1')
    expect(v.docId).toBe('d1')
  })

  it('overrides 覆盖默认值', () => {
    const doc = makeDoc()
    const v = createVersion(doc, 'nb1', { type: 'auto', content: 'snapshot', title: 'T' })
    expect(v.content).toBe('snapshot')
    expect(v.title).toBe('T')
  })
})
