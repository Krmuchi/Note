import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarHeader } from '@/components/layout/SidebarHeader'
import { getUIState, uiActions } from '@/hooks/useUIState'

/**
 * P1-4 侧栏头部语义分离 + P1-12 快速打开的鼠标入口。
 * 旧实现是一个受控 input，却在 onClick 里打开全局搜索面板并抢走焦点 ——
 * 看着能输入、实际一个字都打不进去，还和下面的树过滤框同占位文案。
 */

const renderHeader = (searchText = ''): { onSearchPanelOpen: ReturnType<typeof vi.fn>; onSearchChange: ReturnType<typeof vi.fn> } => {
  const onSearchPanelOpen = vi.fn();
  const onSearchChange = vi.fn();
  render(
    <SidebarHeader
      searchText={searchText}
      onSearchChange={onSearchChange}
      onSearchPanelOpen={onSearchPanelOpen}
      activeNotebookId="nb1"
    />,
  );
  return { onSearchPanelOpen, onSearchChange };
};

describe('SidebarHeader（P1-4 / P1-12）', () => {
  beforeEach(() => {
    uiActions.setShowQuickOpen(false);
  });

  it('头部是按钮式全局搜索入口，不再渲染那个抢焦点的输入框', () => {
    const { onSearchPanelOpen } = renderHeader();
    // 就地过滤框在 DocsSidebar 里（文案「过滤当前知识库文档…」），这里不该再有 input
    expect(document.querySelector('input')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '打开全局搜索' }));
    expect(onSearchPanelOpen).toHaveBeenCalledTimes(1);
  });

  it('快速打开有鼠标入口，点击置起 ui 开关（App 订阅后渲染面板）', () => {
    renderHeader();
    const btn = screen.getByRole('button', { name: '快速打开文档' });
    expect(getUIState().showQuickOpen).toBe(false);
    fireEvent.click(btn);
    expect(getUIState().showQuickOpen).toBe(true);
  });

  it('文档树过滤词可见且可一键清除', () => {
    const { onSearchChange } = renderHeader('会议');
    const clear = screen.getByRole('button', { name: '清除文档过滤：会议' });
    fireEvent.click(clear);
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('没有过滤词时不渲染清除按钮', () => {
    renderHeader();
    expect(screen.queryByRole('button', { name: /清除文档过滤/ })).toBeNull();
  });
});
