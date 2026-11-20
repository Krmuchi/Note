import { describe, it, expect, beforeEach } from 'vitest'
import { uiActions, getUIState } from '@/hooks/useUIState'

describe('视图与左菜单同步（P0-1 回收站点了没反应）', () => {
  beforeEach(() => {
    uiActions.reset()
  })

  it('从开始页切回收站：activeLeftMenu 同步为 trash，MainContent 不再被 start 分支拦截', () => {
    uiActions.setActiveLeftMenu('start')
    uiActions.setActiveView('trash')
    expect(getUIState().activeView).toBe('trash')
    expect(getUIState().activeLeftMenu).toBe('trash')
  })

  it('从回收站切回开始页：activeView 复位为 notebooks，footer 高亮不残留', () => {
    uiActions.setActiveView('trash')
    uiActions.setActiveLeftMenu('start')
    expect(getUIState().activeLeftMenu).toBe('start')
    expect(getUIState().activeView).toBe('notebooks')
  })

  it('收藏/最近：两个 setter 任意一个都得到一致状态', () => {
    uiActions.setActiveLeftMenu('favorite')
    expect(getUIState().activeView).toBe('favorite')
    uiActions.setActiveView('recent')
    expect(getUIState().activeLeftMenu).toBe('recent')
  })

  it('小记/标签走左菜单分支时 view 取兜底值 notebooks', () => {
    uiActions.setActiveView('trash')
    uiActions.setActiveLeftMenu('tags')
    expect(getUIState().activeView).toBe('notebooks')
    expect(getUIState().activeLeftMenu).toBe('tags')
  })

  it('showQuickOpen 开关可被任意入口切换（QuickOpen 从此有鼠标入口的基建）', () => {
    expect(getUIState().showQuickOpen).toBe(false)
    uiActions.setShowQuickOpen(true)
    expect(getUIState().showQuickOpen).toBe(true)
    uiActions.reset()
    expect(getUIState().showQuickOpen).toBe(false)
  })
});

describe('启动回位（重启不回上次文档）：restoreLastSessionView', () => {
  beforeEach(() => {
    uiActions.reset()
    uiActions.setActiveLeftMenu('start')
  })

  it('有活动文档且停在开始页：落到文档视图，activeLeftMenu/activeView 成对同步', () => {
    uiActions.restoreLastSessionView(true, false)
    expect(getUIState().activeLeftMenu).toBe('notebooks')
    expect(getUIState().activeView).toBe('notebooks')
  })

  it('没有活动文档：保持开始页（开始页本身就是正确落点）', () => {
    uiActions.restoreLastSessionView(false, false)
    expect(getUIState().activeLeftMenu).toBe('start')
    expect(getUIState().activeView).toBe('notebooks')
  })

  it('全新安装（将弹新手引导）不回位：开始页留给引导当背景', () => {
    uiActions.restoreLastSessionView(true, true)
    expect(getUIState().activeLeftMenu).toBe('start')
  })

  it('用户明确停留过的视图不覆盖：小记/回收站保持原样', () => {
    uiActions.setActiveLeftMenu('note')
    uiActions.restoreLastSessionView(true, false)
    expect(getUIState().activeLeftMenu).toBe('note')
    expect(getUIState().activeView).toBe('notebooks')

    uiActions.setActiveView('trash')
    uiActions.restoreLastSessionView(true, false)
    expect(getUIState().activeLeftMenu).toBe('trash')
    expect(getUIState().activeView).toBe('trash')
  })

  it('回位后用户又切回开始页：再次调用（如重试加载成功）才回位，日常视图不受影响', () => {
    uiActions.restoreLastSessionView(true, false)
    expect(getUIState().activeLeftMenu).toBe('notebooks')
    // 用户手动回开始页后停在小记页
    uiActions.setActiveLeftMenu('note')
    uiActions.restoreLastSessionView(true, false)
    expect(getUIState().activeLeftMenu).toBe('note')
  })
});
