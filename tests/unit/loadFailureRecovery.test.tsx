import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

vi.mock('@/services/storage', () => ({
  loadAppStore: vi.fn(async () => ({
    ok: true,
    data: { notebooks: [], trash: [], tags: [], searchHistory: [] },
  })),
  saveAppStore: vi.fn(async (payload: unknown) => payload),
  getAppInfo: vi.fn(async () => ({
    ok: true,
    info: { version: '0.1.0', dataPath: 'C:/u/notes-data.json', dataDir: 'C:/u', backupDir: 'C:/u/backups' },
  })),
  listLocalBackups: vi.fn(async () => ({ ok: true, backups: [] })),
  openDataDir: vi.fn(async () => ({ ok: true })),
  restoreLocalBackup: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/utils/clipboard', () => ({ copyToClipboard: vi.fn(async () => true) }))

import LoadFailureDialog from '@/components/dialogs/LoadFailureDialog'
import ConfirmDialog from '@/components/dialogs/ConfirmDialog'
import SaveIndicator from '@/components/layout/SaveIndicator'
import { useNotesStore } from '@/store'
import { confirmAction, useConfirmAction } from '@/hooks/useConfirmAction'
import {
  isLoadFailureMinimized,
  setLoadFailureMinimized,
} from '@/services/loadFailureUi'
import { subscribeToast } from '@/services/toast'
import type { ToastMessage } from '@/services/toast'

/**
 * 数据加载失败恢复出口的回归（UI 审计缺陷 2 + 缺陷 4 的让位部分）。
 *
 * 旧实现的两个数据丢失/卡死路径：
 * 1. 「稍后处理」把唯一恢复弹窗一次性销毁，此后再无入口；loadFailed 期间
 *    一切保存被拦截，用户继续写的内容全部不落盘，点「保存失败·重试」也静默无效。
 * 2. LoadFailureDialog 在 capture 阶段无条件吞 Esc，从它里面叠出的 ConfirmDialog
 *    （从备份恢复的确认框）永远收不到 Esc，无法取消。
 */

/** 模拟 App 层的确认框宿主（全局单例 ConfirmDialog） */
function ConfirmHost(): React.JSX.Element | null {
  const { confirmConfig, handleConfirm, handleCancel } = useConfirmAction()
  if (!confirmConfig) return null
  return (
    <ConfirmDialog
      title={confirmConfig.title}
      message={confirmConfig.message}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )
}

beforeEach(() => {
  setLoadFailureMinimized(false)
  useNotesStore.setState({
    loadFailed: true,
    loadError: '数据文件损坏',
    saveStatus: 'error',
    lastSavedAt: null,
    notebooks: [],
    trash: [],
    tags: [],
    searchHistory: [],
    quickNotes: [],
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('LoadFailureDialog：稍后处理 = 最小化，不是销毁', () => {
  it('点「稍后处理」后出现常驻横幅，点「去处理」恢复完整弹窗', () => {
    render(<LoadFailureDialog message="数据文件损坏" />)
    expect(screen.getByRole('dialog', { name: '数据加载失败' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '稍后处理' }))
    // 弹窗收起，但横幅常驻（恢复入口永不消失）
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(isLoadFailureMinimized()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '去处理' }))
    expect(screen.getByRole('dialog', { name: '数据加载失败' })).toBeTruthy()
    expect(isLoadFailureMinimized()).toBe(false)
  })

  it('无确认框时 Esc 不关闭弹窗（唯一出口不允许被 Esc 关掉）', () => {
    render(<LoadFailureDialog message="数据文件损坏" />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: '数据加载失败' })).toBeTruthy()
  })

  it('叠着确认框时 Esc 交给确认框（取消恢复），不被吞掉', () => {
    render(
      <>
        <LoadFailureDialog message="数据文件损坏" />
        <ConfirmHost />
      </>,
    )
    act(() => {
      confirmAction({
        title: '从备份恢复',
        message: '将覆盖当前数据文件',
        onConfirm: vi.fn(),
      })
    })
    expect(screen.getByRole('dialog', { name: '从备份恢复' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    // 确认框被取消，加载失败弹窗仍在
    expect(screen.queryByRole('dialog', { name: '从备份恢复' })).toBeNull()
    expect(screen.getByRole('dialog', { name: '数据加载失败' })).toBeTruthy()
  })
})

describe('SaveIndicator：加载失败态是恢复入口，不是死按钮', () => {
  it('loadFailed 时点击重新展开恢复弹窗（即使已最小化）', () => {
    setLoadFailureMinimized(true)
    render(
      <>
        <SaveIndicator collapsed={false} />
        <LoadFailureDialog message="数据文件损坏" />
      </>,
    )
    // 最小化态：只有横幅
    expect(screen.getByRole('alert')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /数据加载失败/ }))
    expect(screen.getByRole('dialog', { name: '数据加载失败' })).toBeTruthy()
    expect(isLoadFailureMinimized()).toBe(false)
  })

  it('普通保存失败（非 loadFailed）点击仍走重试保存', async () => {
    useNotesStore.setState({ loadFailed: false, loadError: null })
    render(<SaveIndicator collapsed={false} />)
    fireEvent.click(screen.getByRole('button', { name: /保存失败/ }))
    // saveNotes 是异步的，等微任务清空
    await vi.waitFor(() => {
      expect(useNotesStore.getState().saveStatus).toBe('saved')
    })
  })
})

describe('saveNotes：loadFailed 拦截时给出明确提示', () => {
  it('不再静默 return，发射 error toast 引导恢复', async () => {
    const messages: ToastMessage[] = []
    const unsubscribe = subscribeToast((m) => {
      messages.push(m)
      return 'test-id'
    })
    try {
      await useNotesStore.getState().saveNotes()
      expect(useNotesStore.getState().saveStatus).toBe('error')
      expect(messages.some(m => m.type === 'error' && m.message.includes('数据加载失败'))).toBe(true)
    } finally {
      unsubscribe()
    }
  })
})