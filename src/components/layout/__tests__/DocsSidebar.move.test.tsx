import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocsSidebar } from '@/components/layout/DocsSidebar'
import { useNotesStore } from '@/store'
import type { NoteDoc, Notebook } from '@/types'

/**
 * P0-3 跨库移动连同子树 / P1-13 移动对话框两级选择 + 父子同选去重。
 * 旧对话框只列知识库、点一下就直接搬，既不告知子文档、也没法选落到哪个父级下。
 */

const doc = (over: Partial<NoteDoc> & { id: string; title: string }): NoteDoc => ({
  content: '',
  parentId: null,
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const sourceNotebook: Notebook = {
  id: 'nb1',
  title: '源知识库',
  docs: [
    doc({ id: 'p', title: '父文档' }),
    doc({ id: 'c', title: '子文档', parentId: 'p' }),
  ],
}

const targetNotebook: Notebook = {
  id: 'nb2',
  title: '目标知识库',
  docs: [doc({ id: 'tp', title: '目标文档' })],
}

beforeEach(() => {
  localStorage.clear();
  useNotesStore.setState({
    notebooks: [sourceNotebook, targetNotebook],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'p',
    openTabs: [],
  });
});

const renderSidebar = (): { onViewDoc: ReturnType<typeof vi.fn> } => {
  const onViewDoc = vi.fn();
  render(<DocsSidebar searchText="" onSearchChange={vi.fn()} onViewDoc={onViewDoc} />);
  return { onViewDoc };
};

const openMoveDialogFor = (docId: string): HTMLElement => {
  const row = document.querySelector('[data-doc-id="' + docId + '"]');
  expect(row).not.toBeNull();
  fireEvent.contextMenu(row as Element);
  fireEvent.click(screen.getByRole('menuitem', { name: '移动到' }));
  return screen.getByRole('dialog');
};

describe('P0-3 / P1-13 移动对话框', () => {
  it('打开时如实告知会连带多少子文档，并提供两级选择', () => {
    renderSidebar();
    const dialog = openMoveDialogFor('p');

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('包含 1 个子文档');
    expect(screen.getByText('第一步：选择目标知识库')).toBeTruthy();
    expect(screen.getByText('第二步：放入目标位置')).toBeTruthy();
    // 目标库的文档出现在位置下拉里（旧版只有知识库一级）
    expect(screen.getByRole('option', { name: '目标文档' })).toBeTruthy();
  });

  it('选择目标库与父级后点「移动」：整棵子树过去并落到指定父级下', () => {
    renderSidebar();
    openMoveDialogFor('p');

    fireEvent.click(screen.getByRole('button', { name: /目标知识库/ }));
    fireEvent.change(screen.getByLabelText('放入目标位置'), { target: { value: 'tp' } });
    // 文档行里也有一个 aria-label="移动" 的行内按钮，这里必须限定在对话框内
    fireEvent.click(screen.getByRole('dialog').querySelector('button.btn-primary') as Element);

    const state = useNotesStore.getState();
    const source = state.notebooks.find((nb) => nb.id === 'nb1');
    const target = state.notebooks.find((nb) => nb.id === 'nb2');
    expect(source?.docs).toHaveLength(0);
    expect(target?.docs.map((d) => d.id).sort()).toEqual(['c', 'p', 'tp']);
    expect(target?.docs.find((d) => d.id === 'p')?.parentId).toBe('tp');
    expect(target?.docs.find((d) => d.id === 'c')?.parentId).toBe('p');
    // 对话框关闭
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('父子同选时只搬顶层一篇（去重），提示里按子树计数', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: '多选' }));
    // 子文档默认收起：先展开才勾得到它（也顺带验证多选态下展开仍然可用）
    fireEvent.click(document.querySelector('[data-doc-id="p"] .doc-expand-icon') as Element);
    fireEvent.click(screen.getByLabelText('选择 父文档'));
    fireEvent.click(screen.getByLabelText('选择 子文档'));
    fireEvent.click(screen.getByRole('button', { name: '移动到' }));

    const dialog = screen.getByRole('dialog');
    // 选中 2 篇（父 + 子）→ 去重后只剩顶层 1 篇，标题因此走单数分支
    expect(dialog.querySelector('h3')?.textContent).toBe('移动文档');
    expect(dialog.textContent).toContain('包含 1 个子文档');

    fireEvent.click(screen.getByRole('button', { name: /目标知识库/ }));
    fireEvent.click(dialog.querySelector('button.btn-primary') as Element);
    const target = useNotesStore.getState().notebooks.find((nb) => nb.id === 'nb2');
    // 父子都过去了，而且没有被搬两次（子文档仍挂在父文档下）
    expect(target?.docs).toHaveLength(3);
    expect(target?.docs.find((d) => d.id === 'c')?.parentId).toBe('p');
  });
});
