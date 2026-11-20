import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createStorageHandlers } from '../../electron/ipc/handlers-storage.cjs'

/**
 * 正文与版本快照分离存储（notes-versions.json）的链路测试。
 *
 * 版本快照是全量正文副本，曾把 notes:save 的 50MB payload 顶爆导致保存永久失败。
 * 分离后必须锁住四条保证：
 *  1) save 写盘时 versions 不进 notes-data.json（幂等剥离）；
 *  2) load 合并对上层透明（旧格式内嵌 versions 自动迁移）；
 *  3) 备份/恢复成对（.versions 同名后缀），恢复前快照不被覆盖；
 *  4) 独立通道 notes:versions:save / load 可用。
 */

type Handler = (event: unknown, payload?: unknown) => Promise<unknown>

let tmpDir = ''
let handlers: Map<string, Handler>
let storage: ReturnType<typeof createStorageHandlers>

const version = (id: string) => ({
  id,
  docId: 'd-1',
  notebookId: 'nb-1',
  title: 'a',
  content: 'snapshot body',
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  type: 'auto',
})

const storeWithVersions = {
  notebooks: [
    {
      id: 'nb-1',
      title: '库',
      docs: [
        { id: 'd-1', title: 'a', content: 'body', parentId: null, versions: [version('v1'), version('v2')] },
      ],
    },
  ],
  trash: [],
  tags: [],
  searchHistory: [],
}

async function readDataFile(): Promise<any> {
  return JSON.parse(await fs.readFile(path.join(tmpDir, 'notes-data.json'), 'utf-8'))
}

async function readVersionsFile(): Promise<any> {
  return JSON.parse(await fs.readFile(path.join(tmpDir, 'notes-versions.json'), 'utf-8'))
}

/** 备份创建是 fire-and-forget（不阻塞保存），等它落盘 */
async function waitForBackup(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const files = await fs.readdir(path.join(tmpDir, 'backups'))
    if (files.some((f) => f.startsWith('backup-') && f.endsWith('.json'))) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-versions-test-'))
  await fs.mkdir(path.join(tmpDir, 'backups'), { recursive: true })
  await fs.writeFile(path.join(tmpDir, 'notes-data.json'), JSON.stringify({ notebooks: [], trash: [] }), 'utf-8')
  handlers = new Map()
  storage = createStorageHandlers({
    app: { getPath: () => tmpDir } as never,
    ipcMain: { handle: (channel: string, fn: Handler) => handlers.set(channel, fn) } as never,
    getDataPath: () => path.join(tmpDir, 'notes-data.json'),
    defaultData: { notebooks: [], trash: [] },
  })
  storage.register()
})

afterEach(async () => {
  // notes:save 会 fire-and-forget 触发备份写入（不阻塞保存），慢负载下它可能落到
  // 目录删除之后 —— rm 撞上正在写入的 backups/ 会报 ENOTEMPTY。
  // 双保险：测试内已 waitForBackup 等落盘；这里再给 rm 加重试兜住残余竞态。
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

describe('notes:save 剥离写盘', () => {
  it('versions 不进 notes-data.json，单独写入 notes-versions.json', async () => {
    // notes:save 的既有契约是返回写入的 payload（不是 ok 信封）
    await handlers.get('notes:save')!({}, storeWithVersions)
    await waitForBackup() // 等 fire-and-forget 的备份写入落地，避免与 afterEach 删除竞态
    const data = await readDataFile()
    expect(data.notebooks[0].docs[0].versions).toEqual([])
    expect(data.notebooks[0].docs[0].content).toBe('body')
    const versions = await readVersionsFile()
    expect(versions['d-1']).toHaveLength(2)
    expect(versions['d-1'][0].id).toBe('v1')
  })

  it('load 合并对上层透明：返回完整 versions', async () => {
    await handlers.get('notes:save')!({}, storeWithVersions)
    const result = (await handlers.get('notes:load')!({})) as { ok: boolean; data?: any }
    expect(result.ok).toBe(true)
    expect(result.data!.notebooks[0].docs[0].versions).toHaveLength(2)
    expect(result.data!.notebooks[0].docs[0].versions[1].id).toBe('v2')
  })

  it('旧格式（versions 内嵌）自动迁移：load 返回完整，save 后文件分离', async () => {
    // 只写旧格式 notes-data.json（versions 内嵌，无 notes-versions.json）
    await fs.writeFile(path.join(tmpDir, 'notes-data.json'), JSON.stringify(storeWithVersions), 'utf-8')
    const loaded = (await handlers.get('notes:load')!({})) as { ok: boolean; data?: any }
    expect(loaded.data!.notebooks[0].docs[0].versions).toHaveLength(2)
    // 保存一次后即分离
    await handlers.get('notes:save')!({}, loaded.data)
    await waitForBackup() // 同上：等备份落盘再断言/收尾
    const data = await readDataFile()
    expect(data.notebooks[0].docs[0].versions).toEqual([])
    const versions = await readVersionsFile()
    expect(versions['d-1']).toHaveLength(2)
  })
})

describe('notes:versions 独立通道', () => {
  it('saveVersions / loadVersions 往返一致', async () => {
    const map = { 'd-1': [version('v9')] }
    const saveResult = (await handlers.get('notes:versions:save')!({}, map)) as { ok: boolean }
    expect(saveResult.ok).toBe(true)
    const loadResult = (await handlers.get('notes:versions:load')!({})) as { ok: boolean; data?: any }
    expect(loadResult.data['d-1']).toHaveLength(1)
  })

  it('versions:save 拒绝非对象载荷', async () => {
    const result = (await handlers.get('notes:versions:save')!({}, [1, 2])) as { ok: boolean; error?: string }
    expect(result.ok).toBe(false)
    expect(result.error).toContain('版本数据无效')
  })
})

describe('备份/恢复成对', () => {
  it('备份同时留下 .json 与 .versions 成对文件（.versions 不进备份列表）', async () => {
    await handlers.get('notes:save')!({}, storeWithVersions)
    await waitForBackup()
    // 绕过 60s 节流：恢复流程会 lastBackupAt=0 后调 writeBackupCopy，这里直接走恢复的留存路径
    const files = await fs.readdir(path.join(tmpDir, 'backups'))
    const jsonBackups = files.filter((f) => f.endsWith('.json'))
    // backup:save 有 60s 节流，首次保存后通常已有一次备份
    for (const backup of jsonBackups) {
      const pair = backup.replace(/\.json$/, '.versions')
      expect(files).toContain(pair)
    }
    // 备份列表只列 .json（成对 .versions 不重复出现在列表里）
    const list = (await handlers.get('backup:list')!({})) as { ok: boolean; backups?: Array<{ name: string }> }
    for (const b of list.backups!) {
      expect(b.name.endsWith('.json')).toBe(true)
    }
  })

  it('恢复成对：notes-versions.json 从 .versions 备份恢复', async () => {
    await handlers.get('notes:save')!({}, storeWithVersions)
    await waitForBackup()
    const backupDir = path.join(tmpDir, 'backups')
    const files = await fs.readdir(backupDir)
    const backupJson = files.find((f) => f.startsWith('backup-') && f.endsWith('.json'))
    expect(backupJson).toBeTruthy()
    // 破坏当前版本文件，验证恢复真的把它写回来
    await fs.writeFile(path.join(tmpDir, 'notes-versions.json'), '{}', 'utf-8')
    const result = (await handlers.get('notes:restore-backup')!({}, { name: backupJson })) as { ok: boolean }
    expect(result.ok).toBe(true)
    const versions = await readVersionsFile()
    expect(versions['d-1']).toHaveLength(2)
  })
})