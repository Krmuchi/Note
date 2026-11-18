import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocTree } from '@/components/layout/DocTree'
import { useNotesStore } from '@/store'
import type { NoteDoc, Notebook } from '@/types'

/**
 * P0-2 全层级过滤 / P1-11 行内操作的键盘入口 / P1-13 右键建子文档 / P2-14 树里定位。
 * 旧实现逐层过滤：折叠层里的文档搜不到、过滤无结果时整块空白，
 * 而行内 4 个操作按钮按悬停条件渲染，键盘用户没有任何入口。
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

const treeNotebook: Notebook = {
  id: 'nb1',
  title: '学习笔记',
  docs: [
    doc({ id: 'a', title: '父文档' }),
    doc({ id: 'a1', title: '子文档', parentId: 'a' }),
    doc({ id: 'b', title: '另一个文档' }),
  ],
}

interface RenderOptions {
  searchText?: string;
  tagFilter?: string[];
  activeNotebook?: Notebook;
}

type TreeRenderResult = ReturnType<typeof render> & {
  onViewDoc: ReturnType<typeof vi.fn>;
  onClearFilter: ReturnType<typeof vi.fn>;
  tree: HTMLElement;
  props: Parameters<typeof DocTree>[0];
};

const renderTree = (options: RenderOptions = {}): TreeRenderResult => {
  const onViewDoc = vi.fn();
  const onClearFilter = vi.fn();
  const props = {
    activeNotebook: options.activeNotebook ?? treeNotebook,
    searchText: options.searchText ?? '',
    tagFilter: options.tagFilter,
    sortMode: 'manual' as const,
    onViewDoc,
    onMoveRequest: vi.fn(),
    onClearFilter,
  };
  const view = render(<DocTree {...props} />);
  return { ...view, onViewDoc, onClearFilter, tree: screen.getByRole('tree'), props };
};

const rowIds = (): string[] =>
  Array.from(document.querySelectorAll('.doc-item')).map((el) => el.getAttribute('data-doc-id') ?? '');

beforeEach(() => {
  localStorage.clear();
  useNotesStore.setState({
    notebooks: [treeNotebook],
    trash: [],
    tags: [],
    searchHistory: [],
    activeNotebookId: 'nb1',
    activeDocId: 'a',
  });
});

describe('P0-2 全层级过滤', () => {
  it('折叠层里的文档也搜得到（旧实现只筛当前展开层）', () => {
    renderTree({ searchText: '子文档' });
    // a1 是 a 的子文档、a 默认收起 —— 旧实现这里一行都搜不出来
    expect(rowIds()).toContain('a1');
    expect(rowIds()).not.toContain('b');
  });

  it('未命中的祖先作为路径上下文显示，命中的子项标出父路径', () => {
    renderTree({ searchText: '子文档' });
    const ancestor = document.querySelector('[data-doc-id="a"]');
    const match = document.querySelector('[data-doc-id="a1"]');
    expect(ancestor?.className).toContain('doc-item-context');
    expect(match?.querySelector('.doc-context-path')?.textContent).toContain('父文档');
  });

  it('搜索词与标签同时生效（父级靠标签、子级靠标题时父级不出现）', () => {
    const tagged: Notebook = {
      id: 'nb1',
      title: '学习笔记',
      docs: [
        doc({ id: 'p', title: '项目' }),
        doc({ id: 'c', title: '会议', parentId: 'p', tags: ['t1'] }),
        doc({ id: 'd', title: '闲聊', parentId: 'p' }),
      ],
    };
    renderTree({ activeNotebook: tagged, searchText: '会', tagFilter: ['t1'] });
    expect(rowIds()).toEqual(['p', 'c']);
  });

  it('过滤无结果时空态给出「清除筛选」出口', () => {
    const { onClearFilter } = renderTree({ searchText: '根本不存在的词' });
    expect(screen.getByText('没有匹配的文档')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /清除筛选/ }));
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });

  it('过滤时记下祖先展开态：清掉筛选后那条链仍然开着', () => {
    const view = renderTree({ searchText: '子文档' });
    expect(rowIds()).toContain('a1');
    view.rerender(<DocTree {...view.props} searchText="" />);
    expect(rowIds()).toContain('a1');
    expect(document.querySelector('[data-doc-id="a"]')?.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('P1-11 行内操作的键盘入口', () => {
  it('Shift+F10 打开行菜单，四个行内操作都在里面', () => {
    const { tree } = renderTree();
    tree.focus();
    fireEvent.keyDown(tree, { key: 'F10', shiftKey: true });
    const menu = screen.getByRole('menu');
    const labels = Array.from(menu.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toContain('收藏');
    expect(labels).toContain('置顶');
    expect(labels).toContain('移动到');
    expect(labels).toContain('删除');
  });

  it('单独的 F10 不打开菜单（留给应用菜单栏）', () => {
    const { tree } = renderTree();
    tree.focus();
    fireEvent.keyDown(tree, { key: 'F10' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('操作按钮常驻挂载，可见性交给 CSS（不再依赖鼠标悬停才进 DOM）', () => {
    renderTree();
    const row = document.querySelector('[data-doc-id="a"]');
    expect(row?.querySelectorAll('.doc-action-btn').length).toBe(4);
  });
});

describe('P1-13 右键菜单新建子文档', () => {
  it('菜单键打开菜单并能直接建子文档', () => {
    const { tree, onViewDoc } = renderTree();
    tree.focus();
    fireEvent.keyDown(tree, { key: 'ContextMenu' });
    const before = useNotesStore.getState().notebooks[0].docs.length;
    fireEvent.click(screen.getByRole('menuitem', { name: /在此新建子文档/ }));

    const docs = useNotesStore.getState().notebooks[0].docs;
    expect(docs.length).toBe(before + 1);
    const created = docs[docs.length - 1];
    expect(created.parentId).toBe('a');
    expect(created.title).toBe('未命名文档');
    expect(onViewDoc).toHaveBeenCalledWith('nb1', created.id);
  });
});

describe('P2-14 打开文档后在树里定位', () => {
  const deepNotebook: Notebook = {
    id: 'nb1',
    title: '学习笔记',
    docs: [
      doc({ id: 'root', title: '根文档' }),
      doc({ id: 'mid', title: '中层', parentId: 'root' }),
      doc({ id: 'leaf', title: '叶子', parentId: 'mid' }),
    ],
  };

  it('当前文档在折叠层级里时，自动展开全部祖先', () => {
    useNotesStore.setState({ activeDocId: 'leaf', notebooks: [deepNotebook] });
    render(
      <DocTree
        activeNotebook={deepNotebook}
        searchText=""
        sortMode="manual"
        onViewDoc={vi.fn()}
        onMoveRequest={vi.fn()}
      />,
    );
    expect(document.querySelector('[data-doc-id="leaf"]')).not.toBeNull();
    expect(document.querySelector('[data-doc-id="mid"]')?.getAttribute('aria-expanded')).toBe('true');
  });
});
