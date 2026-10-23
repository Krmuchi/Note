import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * 主题 / 字体 store 的回归测试。
 *
 * 锁定 BUG-2：主题与字体必须在首次渲染前由 initTheme() 应用到 <html> 上，
 * 而不是等 EditorHeader / SettingsPanel 挂载后才生效（那样重启后会丢失）。
 */

async function freshStore(): Promise<typeof import('@/shared/hooks')> {
  vi.resetModules()
  return await import('@/shared/hooks')
}

function mockSystemDark(dark: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: dark && query.includes('prefers-color-scheme: dark'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as MediaQueryList)
}

describe('主题 store', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-font')
    document.getElementById('custom-primary-palette')?.remove()
    vi.restoreAllMocks()
    mockSystemDark(false)
  })

  it('initTheme 在渲染前把持久化主题与字体写到 <html>（BUG-2 回归）', async () => {
    localStorage.setItem('notes-theme', 'dark')
    localStorage.setItem('notes-font', 'lxgw-wenkai')
    const store = await freshStore()

    // 仅导入模块不应有副作用（避免依赖某个组件挂载才会生效）
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()

    store.initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-font')).toBe('lxgw-wenkai')
  })

  it('initTheme 幂等，且恢复自定义主色', async () => {
    localStorage.setItem('notes-custom-primary-color', '#3366ff')
    const store = await freshStore()
    store.initTheme()
    store.initTheme()
    expect(document.getElementById('custom-primary-palette')).not.toBeNull()
  })

  it('setTheme / setFont 立即生效并持久化', async () => {
    const store = await freshStore()
    store.initTheme()
    store.setTheme('green')
    store.setFont('mono')
    expect(document.documentElement.getAttribute('data-theme')).toBe('green')
    expect(document.documentElement.getAttribute('data-font')).toBe('mono')
    expect(localStorage.getItem('notes-theme')).toBe('green')
    expect(localStorage.getItem('notes-font')).toBe('mono')
  })

  it('选择「跟随系统」时按系统偏好解析，且持久化的是 system 本身', async () => {
    mockSystemDark(true)
    const store = await freshStore()
    store.initTheme()
    store.setTheme('system')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('notes-theme')).toBe('system')
    expect(store.getResolvedTheme()).toBe('dark')
  })

  it('toggleTheme 从解析后的主题出发，暗色预设不会切错方向', async () => {
    const store = await freshStore()
    store.initTheme()
    store.setTheme('purple-dark')
    store.toggleTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    store.toggleTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('持久化值非法时回落默认主题与字体', async () => {
    localStorage.setItem('notes-theme', 'not-a-theme')
    localStorage.setItem('notes-font', 'comic-sans')
    const store = await freshStore()
    store.initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-font')).toBe('sans')
  })
})
