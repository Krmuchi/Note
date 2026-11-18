import React, { Suspense, lazy, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNotesStore } from '@/store';
import { DocTree } from './DocTree';
import { ContextMenu } from '@/components/common/ContextMenu';
import { toast, toastWithUndo } from '@/components/common/Toast';
import { setPendingBatchUndo, undoBatch } from '@/utils/batchUndo';
import { EmptyState } from '@/components/common/EmptyState';
import { IconDocument, IconChevronRight } from '@/components/common/Icon';
import { Loading } from '@/components/common/Loading';
import {
  DOC_SORT_MODES,
  collectSubtreeIds,
  dedupeToTopLevel,
  readDocSortMode,
  writeDocSortMode,
  type DocSortMode,
} from '@/utils/docSort';
import { flattenDocs } from '@/utils/docNavigation';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { applyTemplateVars } from '@/utils/templateVars';
import type { Template } from '@/types/templates';

// 模板中心体积不小（内置模板数据 + Markdown 预览），只在真正点开时才加载
const TemplateCenter = lazy(() => import('@/components/templates/TemplateCenter'));

interface DocsSidebarProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  onViewDoc: (notebookId: string, docId: string) => void;
  width?: number;
  /** 窄窗口/移动端：文档列表默认折叠为一条标题栏，点开后才占位 */
  mobile?: boolean;
  /**
   * 紧凑窗口（< BREAKPOINT_COMPACT）：文档列表收起为 44px 窄条。
   *
   * 与 mobile 的区别：移动端是整条横栏、展开后覆盖式；紧凑窗口是竖条，
   * 展开后仍占一列。窄窗口下三栏并排会把编辑区压到 400px 以内，
   * 语雀的做法同样是"先收起文档列表，把宽度还给正文"。
   */
  compact?: boolean;
}

