import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TabBar from '@/components/layout/TabBar'
import { useNotesStore } from '@/store'
import type { NoteDoc, Notebook } from '@/types'

/**
 * P1-10：标签栏的键盘可达性。
 * 旧版只有当前标签 tabIndex=0、且只处理 Enter/Space —— 其余标签键盘完全够不着。
 */

const doc = (id: string, title: string): NoteDoc => ({
  id,
  title,
  content: '',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const notebook: Notebook = {
  id: 'nb1',
  title: '知识库',
  docs: [doc('d1', '文档一'), doc('d2', '文档二'), doc('d3', '文档三')],
}

beforeEach(() => {
  useNotesStore.setState({
    notebooks: [notebook],
    openTabs: [
      { notebookId: 'nb1', docId: 'd1' },
      { notebookId: 'nb1', docId: 'd2' },
      { notebookId: 'nb1', docId: 'd3' },
    ],
    activeNotebookId: 'nb1',
    activeDocId: 'd1',
  });
});

const renderBar = (): { onActivate: ReturnType<typeof vi.fn> } => {
  const onActivate = vi.fn();
  render(<TabBar onActivate={onActivate} />);
  return { onActivate };
};

const activeTab = (): HTMLElement =>
  document.querySelector('[role="tab"][tabindex="0"]') as HTMLElement

describe('TabBar 键盘导航（P1-10）', () => {
  it('渲染为 tablist，每个标签都带 data 标识', () => {
    renderBar();
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(document.querySelectorAll('[data-tab-key]')).toHaveLength(3);
  });

  it('←/→ 在标签间移动焦点并切换（自动激活）', () => {
    const { onActivate } = renderBar();
    const tab = activeTab();
    tab.focus();

    fireEvent.keyDown(tab, { key: 'ArrowRight' });
    expect(onActivate).toHaveBeenLastCalledWith('nb1', 'd2');
    expect(document.activeElement?.getAttribute('data-tab-key')).toBe('nb1:d2');

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(onActivate).toHaveBeenLastCalledWith('nb1', 'd3');

    // 到尾部回绕到第一个
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(onActivate).toHaveBeenLastCalledWith('nb1', 'd1');

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(onActivate).toHaveBeenLastCalledWith('nb1', 'd3');
  });

  it('Home/End 跳到首尾标签', () => {
    const { onActivate } = renderBar();
    const tab = activeTab();
    tab.focus();
    fireEvent.keyDown(tab, { key: 'End' });
    expect(onActivate).toHaveBeenLastCalledWith('nb1', 'd3');
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(onActivate).toHaveBeenLastCalledWith('nb1', 'd1');
  });

  it('Delete 关闭聚焦的标签（行内等价于全局 Ctrl+W）', () => {
    renderBar();
    const tab = activeTab();
    tab.focus();
    fireEvent.keyDown(tab, { key: 'ArrowRight' });
    expect(useNotesStore.getState().openTabs).toHaveLength(3);

    fireEvent.keyDown(document.activeElement as Element, { key: 'Delete' });
    expect(useNotesStore.getState().openTabs.map((t) => t.docId)).toEqual(['d1', 'd3']);
  });
});
