import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * 设置面板 · 界面缩放控件（P1-6）、设置内搜索、页签语义与异步读取中文案（P1-9）。
 * 主进程侧「写盘后 setZoomFactor」另有 tests/unit/integrationHandlers.zoom.test.ts。
 */

vi.mock('@/services/storage', () => ({
  isWebMode: false,
  getAppInfo: vi.fn(() => new Promise(() => {})), // 桌面版：信息未到位（永不 resolve）
  getAppSettings: vi.fn(async () => ({
    ok: true,
    settings: {
      closeToTray: false,
      globalQuickNote: false,
      autoLaunch: false,
      notifyWhenBackground: true,
      zoomFactor: 1,
    },
  })),
  // 注意：组件里 import 的是 setAppSettings（本地别名 saveAppSettings），
  // mock 的 key 必须用模块真实导出名，否则 vitest 会报「未定义的导出」
  setAppSettings: vi.fn(async (patch: Record<string, unknown>) => ({
    ok: true,
    settings: {
      closeToTray: false,
      globalQuickNote: false,
      autoLaunch: false,
      notifyWhenBackground: true,
      zoomFactor: 1,
      ...patch,
    },
  })),
  openDataDir: vi.fn(async () => ({ ok: true })),
  openExternal: vi.fn(async () => ({ ok: true })),
  listLocalBackups: vi.fn(async () => ({ ok: true, backups: [] })),
  onBackupCreated: vi.fn(() => () => {}),
  readCrashLog: vi.fn(async () => ({ ok: true, latest: null, entries: [], summary: '（无）' })),
  clearCrashLog: vi.fn(async () => ({ ok: true })),
  checkForUpdate: vi.fn(async () => ({ ok: true, hasUpdate: false })),
  copyToClipboard: vi.fn(async () => true),
  getFileAssociation: vi.fn(async () => ({ ok: true, supported: false, enabled: false })),
  setFileAssociation: vi.fn(async () => ({ ok: true, supported: false, enabled: false })),
}))

vi.mock('@/hooks/useConfirmAction', () => ({ confirmAction: vi.fn() }))

import SettingsPanel from '@/components/settings/SettingsPanel'
import { setAppSettings } from '@/services/storage'
import { uiActions } from '@/hooks/useUIState'

const mockedSave = setAppSettings as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  // useUIState 是模块级外部 store：不复位的话，上一个用例点过的页签会带到下一个用例
  // （本文件里「切换页签」用例之后，面板默认打开的就是编辑器页签）
  uiActions.setSettingsTab('general')
})

afterEach(() => {
  // 搜索过滤是直接改 DOM 的 hidden 属性：必须复位，避免跨用例污染
  document.querySelectorAll('.settings-panel [hidden]').forEach((el) => el.removeAttribute('hidden'))
})

describe('设置 · 界面缩放控件（P1-6）', () => {
  it('显示当前比例，放大/缩小各写一次并即时更新显示', async () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />)

    await screen.findByText('100%')
    const plus = screen.getByRole('button', { name: '放大界面（10%）' })
    const minus = screen.getByRole('button', { name: '缩小界面（10%）' })
    // 初始 100%：上下都还有余量，两侧按钮都应可用
    expect(minus).toBeEnabled()
    expect(plus).toBeEnabled()

    fireEvent.click(plus)
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith({ zoomFactor: 1.1 }))
    await screen.findByText('110%')

    fireEvent.click(minus)
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith({ zoomFactor: 1 }))
    await screen.findByText('100%')
  })

  it('到达上限 200% 后放大按钮禁用', async () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />)
    await screen.findByText('100%')

    // 逐级点到上限：每级都等显示更新后再点下一级（base 取自渲染状态）
    for (let percent = 110; percent <= 200; percent += 10) {
      const plus = screen.getByRole('button', { name: '放大界面（10%）' })
      expect(plus).toBeEnabled()
      fireEvent.click(plus)
      await screen.findByText(percent + '%')
    }

    expect(screen.getByRole('button', { name: '放大界面（10%）' })).toBeDisabled()
    expect(mockedSave).toHaveBeenLastCalledWith({ zoomFactor: 2 })
  })

  it('写入失败时保留原值（回滚由 IPC 返回的 settings 决定）', async () => {
    mockedSave.mockResolvedValueOnce({ ok: false, error: '写入失败' })
    render(<SettingsPanel isOpen onClose={vi.fn()} />)

    const plus = await screen.findByRole('button', { name: '放大界面（10%）' })
    fireEvent.click(plus)

    await waitFor(() => expect(mockedSave).toHaveBeenCalled())
    await screen.findByText('100%')
  })
})