export const DocsSidebar: React.FC<DocsSidebarProps> = ({
  searchText,
  onSearchChange,
  onViewDoc,
  width,
  mobile = false,
  compact = false,
}) => {
  const { notebooks, tags, activeNotebookId, createDoc, moveDocToNotebook, updateDoc } =
    useNotesStore(
      useShallow((s) => ({
        notebooks: s.notebooks,
        tags: s.tags,
        activeNotebookId: s.activeNotebookId,
        createDoc: s.createDoc,
        moveDocToNotebook: s.moveDocToNotebook,
        updateDoc: s.updateDoc,
      }))
    );

  // 标签过滤（K2）：当前按单个标签过滤，够用且不抢空间；空数组表示不过滤
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const handleTagFilterChange = useCallback((tagId: string) => {
    setTagFilter(tagId ? [tagId] : []);
  }, []);

  // 排序策略（T2）：偏好存在 localStorage，属于"本机视图偏好"，不进 notes-data.json
  const [sortMode, setSortMode] = useState<DocSortMode>(() => readDocSortMode());
  const handleSortChange = useCallback((mode: DocSortMode) => {
    setSortMode(mode);
    writeDocSortMode(mode);
  }, []);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  /** 待移动的文档（已按「父子同选」去重到顶层）：单个与批量共用同一个对话框 */
  const [moveDocIds, setMoveDocIds] = useState<string[]>([]);
  /** P1-13 移动对话框的两级选择：目标知识库 + 目标库里的父级（null = 放到根级） */
  const [moveTargetNotebookId, setMoveTargetNotebookId] = useState<string | null>(null);
  const [moveParentId, setMoveParentId] = useState<string | null>(null);

  /** 「新建文档」下拉：空白 / 从模板（T4） */
  const [showAddMenu, setShowAddMenu] = useState(false);
  /** 下拉锚点：贴着触发按钮右缘展开（ContextMenu 负责边界钳制） */
  const [addMenuPos, setAddMenuPos] = useState({ x: 0, y: 0 });
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const requestMove = useCallback((docIds: string[]) => {
    if (docIds.length === 0) return;
    /*
     * P0-3：父子同选时只搬顶层 —— 子文档会随父文档一起过去（coreSlice 搬整棵
     * 子树），再搬一次已不存在的子文档只会搬出半个结构。
     * 这里按需读快照而不是订阅：本回调只在打开对话框那一刻用到这些数据。
     */
    const state = useNotesStore.getState();
    const sourceId = state.activeNotebookId;
    const source = state.notebooks.find((nb) => nb.id === sourceId) ?? null;
    const topIds = dedupeToTopLevel(docIds, source?.docs ?? []);
    if (topIds.length === 0) return;
    const firstTarget = state.notebooks.find((nb) => nb.id !== sourceId) ?? null;
    setMoveDocIds(topIds);
    setMoveTargetNotebookId(firstTarget?.id ?? null);
    setMoveParentId(null);
    setShowMoveDialog(true);
  }, []);
  /* P1-3：移动对话框与模板选择两个浮层的焦点陷阱 + Esc 关闭（useFocusTrap 单一实现） */
  const moveDialogRef = useFocusTrap<HTMLDivElement>(showMoveDialog, () => setShowMoveDialog(false));
  const templateModalRef = useFocusTrap<HTMLDivElement>(showTemplateModal, () => setShowTemplateModal(false));

  const [isCompact, setIsCompact] = useState(false);
  /** 移动端文档列表展开态（默认收起，避免挤压编辑器） */
  const [mobileExpanded, setMobileExpanded] = useState(false);
  /** 紧凑窗口下文档列表是否展开（默认收起为窄条） */
  const [compactExpanded, setCompactExpanded] = useState(false);

  /*
   * 离开紧凑区间后复位，下次再进入时仍是"收起"状态（不会记住上次的临时展开）。
   * 用"渲染期按 props 变化调整 state"的官方写法，而不是 useEffect：
   * 在 effect 里同步 setState 会多一次渲染（lint 规则 react-hooks/set-state-in-effect 会拦）。
   */
  const [prevCompact, setPrevCompact] = useState(compact);
  if (prevCompact !== compact) {
    setPrevCompact(compact);
    if (!compact) setCompactExpanded(false);
  }
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.offsetWidth;
      setIsCompact(w < 250);
    });
    observer.observe(el);
    setIsCompact(el.offsetWidth < 250);
    return () => observer.disconnect();
  }, []);

  const activeNotebook = useMemo(
    () => notebooks.find((nb) => nb.id === activeNotebookId) ?? null,
    [notebooks, activeNotebookId]
  );

  /** P0-3：选中的文档一共还带着多少个子文档（moveDocIds 已去重到顶层，不会重复计） */
  const moveSubtreeCount = useMemo(() => {
    if (!activeNotebook || moveDocIds.length === 0) return 0;
    let count = 0;
    for (const id of moveDocIds) count += collectSubtreeIds(activeNotebook.docs, id).size - 1;
    return count;
  }, [activeNotebook, moveDocIds]);

  /** P0-2：过滤无结果时的唯一出口 —— 搜索词与标签一起清掉 */
  const clearFilter = useCallback(() => {
    onSearchChange('');
    setTagFilter([]);
  }, [onSearchChange]);

  /** P1-13 第二级选择：目标知识库展平后的文档（供「放入哪个文档下面」下拉使用） */
  const moveTargetNotebook =
    moveTargetNotebookId === null ? null : notebooks.find((nb) => nb.id === moveTargetNotebookId) ?? null;
  const moveParentOptions = moveTargetNotebook ? flattenDocs([moveTargetNotebook]) : [];

  // 下拉的外部点击关闭 / Esc / 键盘导航统一由 ContextMenu 负责（含触发按钮的开关语义）

  // 移动端打开文档后自动收起列表，把空间还给编辑器
  const handleViewDoc = useCallback(
    (notebookId: string, docId: string) => {
      onViewDoc(notebookId, docId);
      if (mobile) setMobileExpanded(false);
      // 紧凑窗口：选中文档后把宽度还给正文（与移动端同一策略）
      if (compact) setCompactExpanded(false);
    },
    [onViewDoc, mobile, compact],
  );

  /** 从模板新建（T4）：替换占位符后建文档，并记录真实使用次数 */
  const handleSelectTemplate = useCallback((template: Template) => {
    const content = applyTemplateVars(template.content, { title: template.name });
    const docId = createDoc(activeNotebookId, null, { title: template.name, content });
    if (docId) handleViewDoc(activeNotebookId, docId);
    useNotesStore.getState().recordTemplateUsage(template.id);
    setShowTemplateModal(false);
  }, [activeNotebookId, createDoc, handleViewDoc]);

  /**
   * P1-13 / P0-3：确认移动 —— 两级选择（知识库 + 目标库里的父级）、整棵子树一起搬、
   * 撤销时把层级也放回去（旧实现只把文档搬回根级，父子关系一去不返）。
   */
  const handleConfirmMove = useCallback(() => {
    const targetId = moveTargetNotebookId;
    if (!targetId || moveDocIds.length === 0) return;
    const sourceId = activeNotebookId;
    const ids = [...moveDocIds];
    const targetParentId = moveParentId;
    const sourceDocs = activeNotebook?.docs ?? [];
    const originalParents = new Map(
      ids.map((id) => [id, sourceDocs.find((d) => d.id === id)?.parentId ?? null] as const),
    );

    ids.forEach((docId) => {
      moveDocToNotebook(sourceId, docId, targetId);
      if (targetParentId) updateDoc(targetId, docId, { parentId: targetParentId });
    });
    setShowMoveDialog(false);
    setMoveDocIds([]);

    // 撤销＝整批搬回原知识库，并还原各自原来的父级
    const batchId = setPendingBatchUndo('批量移动', () => {
      ids.forEach((docId) => {
        moveDocToNotebook(targetId, docId, sourceId);
        const parentId = originalParents.get(docId) ?? null;
        if (parentId) updateDoc(sourceId, docId, { parentId });
      });
    });
    const targetTitle = notebooks.find((nb) => nb.id === targetId)?.title ?? '目标知识库';
    toastWithUndo(
      ids.length > 1
        ? `已将 ${ids.length} 篇文档移动到「${targetTitle}」`
        : `已移动到「${targetTitle}」`,
      () => {
        if (undoBatch(batchId)) toast.info('已移回原知识库');
        else toast.warning('撤销已过期');
      },
    );
  }, [
    activeNotebook,
    activeNotebookId,
    moveDocIds,
    moveParentId,
    moveTargetNotebookId,
    moveDocToNotebook,
    notebooks,
    updateDoc,
  ]);

  const showBody = !mobile || mobileExpanded;

  /*
   * 紧凑窗口：收起成一条 44px 的窄条。
   * 只保留"展开"这一个动作 + 知识库图标与文档数，信息量降到最低，
   * 把横向空间完整让给编辑区（窄窗口下编辑区宽度是最稀缺资源）。
   */
  if (compact && !compactExpanded) {
    return (
      <aside className="docs-sidebar docs-sidebar-rail" aria-label="文档列表（已收起）">
        <button
          type="button"
          className="docs-rail-toggle"
          onClick={() => setCompactExpanded(true)}
          title="展开文档列表"
          aria-label="展开文档列表"
          aria-expanded={false}
        >
          <IconChevronRight size={14} />
        </button>
        <span className="docs-rail-icon" aria-hidden="true">
          {activeNotebook?.icon ? (
            <span className="notebook-icon-emoji">{activeNotebook.icon}</span>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          )}
        </span>
        <span className="docs-rail-count">{activeNotebook?.docs.length ?? 0}</span>
        <span className="docs-rail-label">{activeNotebook?.title ?? '文档'}</span>
      </aside>
    );
  }

  return (
    <aside
      ref={sidebarRef}
      className={`docs-sidebar ${isCompact ? 'docs-sidebar-compact' : ''} ${mobile ? 'docs-sidebar-mobile' : ''} ${mobile && mobileExpanded ? 'expanded' : ''}`}
      style={width !== undefined ? { width } : undefined}
    >
      {activeNotebook && (
        <>
          <div className="docs-header">
            <div className="docs-title-row">
              <span className="docs-icon" aria-hidden="true">
                {/* 与侧栏知识库列表保持一致：自定义图标时显示 emoji */}
                {activeNotebook.icon ? (
                  <span className="notebook-icon-emoji">{activeNotebook.icon}</span>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                )}
              </span>
              <span className="docs-title">{activeNotebook.title}</span>
              <span className="docs-count">{activeNotebook.docs.length}</span>
            </div>
            {mobile && (
              <button
                className="docs-mobile-toggle"
                onClick={() => setMobileExpanded(open => !open)}
                aria-label={mobileExpanded ? '收起文档列表' : '展开文档列表'}
                aria-expanded={mobileExpanded}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transform: mobileExpanded ? 'rotate(180deg)' : 'none' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            )}
            <select
              className="docs-sort-select"
              value={sortMode}
              onChange={(e) => handleSortChange(e.target.value as DocSortMode)}
              title="文档排序方式"
              aria-label="文档排序方式"
            >
              {DOC_SORT_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
            <div className="docs-add-wrapper" ref={addMenuRef}>
              <button
                className="btn-add-doc"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setAddMenuPos({ x: rect.right, y: rect.bottom + 4 });
                  setShowAddMenu((open) => !open);
                }}
                title="新建文档"
                aria-label="新建文档"
                aria-haspopup="menu"
                aria-expanded={showAddMenu}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              {showAddMenu && (
                <ContextMenu
                  x={addMenuPos.x}
                  y={addMenuPos.y}
                  alignX="right"
                  ariaLabel="新建文档"
                  triggerRef={addMenuRef}
                  onClose={() => setShowAddMenu(false)}
                  items={[
                    {
                      id: 'blank',
                      label: '空白文档',
                      onSelect: () => {
                        const docId = createDoc(activeNotebookId, null);
                        if (docId) handleViewDoc(activeNotebookId, docId);
                      },
                    },
                    {
                      id: 'template',
                      label: '从模板新建…',
                      onSelect: () => setShowTemplateModal(true),
                    },
                  ]}
                />
              )}
            </div>
          </div>
          {showBody && (
            <>
              <div className="docs-search">
                {/*
                  P1-4：与侧栏头部的「全局搜索」入口分开 —— 这里只过滤**当前知识库**的标题，
                  旧占位文案「搜索文档...」和全局搜索一模一样，用户永远分不清搜的是哪一层。
                */}
                <input
                  className="docs-search-input"
                  placeholder="过滤当前知识库文档…"
                  aria-label="过滤当前知识库文档"
                  value={searchText}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && searchText) {
                      // 第一次 Esc 只清过滤；不再冒泡去关面板
                      e.stopPropagation();
                      clearFilter();
                    }
                  }}
                />
              </div>
              {tags.length > 0 && (
                <div className="docs-tag-filter">
                  <select
                    className="docs-sort-select"
                    value={tagFilter[0] ?? ''}
                    onChange={(e) => handleTagFilterChange(e.target.value)}
                    title="按标签过滤文档"
                    aria-label="按标签过滤文档"
                  >
                    <option value="">全部标签</option>
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.icon ? tag.icon + ' ' : ''}
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {activeNotebook.docs.length === 0 && !searchText && tagFilter.length === 0 ? (
                <EmptyState
                  icon={<IconDocument size={32} />}
                  title="这个知识库还是空的"
                  description="新建一篇文档开始写，或从侧栏「更多 → 导入文档」导入已有的 Markdown。"
                  actions={[
                    {
                      label: '新建文档',
                      icon: '＋',
                      onClick: () => {
                        const docId = createDoc(activeNotebookId, null);
                        if (docId) handleViewDoc(activeNotebookId, docId);
                      },
                    },
                  ]}
                />
              ) : (
                <DocTree
                  activeNotebook={activeNotebook}
                  searchText={searchText}
                  sortMode={sortMode}
                  tagFilter={tagFilter}
                  onViewDoc={handleViewDoc}
                  onMoveRequest={(docId) => requestMove([docId])}
                  onBatchMoveRequest={requestMove}
                  onClearFilter={clearFilter}
                />
              )}
            </>
          )}
        </>
      )}

      {/* 从模板新建：复用首页的模板中心（懒加载，点开才拉取模板数据） */}
      {showTemplateModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowTemplateModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="模板中心"
        >
          <div
            ref={templateModalRef}
            className="modal-content template-center-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <Suspense fallback={<Loading type="spinner" size="medium" text="正在加载模板…" />}>
              <TemplateCenter
                onSelectTemplate={handleSelectTemplate}
                onClose={() => setShowTemplateModal(false)}
              />
            </Suspense>
          </div>
        </div>
      )}

      {showMoveDialog && moveDocIds.length > 0 && (
        <div
          className="confirm-dialog-overlay"
          onClick={() => setShowMoveDialog(false)}
          role="dialog"
          aria-modal="true"
          aria-label={moveDocIds.length > 1 ? `移动 ${moveDocIds.length} 篇文档` : '移动文档'}
        >
          <div ref={moveDialogRef} className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{moveDocIds.length > 1 ? `移动 ${moveDocIds.length} 篇文档` : '移动文档'}</h3>
            {/* P0-3：移动前如实告知会连带多少子文档 —— 旧对话框对结构只字不提 */}
            {moveSubtreeCount > 0 && (
              <p className="move-subtree-hint">
                选中的文档还包含 {moveSubtreeCount} 个子文档，将一并移动到目标知识库。
              </p>
            )}
            <p>第一步：选择目标知识库</p>
            <div className="move-target-list">
              {notebooks
                .filter((nb) => nb.id !== activeNotebookId)
                .map((nb) => (
                  <button
                    key={nb.id}
                    type="button"
                    className={`move-target-item ${moveTargetNotebookId === nb.id ? 'active' : ''}`}
                    aria-pressed={moveTargetNotebookId === nb.id}
                    onClick={() => {
                      setMoveTargetNotebookId(nb.id);
                      // 换了知识库，原来的父级选择必然失效
                      setMoveParentId(null);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    {nb.title}
                  </button>
                ))}
            </div>
            {/* P1-13 第二级：落到目标库的哪个位置（根级 / 某篇文档下面） */}
            <p>第二步：放入目标位置</p>
            <select
              className="move-parent-select"
              aria-label="放入目标位置"
              value={moveParentId ?? ''}
              onChange={(e) => setMoveParentId(e.target.value || null)}
            >
              <option value="">根级（顶层）</option>
              {moveParentOptions.map((ref) => (
                <option key={ref.docId} value={ref.docId}>
                  {/* path 含自身，减 1 即层级深度；全角空格做缩进，下拉里也能看出树形 */}
                  {'　'.repeat(Math.max(0, ref.path.length - 1)) + ref.title}
                </option>
              ))}
            </select>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setShowMoveDialog(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!moveTargetNotebookId}
                onClick={handleConfirmMove}
              >
                移动到此处
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
