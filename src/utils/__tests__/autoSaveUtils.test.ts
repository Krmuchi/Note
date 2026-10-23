import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveDraft, loadLatestDraft, clearDrafts } from '@/utils/autoSaveUtils'
import type { AppStore, NoteDoc, Notebook } from '@/types'

/**
 * 草稿快照（崩溃恢复用）的行为契约。
 *
 * 背景：localStorage 配额通常只有 5–10MB，超限时**抛异常**而不是截断。旧实现每次把
 * 整个库（含每篇最多 50 份全量版本快照）写进去，实测 200 篇 20KB 文档即有约 195MB ——
 * 每次写入都失败并被 catch 吞掉，草稿从功能上完全失效。
 * 这里锁定修复后的关键性质：草稿必须瘦身、必须可写、必须保留正文。
 */

const DRAFT_KEY = 'notes-autosave-draft'

const makeDoc = (id: string, contentSize: number, versionCount: number): NoteDoc => {
  const content = 'x'.repeat(contentSize)
  return {
    id,
    title: '文档 ' + id,
    content,
    parentId: null,
    tags: [],
    favorite: false,
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    versions: Array.from({ length: versionCount }, (_, i) => ({
      id: 'v' + i,
      docId: id,
      notebookId: 'nb1',
      title: '文档 ' + id,
      content,
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      type: 'auto' as const,
    })),
    comments: [],
    shareLinks: [],
  }
}

const makeStore = (docs: NoteDoc[]): AppStore => ({
  notebooks: [{ id: 'nb1', title: '库', docs }] as Notebook[],
  trash: [],
  tags: [],
  searchHistory: [],
})

const draftBytes = (): number => localStorage.getItem(DRAFT_KEY)?.length ?? 0

beforeEach(() => {
  localStorage.clear()
})

describe('草稿快照', () => {
  it('体积远小于全量库：版本快照不写入草稿', () => {
    // 3 篇 20KB 文档、每篇 50 份全量版本 ≈ 3MB 全量；瘦身后应接近正文本身
    const store = makeStore([
      makeDoc('d1', 20_000, 50),
      makeDoc('d2', 20_000, 50),
      makeDoc('d3', 20_000, 50),
    ])

    saveDraft(store, '文档 d1')

    const raw = localStorage.getItem(DRAFT_KEY)
    expect(raw).not.toBeNull()

    const saved = JSON.parse(raw!)
    const savedDoc = saved.data.notebooks[0].docs[0]
    // 版本快照被剔除
    expect(savedDoc.versions).toBeUndefined()
    // 但正文必须保留 —— 崩溃恢复要救的就是它
    expect(savedDoc.content).toHaveLength(20_000)
    expect(savedDoc.title).toBe('文档 d1')
  })

  it('始终低于 2MB 上限，保证写得进 localStorage（超大库退化到只救当前文档）', () => {
    const docs = Array.from({ length: 200 }, (_, i) => makeDoc('d' + i, 20_000, 50))
    // 正文总量约 4MB，本身就超过草稿上限：必须退化，而不是放弃写入
    saveDraft({ ...makeStore(docs), activeDocId: 'd7' }, 'x')

    const bytes = draftBytes()
    expect(bytes).toBeGreaterThan(0)
    expect(bytes).toBeLessThan(2 * 1024 * 1024)

    // 退化后仍然救回"当前正在写的那一篇"
    const draft = loadLatestDraft()
    expect(draft!.data.notebooks[0].docs).toHaveLength(1)
    expect(draft!.data.notebooks[0].docs[0].id).toBe('d7')
  })

  it('可以正常读回，且保留活动文档标题', () => {
    saveDraft(makeStore([makeDoc('d1', 100, 3)]), '我的标题')

    const draft = loadLatestDraft()
    expect(draft).not.toBeNull()
    expect(draft!.meta.docTitle).toBe('我的标题')
    expect(draft!.data.notebooks[0].docs[0].content).toHaveLength(100)
  })

  it('localStorage 写入失败时不抛错（草稿是尽力而为的兜底）', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => saveDraft(makeStore([makeDoc('d1', 10, 1)]), 't')).not.toThrow()

    spy.mockRestore()
  })

  it('clearDrafts 同时清掉旧版遗留索引键', () => {
    localStorage.setItem(DRAFT_KEY, '{}')
    localStorage.setItem('notes-autosave-meta', '{}')

    clearDrafts()

    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(localStorage.getItem('notes-autosave-meta')).toBeNull()
  })
})
