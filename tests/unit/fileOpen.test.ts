import { describe, it, expect } from 'vitest'
import {
  PROG_ID,
  buildRegistryCommands,
  buildRegistryPlan,
  extractOpenFilePath,
  pickDocumentPath,
} from '../../electron/file-open.cjs'

/** .md 文件关联（P5）：命令行解析要稳，注册表操作必须可逆。 */

const exe = 'C:/Program Files/notes/notes.exe'

describe('extractOpenFilePath', () => {
  it('取出 --open-file= 的值', () => {
    expect(extractOpenFilePath(['notes.exe', '--open-file=C:/a/b.md'])).toBe('C:/a/b.md')
  })

  it('没有该开关时返回 null', () => {
    expect(extractOpenFilePath(['notes.exe', '--foo'])).toBeNull()
    expect(extractOpenFilePath([])).toBeNull()
    expect(extractOpenFilePath(undefined)).toBeNull()
  })

  it('空值时返回 null（不能把空路径当成文件）', () => {
    expect(extractOpenFilePath(['--open-file='])).toBeNull()
  })
})

describe('pickDocumentPath', () => {
  const exists = (): boolean => true

  it('双击关联文件时系统传的是裸路径，也要认出来', () => {
    expect(pickDocumentPath([exe, 'C:/docs/笔记.md'], { exePath: exe, existsSync: exists })).toBe('C:/docs/笔记.md')
  })

  it('跳过开关参数与可执行文件自身', () => {
    expect(pickDocumentPath([exe, '--enable-logging'], { exePath: exe, existsSync: exists })).toBeNull()
  })

  it('只接受 Markdown / 文本扩展名', () => {
    expect(pickDocumentPath([exe, 'C:/a/b.exe'], { exePath: exe, existsSync: exists })).toBeNull()
    expect(pickDocumentPath([exe, 'C:/a/b.markdown'], { exePath: exe, existsSync: exists })).toBe('C:/a/b.markdown')
  })

  it('文件不存在时忽略（避免为历史参数打开空文档）', () => {
    expect(pickDocumentPath([exe, 'C:/gone.md'], { exePath: exe, existsSync: () => false })).toBeNull()
  })
})

describe('buildRegistryPlan', () => {
  it('命令里带 --open-file 占位符，且路径被引号包裹', () => {
    const plan = buildRegistryPlan(exe)
    expect(plan?.command).toBe('"' + exe + '" --open-file="%1"')
    expect(plan?.progId).toBe(PROG_ID)
    expect(plan?.extensionKey).toContain('HKCU')
  })

  it('没有 exe 路径时返回 null', () => {
    expect(buildRegistryPlan('')).toBeNull()
  })
})

describe('buildRegistryCommands', () => {
  const plan = buildRegistryPlan(exe)!

  it('启用时写入 ProgID、图标、打开命令与 .md 默认值（四步）', () => {
    const { enable } = buildRegistryCommands(plan, '')
    expect(enable).toHaveLength(4)
    expect(enable[0]).toContain(plan.progIdKey)
    expect(enable[3]).toEqual(['add', plan.extensionKey, '/ve', '/d', plan.progId, '/f'])
  })

  it('关闭时若原先有关联：恢复原值并删除 ProgID', () => {
    const { disable } = buildRegistryCommands(plan, 'Typora.md')
    expect(disable[0]).toEqual(['add', plan.extensionKey, '/ve', '/d', 'Typora.md', '/f'])
    expect(disable[1]).toEqual(['delete', plan.progIdKey, '/f'])
  })

  it('关闭时若原先没有关联：删除值而不是写空串', () => {
    const { disable } = buildRegistryCommands(plan, '')
    expect(disable[0]).toEqual(['delete', plan.extensionKey, '/ve', '/f'])
  })

  it('计划缺失时返回空命令（不抛错）', () => {
    expect(buildRegistryCommands(null, '')).toEqual({ enable: [], disable: [] })
  })
})
