import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import fsp from 'node:fs/promises'
import { createIntegrationHandlers } from '../../electron/ipc/handlers-integration.cjs'
import { validateMigration, planMigrationEntries } from '../../electron/data-migration.cjs'
import { buildRegistryCommands, buildRegistryPlan } from '../../electron/file-open.cjs'
import { formatCrashEntry } from '../../electron/crash-log.cjs'
import {
  DEFAULT_UPDATE_MANIFEST_URL,
  UPDATE_CHECK_TIMEOUT,
  evaluateUpdate,
  parseReleaseManifest,
} from '../../electron/update-check.cjs'

/**
 * P1-6：notes:app-settings:set 收到 zoomFactor 后必须**立刻应用到当前窗口**。
 * 否则设置里的 −/+ 只是改了个数字，用户点了看不到任何变化（写盘本身由 app-settings
 * 单测覆盖，这里锁住的是「写盘之后还要 setZoomFactor」这一步与它的边界）。
 */
function makeHarness(overrides: Record<string, unknown> = {}): {
  handlers: Map<string, (...args: unknown[]) => unknown>
  setZoomFactor: ReturnType<typeof vi.fn>
  writes: Record<string, unknown>[]
} {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipcMain = {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
  }
  const writes: Record<string, unknown>[] = []
  const current: Record<string, unknown> = {
    closeToTray: false,
    globalQuickNote: false,
    autoLaunch: false,
    notifyWhenBackground: true,
    zoomFactor: 1,
    ...(overrides.settings as Record<string, unknown> | undefined),
  }
  const appSettings = {
    read: () => ({ ...current }),
    write: vi.fn((patch: Record<string, unknown>) => {
      writes.push(patch)
      Object.assign(current, patch)
      return { ok: true, settings: { ...current } }
    }),
  }

  const setZoomFactor = vi.fn()
  const win = {
    isDestroyed: () => (overrides.destroyed as boolean | undefined) ?? false,
    webContents: { setZoomFactor },
  }

  const instance = createIntegrationHandlers({
    ipcMain,
    app: { relaunch: vi.fn(), exit: vi.fn(), getVersion: () => '0.1.0' },
    dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
    Notification: Object.assign(vi.fn(), { isSupported: () => true }),
    getMainWindow: () => (overrides.destroyed ? null : win),
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
    updateCheck: {
      evaluateUpdate,
      parseReleaseManifest,
      DEFAULT_UPDATE_MANIFEST_URL,
      UPDATE_CHECK_TIMEOUT,
    },
    formatCrashEntry,
    ...((overrides.deps as object) || {}),
  })
  instance.register()
  return { handlers, setZoomFactor, writes }
}

describe('notes:app-settings:set · 界面缩放即时生效（P1-6）', () => {
  it('写入 zoomFactor 后立刻应用到窗口', async () => {
    const { handlers, setZoomFactor } = makeHarness()
    const set = handlers.get('notes:app-settings:set')!
    const result = (await set(null, { zoomFactor: 1.25 })) as { ok: boolean; settings: { zoomFactor: number } }

    expect(result.ok).toBe(true)
    expect(setZoomFactor).toHaveBeenCalledTimes(1)
    expect(setZoomFactor).toHaveBeenCalledWith(1.25)
  })

  it('其它偏好不会误触发缩放', async () => {
    const { handlers, setZoomFactor } = makeHarness()
    const set = handlers.get('notes:app-settings:set')!

    await set(null, { closeToTray: true })
    await set(null, { notifyWhenBackground: false })

    expect(setZoomFactor).not.toHaveBeenCalled()
  })

  it('窗口已销毁/不存在时不抛错、也不调用', async () => {
    const { handlers, setZoomFactor } = makeHarness({ destroyed: true })
    const set = handlers.get('notes:app-settings:set')!

    const result = (await set(null, { zoomFactor: 1.5 })) as { ok: boolean }
    expect(result.ok).toBe(true)
    expect(setZoomFactor).not.toHaveBeenCalled()
  })

  it('非法载荷被拒绝，窗口不被改动', async () => {
    const { handlers, setZoomFactor } = makeHarness()
    const set = handlers.get('notes:app-settings:set')!

    const result = (await set(null, null)) as { ok: boolean }
    expect(result.ok).toBe(false)
    expect(setZoomFactor).not.toHaveBeenCalled()
  })
})
