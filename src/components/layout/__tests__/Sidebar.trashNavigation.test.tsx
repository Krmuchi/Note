import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { JSX } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Sidebar } from '@/components/layout/Sidebar'
import { MainContent } from '@/components/app/MainContent'
import { uiActions, useUIState } from '@/hooks/useUIState'

/**
 * P0-1 回归：「更多 → 回收站」从开始页必须真的切过去。
 * 旧实现里 activeLeftMenu 与 activeView 是两个并行状态，MainContent 先判
 * start/note/tags 再判 trash，而 footer 只改 activeView —— 在开始页点回收站毫无反应。
 * useUIState 已做双向同步；这里锁住组件层的实际动线（开始 → 回收站 → 切回 → 再进）。
 */

const noop = vi.fn();

/** 与 App 同款：订阅 UI 状态，Sidebar 的高亮才会跟着变 */
function Shell(): JSX.Element {
  const { activeLeftMenu, activeView } = useUIState();
  return (
    <>
      <Sidebar
        searchText=""
        onSearchChange={noop}
        onSearchPanelOpen={noop}
        activeLeftMenu={activeLeftMenu}
        onLeftMenuChange={(menu) => uiActions.setActiveLeftMenu(menu)}
        activeView={activeView}
        onViewChange={(view) => uiActions.setActiveView(view)}
        tags={[]}
        trash={[]}
        onOpenSettings={noop}
        onOpenHelp={noop}
        onOpenDoc={noop}
      />
      <MainContent
        recentViews={[]}
        activeNotebookId="nb1"
        activeDocId="d1"
        searchText=""
        trash={[]}
        isMobile={false}
        isCompact={false}
        docsSidebarWidth={undefined}
        dragging={null}
        onViewDoc={noop}
        onSearchChange={noop}
        onCreateDoc={noop}
        onCreateNotebook={noop}
        onRestoreFromTrash={noop}
        onDeleteFromTrash={noop}
        onClearTrash={noop}
        onGoToDocs={noop}
        onDocsResizeStart={noop as never}
        onDocsResizeReset={noop}
      />
    </>
  );
}

const openTrashFromMore = (): void => {
  fireEvent.click(screen.getByRole('button', { name: '更多' }));
  fireEvent.click(screen.getByRole('button', { name: /回收站/ }));
};

describe('侧栏：开始页 ↔ 回收站 导航（P0-1 回归）', () => {
  beforeEach(() => {
    // 顺序要紧：setActiveView('notebooks') 会把 leftMenu 归一成 'notebooks'，
    // 所以先设视图、再把左菜单切回开始页（这正是归一化规则要求的组合）
    uiActions.setActiveView('notebooks');
    uiActions.setActiveLeftMenu('start');
  });

  it('开始页点「更多 → 回收站」能切过去，切回后再进仍然有效', async () => {
    render(<Shell />);
    await waitFor(() => expect(document.querySelector('.start-page')).not.toBeNull());

    openTrashFromMore();
    expect(await screen.findByText('🗑️ 回收站')).toBeTruthy();
    // 关键断言：主区不再是开始页（旧实现这里纹丝不动）
    expect(document.querySelector('.start-page')).toBeNull();

    // 切回开始页，再进一次回收站（两个状态没有被单向带偏）
    fireEvent.click(screen.getByRole('button', { name: '开始' }));
    await waitFor(() => expect(document.querySelector('.start-page')).not.toBeNull());
    expect(document.querySelector('.trash-panel')).toBeNull();

    openTrashFromMore();
    expect(await screen.findByText('🗑️ 回收站')).toBeTruthy();
    expect(document.querySelector('.start-page')).toBeNull();
  });
});