describe('设置 · 内置搜索（过滤 setting 行）', () => {
  it('命中的分区保留、不命中的行与标题隐藏；清空后全部恢复', async () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />)
    await screen.findByText('界面缩放')

    const input = screen.getByLabelText('搜索设置项')
    fireEvent.change(input, { target: { value: '备份' } })

    // 命中：数据与备份分区
    expect(screen.getByText('数据与备份')).not.toHaveAttribute('hidden')
    expect(screen.getByText('备份目录').closest('.settings-about-row')).not.toHaveAttribute('hidden')
    // 未命中：外观分区的行与标题被隐藏（.settings-item 是 flex，必须靠 [hidden] 覆盖）
    expect(screen.getByText('主题模式').closest('.settings-item')).toHaveAttribute('hidden')
    expect(screen.getByText('外观')).toHaveAttribute('hidden')
    // 跨页签：搜索时「编辑器设置」一并铺开，但没有匹配项 => 整段隐藏。
    // 用 DOM 查（失败时会打印实际的分区标题列表），避免查询器对隐藏节点的过滤影响断言
    const editorTitle = Array.from(
      document.querySelectorAll<HTMLElement>('.settings-section-title'),
    ).find((el) => el.textContent === '编辑器设置')
    expect(editorTitle, '编辑器分区应被一并渲染').toBeTruthy()
    expect(editorTitle?.closest('.settings-section')).toHaveAttribute('hidden')

    fireEvent.change(input, { target: { value: '' } })
    // 当前页签的行与标题全部恢复
    expect(screen.getByText('主题模式').closest('.settings-item')).not.toHaveAttribute('hidden')
    expect(screen.getByText('外观')).not.toHaveAttribute('hidden')
    expect(
      screen.getByText('备份目录').closest('.settings-about-row'),
    ).not.toHaveAttribute('hidden')
    // 为搜索而铺开的「编辑器设置」分区随之收起（当前页签是通用，不为搜索常驻）
    const restoredEditorTitle = Array.from(
      document.querySelectorAll<HTMLElement>('.settings-section-title'),
    ).find((el) => el.textContent === '编辑器设置')
    expect(restoredEditorTitle).toBeUndefined()
  })

  it('搜索到别的页签的设置项（编辑器页签被一并铺开）', async () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />)
    await screen.findByText('界面缩放')

    fireEvent.change(screen.getByLabelText('搜索设置项'), { target: { value: '富文本' } })

    expect(screen.getByText('编辑器设置')).not.toHaveAttribute('hidden')
    expect(screen.getByText('富文本编辑器').closest('.settings-item')).not.toHaveAttribute('hidden')
    // 提示语说明为什么 AI / 快捷键不会自动展开
    expect(screen.getByRole('status')).toHaveTextContent('AI 与快捷键页签含未保存状态')
  })

  it('清除按钮与提示语随查询出现/消失', async () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />)
    await screen.findByText('界面缩放')

    expect(screen.queryByRole('button', { name: '清除设置搜索' })).toBeNull()
    fireEvent.change(screen.getByLabelText('搜索设置项'), { target: { value: '主题' } })
    fireEvent.click(screen.getByRole('button', { name: '清除设置搜索' }))
    expect((screen.getByLabelText('搜索设置项') as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('设置 · 页签语义 / 可访问名 / IA（P2-14）', () => {
  it('页签是 role=tab 并暴露选中态，面板是 tabpanel，关闭按钮有可访问名', async () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />)
    await screen.findByText('界面缩放')

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['⚙️通用', '📝编辑器', '🤖AI', '⌨️快捷键'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')

    const body = document.getElementById('settings-body')
    expect(body?.getAttribute('role')).toBe('tabpanel')
    expect(body?.getAttribute('aria-labelledby')).toBe('settings-tab-general')

    expect(screen.getByRole('button', { name: '关闭设置' })).toBeInTheDocument()
  })

  it('切换页签后选中态与 tabpanel 标签同步', async () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />)
    await screen.findByText('界面缩放')

    fireEvent.click(screen.getByRole('tab', { name: /编辑器/ }))
    expect(screen.getByRole('tab', { name: /编辑器/ })).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('settings-body')?.getAttribute('aria-labelledby')).toBe('settings-tab-editor')
    // 字号下拉有真实 label 关联（读屏此前只念「组合框」）
    expect(screen.getByLabelText('字号大小')).toBeInTheDocument()
  })

  it('字体选择在「通用 → 外观」，并说明作用范围（原在编辑器页签名实不符）', async () => {
    render(<SettingsPanel isOpen onClose={vi.fn()} />)
    const label = await screen.findByText('界面与编辑器字体')

    expect(label.closest('.settings-section')?.querySelector('h3')?.textContent).toBe('外观')
    expect(screen.getByText('同时作用于整个界面与编辑器的正文字体')).toBeInTheDocument()

    // 编辑器页签里不再出现字体网格（避免同一设置两个入口）
    fireEvent.click(screen.getByRole('tab', { name: /编辑器/ }))
    expect(screen.queryByText('界面与编辑器字体')).toBeNull()
  })
})

describe('设置 · 异步信息未到位时的文案（P1-9）', () => {
  it('桌面版读取未完成时显示「读取中…」，不显示「浏览器模式/开发版」', async () => {
    const { container } = render(<SettingsPanel isOpen onClose={vi.fn()} />)
    await screen.findByText('数据与备份')

    const texts = container.textContent ?? ''
    expect(texts).toContain('读取中…')
    expect(texts).not.toContain('浏览器模式（数据存在 IndexedDB）')
    expect(texts).not.toContain('开发版（未打包）')
  })
})
