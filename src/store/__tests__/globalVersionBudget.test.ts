import { describe, it, expect } from 'vitest'
import {
  enforceGlobalVersionBudget,
  VERSION_BUDGET_BYTES_TOTAL,
  commitVersions,
  createVersion,
} from '../docVersions'
import type { NoteDoc, Notebook, DocVersion } from '@/types'

function makeDoc(id: string, versions: DocVersion[]): NoteDoc {
  return {
    id,
    title: id,
    content: '',
    parentId: null,
    tags: [],
    favorite: false,
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    versions,
    comments: [],
    shareLinks: [],
  } as NoteDoc
}

function makeVersion(id: string, type: 'auto' | 'manual', createdAt: string, chars: number): DocVersion {
  return {
    id,
    docId: 'doc',
    notebookId: 'nb',
    title: '',
    content: 'x'.repeat(chars),
    tags: [],
    createdAt,
    updatedAt: createdAt,
    type,
  }
}

describe('enforceGlobalVersionBudget 全库版本预算', () => {
  it('总量在预算内时不裁剪任何快照', () => {
    const doc = makeDoc('d1', [makeVersion('v1', 'auto', '2026-01-01', 100)])
    const dropped = enforceGlobalVersionBudget([{ id: 'nb', title: '', docs: [doc] } as Notebook])
    expect(dropped).toBe(0)
    expect(doc.versions).toHaveLength(1)
  })

  it('超出预算时从全局最旧的自动快照开始丢', () => {
    // 每份 ~30 万字符 ≈ 90 万字节估算；造 45 份把总量推过 32MB 预算
    const versions = Array.from({ length: 45 }, (_, i) =>
      makeVersion('v' + i, 'auto', new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), 300_000),
    )
    const doc = makeDoc('d1', versions)
    const dropped = enforceGlobalVersionBudget([{ id: 'nb', title: '', docs: [doc] } as Notebook])
    expect(dropped).toBeGreaterThan(0)
    // 最旧的被丢，最新的保留
    expect(doc.versions!.find(v => v.id === 'v0')).toBeUndefined()
    expect(doc.versions!.find(v => v.id === 'v44')).toBeDefined()
    // 剩余总量回到预算内
    const remainBytes = doc.versions!.reduce((s, v) => s + v.content.length * 3, 0)
    expect(remainBytes).toBeLessThanOrEqual(VERSION_BUDGET_BYTES_TOTAL)
  })

  it('手动版本最后才动，且每篇至少保留最新 1 份', () => {
    const versions = Array.from({ length: 45 }, (_, i) =>
      makeVersion('m' + i, 'manual', new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), 300_000),
    )
    const doc = makeDoc('d1', versions)
    enforceGlobalVersionBudget([{ id: 'nb', title: '', docs: [doc] } as Notebook])
    // 全手动也要被裁到预算内，但最新一份永远在
    expect(doc.versions!.find(v => v.id === 'm44')).toBeDefined()
    const remainBytes = doc.versions!.reduce((s, v) => s + v.content.length * 3, 0)
    expect(remainBytes).toBeLessThanOrEqual(VERSION_BUDGET_BYTES_TOTAL)
  })

  it('自动与手动混合时：自动快照先被牺牲', () => {
    const auto = makeVersion('a-old', 'auto', '2026-01-01', 300_000)
    const manual = makeVersion('m-new', 'manual', '2026-06-01', 300_000)
    // 总量超预算：用 40 份自动 + 1 份手动
    const autos = Array.from({ length: 40 }, (_, i) =>
      makeVersion('a' + i, 'auto', new Date(Date.UTC(2026, 1, 1 + i)).toISOString(), 300_000),
    )
    const doc = makeDoc('d1', [manual, auto, ...autos])
    enforceGlobalVersionBudget([{ id: 'nb', title: '', docs: [doc] } as Notebook])
    // 手动版本一定还在
    expect(doc.versions!.find(v => v.id === 'm-new')).toBeDefined()
    // 最旧的自动快照不在了
    expect(doc.versions!.find(v => v.id === 'a-old')).toBeUndefined()
  })

  it('空库 / 无快照不报错', () => {
    expect(enforceGlobalVersionBudget([])).toBe(0)
    const doc = makeDoc('d1', [])
    expect(enforceGlobalVersionBudget([{ id: 'nb', title: '', docs: [doc] } as Notebook])).toBe(0)
  })
})

describe('commitVersions 与全库预算的协作', () => {
  it('单篇写入仍遵守单篇预算（既有行为不回归）', () => {
    const doc = makeDoc('d1', [])
    const candidates = Array.from({ length: 60 }, () =>
      createVersion(doc, 'nb', { type: 'manual', content: 'x'.repeat(1000) }),
    )
    commitVersions(doc, candidates)
    expect(doc.versions!.length).toBeLessThanOrEqual(50)
  })
})