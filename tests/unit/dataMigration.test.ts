import { describe, it, expect } from 'vitest'
import path from 'node:path'
import {
  BACKUP_DIR_NAME,
  DATA_FILE_NAME,
  isInside,
  isSameDir,
  planMigrationEntries,
  validateMigration,
} from '../../electron/data-migration.cjs'

/**
 * 数据目录迁移的前置校验（O5）。
 * 这些判断守的是用户的全量数据，所以宁可拒绝也不能放行可疑目标。
 */

const base = path.resolve('C:/Users/test/AppData/Roaming/notes')
const inside = path.join(base, 'nested')
const sibling = path.resolve('C:/Users/test/Documents/notes-data')
const parent = path.resolve('C:/Users/test/AppData/Roaming')

describe('isSameDir / isInside', () => {
  it('同一路径（含大小写差异）判为相同', () => {
    expect(isSameDir(base, base)).toBe(true)
    expect(isSameDir(base, base.toUpperCase())).toBe(true)
  })

  it('子路径判为在内部', () => {
    expect(isInside(base, inside)).toBe(true)
    expect(isInside(base, base)).toBe(true)
    expect(isInside(base, sibling)).toBe(false)
  })
})

describe('validateMigration', () => {
  it('普通目标目录通过', () => {
    expect(validateMigration(base, sibling)).toEqual({ ok: true })
  })

  it('未选择目标目录时拒绝', () => {
    expect(validateMigration(base, '').ok).toBe(false)
    expect(validateMigration(base, '   ').ok).toBe(false)
  })

  it('相对路径拒绝', () => {
    const result = validateMigration(base, 'relative/dir')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('绝对路径')
  })

  it('与当前目录相同拒绝', () => {
    expect(validateMigration(base, base).ok).toBe(false)
  })

  it('目标在当前目录里面拒绝（复制过程中会自己套自己）', () => {
    const result = validateMigration(base, inside)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('里面')
  })

  it('当前目录在目标里面也拒绝', () => {
    const result = validateMigration(base, parent)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('里面')
  })

  it('当前目录未知时拒绝', () => {
    expect(validateMigration('', sibling).ok).toBe(false)
  })
})

describe('planMigrationEntries', () => {
  it('默认迁移数据文件；有备份时一并迁移', () => {
    const entries = planMigrationEntries(base, sibling, { hasDataFile: true, backupCount: 3 })
    expect(entries).toHaveLength(2)

    const data = entries.find((e: { kind: string }) => e.kind === 'data')
    expect(data?.from).toBe(path.join(base, DATA_FILE_NAME))
    expect(data?.to).toBe(path.join(sibling, DATA_FILE_NAME))
    expect(data?.required).toBe(true)

    const backups = entries.find((e: { kind: string }) => e.kind === 'backups')
    expect(backups?.from).toBe(path.join(base, BACKUP_DIR_NAME))
    expect(backups?.to).toBe(path.join(sibling, BACKUP_DIR_NAME))
    // 备份不是必需的：没有备份不该让迁移失败
    expect(backups?.required).toBe(false)
  })

  it('没有备份时只迁移数据文件', () => {
    const entries = planMigrationEntries(base, sibling, { hasDataFile: true, backupCount: 0 })
    expect(entries.map((e: { kind: string }) => e.kind)).toEqual(['data'])
  })

  it('数据文件缺失时计划为空但不抛错', () => {
    expect(planMigrationEntries(base, sibling, { hasDataFile: false, backupCount: 0 })).toEqual([])
  })

  it('不传 options 时按"有数据、无备份"处理', () => {
    expect(planMigrationEntries(base, sibling).map((e: { kind: string }) => e.kind)).toEqual(['data'])
  })
})
