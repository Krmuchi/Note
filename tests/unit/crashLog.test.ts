import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MAX_ENTRIES, createCrashLogStore, formatCrashEntry, normalizeEntry } from '../../electron/crash-log.cjs'

/** 崩溃日志（D5）：本地留存、可清理、脏数据不阻断。 */

let dir = ''

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-crash-'))
})

afterEach(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* 清理失败不影响断言 */
  }
})

describe('normalizeEntry', () => {
  it('接受已知类型并补齐时间戳', () => {
    const entry = normalizeEntry({ type: 'renderer-gone', message: 'crashed' })
    expect(entry?.type).toBe('renderer-gone')
    expect(entry?.at).toBeTruthy()
  })

  it('拒绝未知类型与非对象', () => {
    expect(normalizeEntry({ type: 'something-else' })).toBeNull()
    expect(normalizeEntry(null)).toBeNull()
    expect(normalizeEntry('boom')).toBeNull()
  })

  it('截断超长消息与堆栈（日志不能被撑爆）', () => {
    const entry = normalizeEntry({ type: 'main-uncaught', message: 'x'.repeat(5000), stack: 'y'.repeat(9000) })
    expect(entry?.message.length).toBeLessThan(2100)
    expect(entry?.stack.length).toBeLessThan(4100)
  })
})

describe('createCrashLogStore', () => {
  it('首次读取（文件不存在）返回空数组', () => {
    expect(createCrashLogStore({ dir }).readAll()).toEqual([])
  })

  it('追加后可读回，且为最新一条', () => {
    const store = createCrashLogStore({ dir })
    store.append({ type: 'main-uncaught', message: '第一' })
    store.append({ type: 'renderer-gone', message: '第二' })

    expect(store.count()).toBe(2)
    expect(store.readLatest()?.message).toBe('第二')
  })

  it('超过上限时只保留最近 ' + MAX_ENTRIES + ' 条', () => {
    const store = createCrashLogStore({ dir })
    for (let i = 0; i < MAX_ENTRIES + 5; i += 1) {
      store.append({ type: 'main-uncaught', message: '崩' + i })
    }
    expect(store.count()).toBe(MAX_ENTRIES)
    expect(store.readAll()[0].message).toBe('崩5')
  })

  it('非法记录被拒绝且不影响已有内容', () => {
    const store = createCrashLogStore({ dir })
    store.append({ type: 'main-uncaught', message: '有效' })
    expect(store.append({ type: 'unknown-type' }).ok).toBe(false)
    expect(store.count()).toBe(1)
  })

  it('文件损坏时读回空数组而不是抛错', () => {
    fs.writeFileSync(path.join(dir, 'crash-log.json'), 'not json', 'utf-8')
    expect(createCrashLogStore({ dir }).readAll()).toEqual([])
  })

  it('清理后为空', () => {
    const store = createCrashLogStore({ dir })
    store.append({ type: 'main-rejection', message: 'x' })
    expect(store.clear().ok).toBe(true)
    expect(store.count()).toBe(0)
  })

  it('写入失败返回 ok:false 而不是抛错', () => {
    const store = createCrashLogStore({
      dir,
      fsSync: {
        readFileSync: () => {
          throw new Error('nope')
        },
        writeFileSync: () => {
          throw new Error('readonly')
        },
      },
    })
    expect(store.append({ type: 'main-uncaught', message: 'x' }).ok).toBe(false)
  })
})

describe('formatCrashEntry', () => {
  it('无记录时给出明确文案', () => {
    expect(formatCrashEntry(null)).toContain('无崩溃记录')
  })

  it('摘要包含类型与消息', () => {
    const text = formatCrashEntry({ at: '2026-10-01T00:00:00.000Z', type: 'renderer-gone', message: '渲染进程崩溃' })
    expect(text).toContain('renderer-gone')
    expect(text).toContain('渲染进程崩溃')
  })
})
