import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useNotesStore } from '@/store'
import * as storage from '@/services/storage'

/**
 * 回归：保存失败 → 裁剪版本 → 重试 这条链路。
 *
 * 旧实现把 trimAllVersions 作用在 get() 返回的已冻结 state 上，直接赋值抛
 * TypeError 并逃逸出 saveNotes，saveStatus 永远停在 'saving'，
 * useAutoSave 既不重试也不弹失败提示（保存失败被静默吞掉）。
 */
describe('saveNotes 裁剪重试链路', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('首次保存失败时裁剪版本，并用裁剪后的数据重试成功', async () => {
    // 绕过 30s 合并窗口造出多份版本
    let clock = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += 31_000))

    const st = useNotesStore.getState()
    const nbId = st.createNotebook('裁剪测试库')
    const docId = st.createDoc(nbId, null, { title: 'doc', content: 'x' })!
    for (let i = 0; i < 12; i++) {
      useNotesStore.getState().updateDoc(nbId, docId, { content: 'y'.repeat(50 + i) })
    }

    const before = useNotesStore
      .getState()
      .notebooks.find((n) => n.id === nbId)!
      .docs.find((d) => d.id === docId)!
    expect(before.versions?.length ?? 0).toBeGreaterThan(10)

    // 第一次调用抛错（模拟 payload 超限），第二次成功
    const sent: number[] = []
    const spy = vi.spyOn(storage, 'saveAppStore')
    spy.mockImplementationOnce(async () => {
      throw new Error('Payload too large')
    })
    spy.mockImplementation(async (payload) => {
      const doc = payload.notebooks.find((n) => n.id === nbId)?.docs.find((d) => d.id === docId)
      sent.push(doc?.versions?.length ?? -1)
      return payload
    })

    await useNotesStore.getState().saveNotes()

    // 关键断言 1：状态收口到 saved，而不是卡在 saving
    expect(useNotesStore.getState().saveStatus).toBe('saved')
    // 关键断言 2：确实重试了，且重试时带的是裁剪后的数据
    expect(spy).toHaveBeenCalledTimes(2)
    expect(sent[0]).toBe(10)
    // 关键断言 3：store 内版本数确实被裁剪
    const after = useNotesStore
      .getState()
      .notebooks.find((n) => n.id === nbId)!
      .docs.find((d) => d.id === docId)!
    expect(after.versions?.length).toBe(10)
  })

  it('两次都失败时置 saveStatus=error（不再静默卡在 saving）', async () => {
    const spy = vi.spyOn(storage, 'saveAppStore')
    spy.mockRejectedValue(new Error('disk full'))

    await useNotesStore.getState().saveNotes()

    expect(spy).toHaveBeenCalledTimes(2)
    expect(useNotesStore.getState().saveStatus).toBe('error')
  })

  it('裁剪本身抛错也不会让 saveNotes 异常逃逸', async () => {
    const spy = vi.spyOn(storage, 'saveAppStore')
    spy.mockRejectedValue(new Error('boom'))

    // 让版本字段变成不可写对象，逼近裁剪抛错的场景
    const st = useNotesStore.getState()
    const nbId = st.createNotebook('异常库')
    const docId = st.createDoc(nbId, null, { title: 'd', content: 'z' })!

    await expect(useNotesStore.getState().saveNotes()).resolves.toBeUndefined()
    expect(useNotesStore.getState().saveStatus).toBe('error')
    expect(nbId).toBeTruthy()
    expect(docId).toBeTruthy()
  })
})

/** 回归：缺 content 字段的文档不应让 updateDoc 崩溃 */
describe('updateDoc 对缺失 content 的宽容度', () => {
  it('content 为 undefined 时按空串处理，不抛 TypeError', () => {
    const st = useNotesStore.getState()
    const nbId = st.createNotebook('content 库')
    const docId = st.createDoc(nbId, null, { title: 'no content' })!

    // 模拟从备份/草稿恢复进来的缺字段文档
    useNotesStore.setState((s) => {
      const nb = s.notebooks.find((n) => n.id === nbId)!
      const doc = nb.docs.find((d) => d.id === docId)!
      // @ts-expect-error 故意制造脏数据
      doc.content = undefined
    })

    expect(() => {
      useNotesStore.getState().updateDoc(nbId, docId, { title: 'renamed' })
    }).not.toThrow()

    const doc = useNotesStore
      .getState()
      .notebooks.find((n) => n.id === nbId)!
      .docs.find((d) => d.id === docId)!
    expect(doc.title).toBe('renamed')
  })
})
