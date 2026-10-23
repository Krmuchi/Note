import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { planMigrationEntries } from '../../electron/data-migration.cjs'

/**
 * 迁移的复制步骤（O5）—— 对**真实文件系统**跑一遍。
 *
 * 迁移动的是用户全量数据，纯逻辑校验（dataMigration.test.ts）覆盖不了
 * "临时文件是否清理干净""目标已有备份目录时会不会炸"这类问题，所以这里真跑。
 */

let root = ''
let source = ''
let target = ''

const DATA = JSON.stringify({ notebooks: [{ id: 'nb1', title: '库', docs: [] }], trash: [], tags: [] })

/** 与 main.cjs 的迁移实现保持同一套步骤 */
async function runMigration(from: string, to: string): Promise<{ hasDataFile: boolean; backupCount: number }> {
  const sourceDataFile = path.join(from, 'notes-data.json')
  const sourceBackupDir = path.join(from, 'backups')

  const hasDataFile = fs.existsSync(sourceDataFile)

  const backupCount = fs.existsSync(sourceBackupDir) ? fs.readdirSync(sourceBackupDir).length : 0

  fs.mkdirSync(to, { recursive: true })

  const entries = planMigrationEntries(from, to, { hasDataFile, backupCount })
  for (const entry of entries) {
    if (entry.kind === 'data') {
      const temp = entry.to + '.tmp'
      fs.copyFileSync(entry.from, temp)
      fs.renameSync(temp, entry.to)
    } else {
      await fs.promises.cp(entry.from, entry.to, { recursive: true, force: false })
    }
  }

  return { hasDataFile, backupCount }
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-migrate-'))
  source = path.join(root, 'source')
  target = path.join(root, 'target')
  fs.mkdirSync(source, { recursive: true })
})

afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true })
  } catch {
    /* 清理失败不影响断言 */
  }
})

describe('数据目录迁移的复制步骤', () => {
  it('复制数据文件与备份，且不残留 .tmp', async () => {
    fs.writeFileSync(path.join(source, 'notes-data.json'), DATA, 'utf-8')
    fs.mkdirSync(path.join(source, 'backups'))
    fs.writeFileSync(path.join(source, 'backups', 'b1.json'), '{}', 'utf-8')
    fs.writeFileSync(path.join(source, 'backups', 'b2.json'), '{}', 'utf-8')

    const result = await runMigration(source, target)

    expect(result).toEqual({ hasDataFile: true, backupCount: 2 })
    expect(fs.readFileSync(path.join(target, 'notes-data.json'), 'utf-8')).toBe(DATA)
    expect(fs.readdirSync(path.join(target, 'backups')).sort()).toEqual(['b1.json', 'b2.json'])
    // 临时文件必须已被改名，不能留在目标目录里
    expect(fs.readdirSync(target).some((name) => name.endsWith('.tmp'))).toBe(false)
    // 迁移不删除源数据：用户反悔时数据还在
    expect(fs.existsSync(path.join(source, 'notes-data.json'))).toBe(true)
  })

  it('目标目录已存在 backups/ 时不会失败（合并而不是覆盖报错）', async () => {
    fs.writeFileSync(path.join(source, 'notes-data.json'), DATA, 'utf-8')
    fs.mkdirSync(path.join(source, 'backups'))
    fs.writeFileSync(path.join(source, 'backups', 'new.json'), '{}', 'utf-8')

    fs.mkdirSync(path.join(target, 'backups'), { recursive: true })
    fs.writeFileSync(path.join(target, 'backups', 'existing.json'), '{}', 'utf-8')

    await expect(runMigration(source, target)).resolves.toBeTruthy()
    expect(fs.readdirSync(path.join(target, 'backups')).sort()).toEqual(['existing.json', 'new.json'])
  })

  it('没有备份目录时只复制数据文件', async () => {
    fs.writeFileSync(path.join(source, 'notes-data.json'), DATA, 'utf-8')
    const result = await runMigration(source, target)

    expect(result.backupCount).toBe(0)
    expect(fs.existsSync(path.join(target, 'notes-data.json'))).toBe(true)
    expect(fs.existsSync(path.join(target, 'backups'))).toBe(false)
  })

  it('只有备份、没有数据文件时也能迁移', async () => {
    fs.mkdirSync(path.join(source, 'backups'))
    fs.writeFileSync(path.join(source, 'backups', 'b1.json'), '{}', 'utf-8')

    const result = await runMigration(source, target)

    expect(result.hasDataFile).toBe(false)
    expect(fs.existsSync(path.join(target, 'notes-data.json'))).toBe(false)
    expect(fs.existsSync(path.join(target, 'backups', 'b1.json'))).toBe(true)
  })
})
