import { describe, it, expect, beforeEach } from 'vitest'
import { useNotesStore } from '@/store'
import type { NoteDoc, Notebook } from '@/types'

/**
 * 手动保存版本（"把这一刻定住"）。
 *
 * 自动快照是 30 秒合并的，用户想标记"改到这里为止"时此前没有入口。
 * 这里锁定三条契约：手动版本带 manual 类型与标签、排在最前、且不会被自动快照挤掉。
 */

const doc = (over: Partial<NoteDoc> & { id: string; title: string }): NoteDoc => ({
  content: '',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  versions: [],
  ...over,
})

const notebook = (docs: NoteDoc[]): Notebook => ({ id: 'nb1', title: '库', docs })

beforeEach(() => {
  useNotesStore.setState({
    notebooks: [notebook([doc({ id: 'd1', title: '文档', content: '正文内容' })])],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'd1',
  })
})

const versionsOf = (): NonNullable<NoteDoc['versions']> =>
  useNotesStore.getState().notebooks[0].docs[0].versions ?? []

describe('手动保存版本', () => {
  it('把当前内容存成一个 manual 版本并返回 id', () => {
    const id = useNotesStore.getState().createVersionSnapshot('nb1', 'd1', { tag: '手动保存' })

    expect(id).toBeTruthy()
    const versions = versionsOf()
    expect(versions).toHaveLength(1)
    expect(versions[0].id).toBe(id)
    expect(versions[0].type).toBe('manual')
    expect(versions[0].versionTag).toBe('手动保存')
    expect(versions[0].content).toBe('正文内容')
  })

  it('文档不存在时返回 null（不写入任何东西）', () => {
    const id = useNotesStore.getState().createVersionSnapshot('nb1', 'missing')
    expect(id).toBeNull()
    expect(versionsOf()).toHaveLength(0)
  })

  it('支持附带备注', () => {
    useNotesStore.getState().createVersionSnapshot('nb1', 'd1', { comment: '改完标题之前' })
    expect(versionsOf()[0].comment).toBe('改完标题之前')
  })

  it('新版本排在最前', () => {
    useNotesStore.getState().createVersionSnapshot('nb1', 'd1', { tag: '第一版' })
    useNotesStore.getState().createVersionSnapshot('nb1', 'd1', { tag: '第二版' })

    const versions = versionsOf()
    expect(versions[0].versionTag).toBe('第二版')
    expect(versions[1].versionTag).toBe('第一版')
  })

  it('超过上限时优先保留手动版本，淘汰自动快照', () => {
    // 先塞满 50 份自动快照
    useNotesStore.setState({
      notebooks: [
        notebook([
          doc({
            id: 'd1',
            title: '文档',
            versions: Array.from({ length: 50 }, (_, i) => ({
              id: `auto-${i}`,
              docId: 'd1',
              notebookId: 'nb1',
              title: '文档',
              content: 'x',
              tags: [],
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              type: 'auto' as const,
            })),
          }),
        ]),
      ],
    })

    useNotesStore.getState().createVersionSnapshot('nb1', 'd1', { tag: '重要节点' })

    const versions = versionsOf()
    expect(versions).toHaveLength(50)
    // 手动版本必须在，且仍在最前
    expect(versions[0].versionTag).toBe('重要节点')
    expect(versions.filter(v => v.type === 'manual')).toHaveLength(1)
  })
})
