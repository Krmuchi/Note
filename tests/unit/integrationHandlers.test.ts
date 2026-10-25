import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import fsp from 'node:fs/promises'
import { createIntegrationHandlers } from '../../electron/ipc/handlers-integration.cjs'
import {
  DEFAULT_UPDATE_MANIFEST_URL,
  UPDATE_CHECK_TIMEOUT,
  evaluateUpdate,
  parseReleaseManifest,
} from '../../electron/update-check.cjs'
import { planMigrationEntries, validateMigration } from '../../electron/data-migration.cjs'
import { buildRegistryCommands, buildRegistryPlan } from '../../electron/file-open.cjs'
import { formatCrashEntry } from '../../electron/crash-log.cjs'

/**
 * 本机集成类 IPC（从 main.cjs 抽出的 11 个 handler）。
 *
 * 抽取前它们内联在 app.whenReady() 的巨型回调里，**没有任何测试** ——
 * 而这里恰恰包含不可逆操作：迁移数据目录、改注册表、回滚开机自启。
 * 这组测试锁住通道清单与几个关键守卫（不允许覆盖已有数据、非 Windows 拒绝改关联）。
 */

/** 记录注册了哪些通道，并返回可调用它们的桩 */
function makeHarness(overrides: Record<string, unknown> = {}) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipcMain = {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
  }

  const settingsWrites: unknown[] = []
  const appSettings = {
    read: () => ({
      notifyWhenBackground: true,
      autoLaunch: false,
      globalQuickNote: false,
      ...(overrides.settings as object | undefined),
    }),
    write: vi.fn((patch: unknown) => {
      settingsWrites.push(patch)
      return { ok: true, settings: { ...(overrides.settings as object | undefined), ...(patch as object) } }
    }),
  }

  const instance = createIntegrationHandlers({
    ipcMain,
    app: { relaunch: vi.fn(), exit: vi.fn(), getVersion: () => '0.1.0' },
    dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
    Notification: Object.assign(vi.fn(), { isSupported: () => true }),
    getMainWindow: () => null,
    showMainWindow: vi.fn(),
    getAppSettingsStore: () => appSettings,
    getCrashLogStore: () => ({
      readAll: () => [],
      readLatest: () => null,
      clear: () => ({ ok: true }),
      file: '/tmp/crash.log',
    }),
    resolveDataDir: () => '/src',
    applyAutoLaunch: () => ({ ok: true }),
    readAutoLaunchState: () => false,
    applyGlobalQuickNote: () => ({ ok: true }),
    setRecentDocs: vi.fn(),
    rebuildJumpList: vi.fn(),
    runReg: vi.fn(async () => ({ stdout: '' })),
    fsp,
    path,
    validation: { validateMigration, planMigrationEntries },
    fileOpen: { buildRegistryPlan, buildRegistryCommands },
    updateCheck: { evaluateUpdate, parseReleaseManifest, DEFAULT_UPDATE_MANIFEST_URL, UPDATE_CHECK_TIMEOUT },
    formatCrashEntry,
    ...overrides.deps as object,
  })
  instance.register()
  return { handlers, appSettings, settingsWrites }
}

describe('createIntegrationHandlers - 通道清单', () => {
  it('注册全部 11 个本机集成通道', () => {
    const { handlers } = makeHarness()
    expect([...handlers.keys()].sort()).toEqual(
      [
        'notes:app-settings:get',
        'notes:app-settings:set',
        'notes:check-update',
        'notes:crash-log:clear',
        'notes:crash-log:get',
        'notes:file-association:get',
        'notes:file-association:set',
        'notes:migrate-data-dir',
        'notes:notify',
        'notes:relaunch',
        'notes:update-recents',
      ].sort(),
    )
  })
})

describe('notes:migrate-data-dir - 不可逆操作守卫', () => {
  it('用户取消时不产生任何副作用', async () => {
    const { handlers, appSettings } = makeHarness()
    const result = (await handlers.get('notes:migrate-data-dir')!({})) as { ok: boolean; canceled?: boolean }
    expect(result).toEqual({ ok: false, canceled: true })
    expect(appSettings.write).not.toHaveBeenCalled()
  })

  it('目标目录已有 notes-data.json 时拒绝覆盖', async () => {
    /*
     * 这是本模块最重要的守卫：覆盖别人的笔记是不可逆事故。
     * 用真实 fsp.access 打桩模拟"目标目录已有数据文件"。
     */
    const accessSpy = vi.spyOn(fsp, 'access').mockResolvedValue(undefined)
    const { handlers, appSettings } = makeHarness({
      deps: {
        dialog: {
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/dst'] })),
        },
      },
    })

    const result = (await handlers.get('notes:migrate-data-dir')!({})) as { ok: boolean; error?: string }
    expect(result.ok).toBe(false)
    expect(result.error).toContain('已经有一份 notes-data.json')
    expect(appSettings.write).not.toHaveBeenCalled()
    accessSpy.mockRestore()
  })
})

