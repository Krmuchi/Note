import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createStorageHandlers } from '../../electron/ipc/handlers-storage.cjs'

/**
 * 本地备份链路（列表 / 节流 / 覆盖式恢复）的单元测试。
 * 备份恢复会覆盖全部用户数据，属于数据安全关键路径，必须锁定两条保证：
 *  1) 恢复前一定留存一份当前数据快照（恢复错了能回头）；
 *  2) 备份文件必须通过结构校验才能覆盖，损坏备份不得写入。
 */

type Handler = (event: unknown, payload?: unknown) => Promise<unknown>

let tmpDir = ''
let handlers: Map<string, Handler>
let storage: ReturnType<typeof createStorageHandlers>

const validStore = {
  notebooks: [{ id: 'nb-1', title: '库', docs: [] }],
  trash: [],
  tags: [],
  searchHistory: [],
}

async function readStoreFile(): Promise<unknown> {
  return JSON.parse(await fs.readFile(path.join(tmpDir, 'notes-data.json'), 'utf-8'))
}

async function backupFiles(): Promise<string[]> {
  return (await fs.readdir(path.join(tmpDir, 'backups'))).filter((f) => f.endsWith('.json'))
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-backup-test-'))
  await fs.mkdir(path.join(tmpDir, 'backups'), { recursive: true })
  await fs.writeFile(path.join(tmpDir, 'notes-data.json'), JSON.stringify(validStore), 'utf-8')

  handlers = new Map()
  storage = createStorageHandlers({
    // 只用到 getPath('userData')，此处用临时目录替代
    app: { getPath: () => tmpDir } as never,
    ipcMain: { handle: (channel: string, fn: Handler) => handlers.set(channel, fn) } as never,
    getDataPath: () => path.join(tmpDir, 'notes-data.json'),
    defaultData: { notebooks: [], trash: [] },
  })
  storage.register()
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('notes:load', () => {
  it('数据文件正常时返回 ok 信封与数据', async () => {
    const result = (await handlers.get('notes:load')!({})) as { ok: boolean; data?: typeof validStore }
    expect(result.ok).toBe(true)
    expect(result.data!.notebooks[0].id).toBe('nb-1')
  })

  it('数据文件损坏时返回失败信封而不是抛错，且不改写原文件', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes-data.json'), '{ broken json', 'utf-8')
    const result = (await handlers.get('notes:load')!({})) as { ok: boolean; error?: string }
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    // 关键：损坏文件必须原样保留，供用户手工抢救或从备份恢复
    expect(await fs.readFile(path.join(tmpDir, 'notes-data.json'), 'utf-8')).toBe('{ broken json')
  })
})

describe('notes:app-info', () => {
  it('返回数据目录与备份目录，供失败恢复引导使用', async () => {
    const result = (await handlers.get('notes:app-info')!({})) as {
      ok: boolean
      info?: { dataDir: string; backupDir: string; version: string }
    }
    expect(result.ok).toBe(true)
    expect(result.info!.dataDir).toBe(tmpDir)
    expect(result.info!.backupDir).toBe(path.join(tmpDir, 'backups'))
  })
})

describe('backup:list', () => {
  it('按修改时间倒序返回备份，并标记 auto/prerestore 类型', async () => {
    await fs.writeFile(path.join(tmpDir, 'backups', 'backup-old.json'), '{}', 'utf-8')
    await new Promise((r) => setTimeout(r, 12))
    await fs.writeFile(path.join(tmpDir, 'backups', 'prerestore-new.json'), '{}', 'utf-8')

    const result = (await handlers.get('backup:list')!({})) as {
      ok: true
      backups: { name: string; auto: boolean; size: number; createdAt: string }[]
    }

    expect(result.ok).toBe(true)
    expect(result.backups.map((b) => b.name)).toEqual(['prerestore-new.json', 'backup-old.json'])
    expect(result.backups[0].auto).toBe(false)
    expect(result.backups[1].auto).toBe(true)
    expect(typeof result.backups[0].size).toBe('number')
    expect(Number.isNaN(new Date(result.backups[0].createdAt).getTime())).toBe(false)
  })

  it('忽略非 json 文件', async () => {
    await fs.writeFile(path.join(tmpDir, 'backups', 'readme.txt'), 'x', 'utf-8')
    const result = (await handlers.get('backup:list')!({})) as { ok: true; backups: unknown[] }
    expect(result.backups).toHaveLength(0)
  })
})

describe('createBackup', () => {
  it('生成备份并返回时间与文件名', async () => {
    const info = await storage.createBackup()
    expect(info).not.toBeNull()
    expect(info!.name).toMatch(/^backup-.+\.json$/)
    expect((await backupFiles())).toHaveLength(1)
  })

  it('60 秒节流：连续调用第二次返回 null 且不新增文件', async () => {
    await storage.createBackup()
    const second = await storage.createBackup()
    expect(second).toBeNull()
    expect(await backupFiles()).toHaveLength(1)
  })
})

describe('pruneBackups', () => {
  it('只保留最近 10 份', async () => {
    for (let i = 0; i < 13; i++) {
      await fs.writeFile(path.join(tmpDir, 'backups', `backup-${i}.json`), '{}', 'utf-8')
      await new Promise((r) => setTimeout(r, 4))
    }
    await storage.pruneBackups()
    expect(await backupFiles()).toHaveLength(10)
  })
})

describe('notes:restore-backup', () => {
  it('覆盖前先留存 prerestore 快照，再用备份内容覆盖数据文件', async () => {
    const restored = { ...validStore, notebooks: [{ id: 'nb-2', title: '恢复的库', docs: [] }] }
    await fs.writeFile(path.join(tmpDir, 'backups', 'backup-x.json'), JSON.stringify(restored), 'utf-8')

    const result = (await handlers.get('notes:restore-backup')!({}, { name: 'backup-x.json' })) as { ok: boolean }

    expect(result.ok).toBe(true)
    expect((await readStoreFile() as typeof restored).notebooks[0].id).toBe('nb-2')
    // 关键保证：恢复前把旧数据另存了一份
    expect((await backupFiles()).some((f) => f.startsWith('prerestore-'))).toBe(true)
  })

  it('拒绝路径穿越与非法文件名', async () => {
    for (const name of ['../notes-data.json', 'a/../../b.json', 'x.txt', '', 'a b.json']) {
      const result = (await handlers.get('notes:restore-backup')!({}, { name })) as { ok: boolean }
      expect(result.ok).toBe(false)
    }
  })

  it('备份内容结构非法时返回失败信封且不改动现有数据', async () => {
    await fs.writeFile(path.join(tmpDir, 'backups', 'backup-bad.json'), JSON.stringify({ foo: 1 }), 'utf-8')
    const result = (await handlers.get('notes:restore-backup')!({}, { name: 'backup-bad.json' })) as {
      ok: boolean
      error?: string
    }
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect((await readStoreFile() as typeof validStore).notebooks[0].id).toBe('nb-1')
  })

  it('备份文件不存在时返回失败信封', async () => {
    const result = (await handlers.get('notes:restore-backup')!({}, { name: 'backup-missing.json' })) as {
      ok: boolean
    }
    expect(result.ok).toBe(false)
  })
})