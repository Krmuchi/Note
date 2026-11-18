import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

/**
 * shell 分区两条「设置 ↔ 行为」的接线：
 *  1. useAutoSave：保存重试耗尽时在 toast 之外发系统通知 ——
 *     notifyWhenBackground 此前是没有任何调用方的死设置（P7 的开关）；
 *  2. useAppInit：启动 4 秒后静默检查一次更新，只提示不弹窗（D3）。
 * 两个依赖都用 importOriginal 局部 mock：store 仍然拿到真实的 load/save 实现。
 */

vi.mock('@/services/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/storage')>()
  return {
    ...actual,
    notify: vi.fn(async () => undefined),
    checkForUpdate: vi.fn(async () => ({
      ok: true,
      current: '0.1.0',
      hasUpdate: true,
      latest: '0.2.0',
      url: 'https://example.com/notes-0.2.0.exe',
    })),
  }
})

vi.mock('@/services/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/toast')>()
  return {
    ...actual,
    toast: {
      ...actual.toast,
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  }
})

import { useAutoSave } from '@/hooks/useAutoSave'
import { useAppInit } from '@/hooks/useAppInit'
import { useNotesStore } from '@/store'
import { checkForUpdate, notify } from '@/services/storage'
import { toast } from '@/services/toast'

const mockedNotify = notify as unknown as ReturnType<typeof vi.fn>
const mockedCheck = checkForUpdate as unknown as ReturnType<typeof vi.fn>
const mockedToastError = toast.error as unknown as ReturnType<typeof vi.fn>
const mockedToastInfo = toast.info as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useNotesStore.setState({ saveStatus: 'idle', loadFailed: false, lastMutationAt: 0 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAutoSave · 保存失败接系统通知（notifyWhenBackground 不再是死设置）', () => {
  it('重试耗尽后既弹应用内 toast，也调用 notify（主进程按开关与前台状态决定是否真弹）', async () => {
    // saveNotes 每次都落失败分支：这是最快构造「3 次重试全失败」的路径
    useNotesStore.setState({
      saveNotes: vi.fn(async () => {
        useNotesStore.setState({ saveStatus: 'error' })
      }) as never,
    })

    renderHook(() => useAutoSave(5))
    act(() => {
      useNotesStore.setState({ lastMutationAt: Date.now() })
    })

    await waitFor(
      () => expect(mockedNotify).toHaveBeenCalledTimes(1),
      { timeout: 5000 },
    )
    expect(mockedNotify).toHaveBeenCalledWith({
      title: '笔记保存失败',
      body: expect.stringContaining('重试 3 次'),
    })
    expect(mockedToastError).toHaveBeenCalledWith(
      '笔记保存失败，请检查磁盘空间或数据文件是否被占用',
    )
  })

  it('数据加载失败时直接跳过重试，不发通知', async () => {
    const saveSpy = vi.fn(async () => undefined)
    useNotesStore.setState({ saveNotes: saveSpy as never, loadFailed: true })

    renderHook(() => useAutoSave(5))
    act(() => {
      useNotesStore.setState({ lastMutationAt: Date.now() })
    })
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(saveSpy).not.toHaveBeenCalled()
    expect(mockedNotify).not.toHaveBeenCalled()
  })
})

describe('useAppInit · 启动静默检查一次更新（D3）', () => {
  function renderInit(): void {
    renderHook(() => useAppInit({ onError: vi.fn() }))
  }

  it('4 秒后检查一次；有新版只 toast（不弹窗、不下载）', async () => {
    vi.useFakeTimers()
    renderInit()

    expect(mockedCheck).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(4200)
    })

    expect(mockedCheck).toHaveBeenCalledTimes(1)
    expect(mockedToastInfo).toHaveBeenCalledWith(
      expect.stringContaining('发现新版本 0.2.0'),
      8000,
    )
  })

  it('离线 / 检查失败：静默跳过，不打扰用户', async () => {
    mockedCheck.mockRejectedValueOnce(new Error('offline'))
    vi.useFakeTimers()
    renderInit()

    await act(async () => {
      vi.advanceTimersByTime(4200)
    })

    expect(mockedCheck).toHaveBeenCalledTimes(1)
    expect(mockedToastInfo).not.toHaveBeenCalled()
  })

  it('已是最新版本不发任何提示', async () => {
    mockedCheck.mockResolvedValueOnce({ ok: true, current: '0.1.0', hasUpdate: false })
    vi.useFakeTimers()
    renderInit()

    await act(async () => {
      vi.advanceTimersByTime(4200)
    })

    expect(mockedCheck).toHaveBeenCalledTimes(1)
    expect(mockedToastInfo).not.toHaveBeenCalled()
  })
})