describe('notes:relaunch', () => {
  it('调用 relaunch + exit(0) 并返回信封', async () => {
    const app = { relaunch: vi.fn(), exit: vi.fn(), getVersion: () => '0.1.0' }
    const { handlers } = makeHarness({ deps: { app } })
    const result = await handlers.get('notes:relaunch')!({})
    expect(result).toEqual({ ok: true })
    expect(app.relaunch).toHaveBeenCalled()
    expect(app.exit).toHaveBeenCalledWith(0)
  })
})

describe('notes:file-association - 平台守卫', () => {
  it('非 Windows 返回 supported=false 而不报错', async () => {
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    try {
      const { handlers } = makeHarness()
      const result = (await handlers.get('notes:file-association:get')!({})) as { ok: boolean; supported: boolean }
      expect(result).toEqual({ ok: true, supported: false, enabled: false })

      const setResult = (await handlers.get('notes:file-association:set')!({}, { enabled: true })) as {
        ok: boolean
        error?: string
      }
      expect(setResult.ok).toBe(false)
      expect(setResult.error).toContain('不支持')
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true })
    }
  })
})

describe('notes:notify - 打扰抑制', () => {
  it('载荷无标题时拒绝', async () => {
    const { handlers } = makeHarness()
    const result = (await handlers.get('notes:notify')!({}, {})) as { ok: boolean; error?: string }
    expect(result.ok).toBe(false)
  })

  it('设置里关闭了后台提醒时直接 skipped（不弹窗）', async () => {
    const { handlers } = makeHarness({ settings: { notifyWhenBackground: false } })
    const result = (await handlers.get('notes:notify')!({}, { title: 'x' })) as {
      ok: boolean
      skipped?: boolean
    }
    expect(result).toEqual({ ok: false, skipped: true })
  })
})

describe('notes:update-recents', () => {
  it('过滤非法条目并截断到 10 条', async () => {
    const setRecentDocs = vi.fn()
    const { handlers } = makeHarness({ deps: { setRecentDocs } })

    const input = [
      { id: 'ok1', title: 'a' },
      { id: '', title: 'bad' },        // 空 id
      { nope: true },                   // 无 id
      ...Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, title: `t${i}` })),
    ]
    await handlers.get('notes:update-recents')!({}, input)

    const passed = setRecentDocs.mock.calls[0][0]
    expect(passed.length).toBeLessThanOrEqual(10)
    expect(passed.every((d: { id: string }) => typeof d.id === 'string' && d.id.length > 0)).toBe(true)
  })

  it('非数组载荷按空列表处理（不崩）', async () => {
    const setRecentDocs = vi.fn()
    const { handlers } = makeHarness({ deps: { setRecentDocs } })
    await expect(handlers.get('notes:update-recents')!({}, null)).resolves.toEqual({ ok: true })
    expect(setRecentDocs).toHaveBeenCalledWith([])
  })
})

describe('notes:app-settings - 回滚语义', () => {
  it('get 时开机自启以系统真实状态为准', async () => {
    const { handlers } = makeHarness({
      settings: { autoLaunch: true },
      deps: { readAutoLaunchState: () => false },
    })
    const result = (await handlers.get('notes:app-settings:get')!({})) as {
      ok: boolean
      settings: { autoLaunch: boolean }
    }
    // 设置文件写 true，但系统实际是 false → 必须如实报告 false
    expect(result.settings.autoLaunch).toBe(false)
  })

  it('开机自启设置失败时回滚为 false（不让开关停在假的已开启）', async () => {
    const { handlers, appSettings } = makeHarness({
      deps: { applyAutoLaunch: () => ({ ok: false, error: '系统拒绝' }) },
    })

    const result = (await handlers.get('notes:app-settings:set')!({}, { autoLaunch: true })) as {
      ok: boolean
      error?: string
      settings?: { autoLaunch: boolean }
    }

    expect(result.ok).toBe(false)
    expect(result.error).toBe('系统拒绝')
    // 必须有一次回写把 autoLaunch 置回 false
    expect(appSettings.write).toHaveBeenCalledWith({ autoLaunch: false })
  })

  it('全局快捷键被占用时回滚开关', async () => {
    const { handlers, appSettings } = makeHarness({
      deps: { applyGlobalQuickNote: () => ({ ok: false, error: '快捷键已被占用' }) },
    })

    const result = (await handlers.get('notes:app-settings:set')!({}, { globalQuickNote: true })) as {
      ok: boolean
      error?: string
    }
    expect(result.ok).toBe(false)
    expect(appSettings.write).toHaveBeenCalledWith({ globalQuickNote: false })
  })

  it('无效载荷被拒绝', async () => {
    const { handlers, appSettings } = makeHarness()
    const result = (await handlers.get('notes:app-settings:set')!({}, null)) as { ok: boolean }
    expect(result.ok).toBe(false)
    expect(appSettings.write).not.toHaveBeenCalled()
  })
})

describe('notes:crash-log', () => {
  it('读取返回信封与摘要', async () => {
    const { handlers } = makeHarness()
    const result = (await handlers.get('notes:crash-log:get')!({})) as { ok: boolean; file: string }
    expect(result.ok).toBe(true)
    expect(result.file).toBe('/tmp/crash.log')
  })

  it('清理返回信封', async () => {
    const { handlers } = makeHarness()
    await expect(handlers.get('notes:crash-log:clear')!({})).resolves.toEqual({ ok: true })
  })
})
