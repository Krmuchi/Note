// 导入 React hooks 和类型定义
import '@/styles/tag-panel.css';
import { useState } from "react";
import type { JSX } from "react";
import { useShallow } from "zustand/react/shallow";
import type { Tag, TagStats } from "@/types";
import { useNotesStore } from "@/store";
import TagEditModal from "./TagEditModal";
import TagStatsPanel from "./TagStatsPanel";
import { EmptyState } from "@/components/common/EmptyState";
import { IconSearch } from "@/components/common/Icon";
import { TAG_DEFAULT_COLORS, TAG_DEFAULT_ICONS } from "@/shared/constants";
import { confirmAction } from "@/hooks/useConfirmAction";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { requestTagSearch } from "@/store/slices/searchSlice";
import { uiActions } from "@/hooks/useUIState";

/**
 * 标签面板组件属性接口
 */
interface TagPanelProps {
  isOpen: boolean;       // 面板是否打开
  /** 关闭回调。作为视图嵌在 MainContent 里时不需要（侧栏切走即关闭），故可选 */
  onClose?: () => void;
  /**
   * 嵌入形态（侧栏「标签」视图）：不渲染全屏遮罩与关闭按钮，直接填满内容区。
   * 旧实现嵌入时也套 .tag-panel-overlay（fixed 全屏），把侧栏整个盖住，
   * 而嵌入模式没有 onClose，× 与遮罩点击全是死的，用户被锁死在标签页。
   */
  embedded?: boolean;
}

export default function TagPanel({ isOpen, onClose, embedded = false }: TagPanelProps): JSX.Element | null {
  // 焦点陷阱只在弹窗形态启用：嵌入视图是普通页面内容，不该循环 Tab
  const trapRef = useFocusTrap<HTMLDivElement>(!embedded);
  const {
    tags,
    createTag,
    updateTag,
    deleteTag,
    getTagsWithHierarchy,
    getTagStats,
    batchUpdateTags,
  } = useNotesStore(useShallow((s) => ({
    tags: s.tags,
    createTag: s.createTag,
    updateTag: s.updateTag,
    deleteTag: s.deleteTag,
    getTagsWithHierarchy: s.getTagsWithHierarchy,
    getTagStats: s.getTagStats,
    batchUpdateTags: s.batchUpdateTags,
  })));

  const [selectedTags, setSelectedTags] = useState<string[]>([]); // 选中的标签 ID 列表
  const [searchText, setSearchText] = useState('');               // 搜索文本
  const [showStats, setShowStats] = useState(false);              // 是否显示统计面板
  const [editTag, setEditTag] = useState<Tag | null>(null);       // 当前编辑的标签
  const [showCreateModal, setShowCreateModal] = useState(false);  // 是否显示新建标签弹窗

  const tagsWithHierarchy = getTagsWithHierarchy(); // 获取带层级的标签列表
  const stats: TagStats = getTagStats();            // 获取标签统计信息

  // 根据搜索文本过滤标签（渲染层也必须使用过滤结果，否则搜索时列表纹丝不动，
  // 且全选会选中不可见的标签造成误删）
  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(searchText.toLowerCase())
  );

  // 递归过滤层级树：保留命中的节点及其祖先链（保证父子结构完整）
  const filterHierarchy = (nodes: (Tag & { children?: (Tag & { children?: unknown[] })[] })[]): typeof nodes => {
    const result: typeof nodes = [];
    for (const node of nodes) {
      const filteredChildren = node.children ? filterHierarchy(node.children as typeof nodes) : [];
      if (node.name.toLowerCase().includes(searchText.toLowerCase()) || filteredChildren.length > 0) {
        result.push(filteredChildren.length > 0 ? { ...node, children: filteredChildren } : node);
      }
    }
    return result;
  };
  const visibleHierarchy = searchText.trim()
    ? filterHierarchy(tagsWithHierarchy as Parameters<typeof filterHierarchy>[0])
    : tagsWithHierarchy;

  /**
   * 处理创建标签
   */
  const handleCreateTag = (name: string, color: string, icon: string, parentId: string | null): void => {
    createTag(name, color, icon, parentId);
    setShowCreateModal(false);
  };

  /**
   * 处理更新标签
   */
  const handleUpdateTag = (tagId: string, updates: Partial<Tag>): void => {
    updateTag(tagId, updates);
    setEditTag(null);
  };

  /**
   * 处理删除标签
   */
  const handleDeleteTag = (tagId: string): void => {
    const tagName = tags.find((t) => t.id === tagId)?.name ?? '该标签';
    confirmAction({
      // 确认标题必须点名对象（「确认操作」看不出要删什么）
      title: `删除标签「${tagName}」`,
      message: '确定要删除这个标签吗？所有使用该标签的文档将失去此标签。',
      variant: 'danger',
      onConfirm: () => {
        deleteTag(tagId)
        setSelectedTags(selectedTags.filter(id => id !== tagId))
      },
    })
  }

  const handleBatchDelete = (): void => {
    confirmAction({
      title: `删除 ${selectedTags.length} 个标签`,
      message: `确定要删除选中的 ${selectedTags.length} 个标签吗？`,
      variant: 'danger',
      onConfirm: () => {
        selectedTags.forEach(tagId => deleteTag(tagId))
        setSelectedTags([])
      },
    })
  }

  /**
   * P1-9：按标签看文档。标签页此前只有管理动作（改名/删除/统计），
   * 点标签行只是勾选 —— 用户没有任何入口看到「这个标签下到底有哪些文档」：
   * 树内标签过滤只作用于当前知识库，搜索侧又要求必须有关键词。
   * 这里发一个一次性请求并打开搜索面板，SearchPanel 打开时消费它（空关键词按标签筛）。
   */
  const handleViewTagDocs = (tagItem: Tag): void => {
    requestTagSearch({ tagIds: [tagItem.id], label: tagItem.name });
    uiActions.setShowSearchPanel(true);
  };

  /**
   * 批量更新标签（随机设置颜色和图标）
   */
  const handleBatchUpdate = (): void => {
    if (selectedTags.length === 0) return;
    const randomColor = TAG_DEFAULT_COLORS[Math.floor(Math.random() * TAG_DEFAULT_COLORS.length)];
    const randomIcon = TAG_DEFAULT_ICONS[Math.floor(Math.random() * TAG_DEFAULT_ICONS.length)];
    batchUpdateTags(selectedTags, { color: randomColor, icon: randomIcon });
    setSelectedTags([]);
  };

  /**
   * 切换标签选中状态
   */
  const toggleSelectTag = (tagId: string): void => {
    setSelectedTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  /**
   * 全选/取消全选
   */
  const selectAllTags = (): void => {
    if (selectedTags.length === filteredTags.length) {
      setSelectedTags([]);
    } else {
      setSelectedTags(filteredTags.map(tag => tag.id));
    }
  };

  /**
   * 递归渲染标签树
   */
  const renderTagTree = (tagList: Tag[], depth = 0): JSX.Element[] => {
    return tagList.map(tag => (
      <div key={tag.id}>
        <div 
          className={`tag-item ${selectedTags.includes(tag.id) ? 'selected' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => toggleSelectTag(tag.id)}
        >
          <input
            type="checkbox"
            checked={selectedTags.includes(tag.id)}
            onChange={(e) => e.stopPropagation()}
            className="tag-checkbox"
          />
          <span 
            className="tag-color" 
            style={{ backgroundColor: tag.color }}
          />
          <span className="tag-icon">{tag.icon}</span>
          <span className="tag-name">{tag.name}</span>
          <span className="tag-count">{tag.usageCount}</span>
          <div className="tag-actions">
            {/* P1-9：标签的「看文档」入口 —— 此前标签只有改名/删除，没有浏览动作 */}
            <button
              className="tag-action-btn view"
              title={tag.usageCount > 0 ? `查看「${tag.name}」关联的 ${tag.usageCount} 篇文档` : '该标签还没有关联的文档'}
              aria-label={`查看「${tag.name}」关联的文档`}
              disabled={tag.usageCount <= 0}
              onClick={(e) => {
                e.stopPropagation();
                handleViewTagDocs(tag);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </button>
            <button 
              className="tag-action-btn edit"
              onClick={(e) => { e.stopPropagation(); setEditTag(tag); }}
            >
              ✏️
            </button>
            <button 
              className="tag-action-btn delete"
              onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id); }}
            >
              🗑️
            </button>
          </div>
        </div>
        {tag.children && tag.children.length > 0 && (
          renderTagTree(tag.children, depth + 1)
        )}
      </div>
    ));
  };

  // 如果面板未打开，返回 null
  if (!isOpen) return null;

  const panelBody = (
    <>
      {/* 头部：嵌入形态没有关闭按钮（侧栏切走即离开，渲染死按钮只会误导） */}
      <div className="tag-panel-header">
        <h3 className="tag-panel-title">标签管理</h3>
        {!embedded && (
          <button className="tag-panel-close" onClick={onClose} aria-label="关闭">×</button>
        )}
      </div>

      {/* 工具栏 */}
      <div className="tag-panel-toolbar">
        <button 
          className="tag-toolbar-btn"
          onClick={() => setShowCreateModal(true)}
        >
          + 新建标签
        </button>
        <button 
          className="tag-toolbar-btn"
          onClick={() => setShowStats(!showStats)}
        >
          📊 {showStats ? '返回列表' : '统计分析'}
        </button>
        {selectedTags.length > 0 && (
          <>
            <span className="tag-selection-info">已选择 {selectedTags.length} 个标签</span>
            <button 
              className="tag-toolbar-btn secondary"
              onClick={handleBatchUpdate}
            >
              批量修改
            </button>
            <button 
              className="tag-toolbar-btn danger"
              onClick={handleBatchDelete}
            >
              批量删除
            </button>
          </>
        )}
      </div>

      {/* 搜索 */}
      <div className="tag-panel-search">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="搜索标签..."
          className="tag-search-input"
        />
      </div>

      <div className="tag-panel-body">
        {showStats ? (
          <TagStatsPanel stats={stats} />
        ) : (
          <div className="tag-list">
            <div className="tag-list-header">
              <button 
                className="tag-select-all"
                onClick={selectAllTags}
              >
                {selectedTags.length === filteredTags.length && filteredTags.length > 0 ? '✓' : ''}
                全选
              </button>
              <span className="tag-list-count">共 {filteredTags.length} 个标签</span>
            </div>
            
            {filteredTags.length === 0 ? (
              /*
               * 区分"搜索没结果"与"真的还没标签"：
               * 前者给"清除搜索"，后者给"新建标签" —— 空态必须能告诉用户下一步做什么。
               */
              searchText.trim() ? (
                <EmptyState
                  icon={<IconSearch size={32} />}
                  title="没有匹配的标签"
                  description={`没有标签名包含「${searchText.trim()}」`}
                  actions={[
                    { label: '清除搜索', icon: '✕', variant: 'secondary', onClick: () => setSearchText('') },
                  ]}
                />
              ) : (
                <EmptyState
                  icon="🏷️"
                  title="还没有标签"
                  description="用标签给文档分类，之后可以按标签过滤文档树"
                  actions={[
                    {
                      label: '新建标签',
                      icon: '＋',
                      variant: 'primary',
                      onClick: () => setShowCreateModal(true),
                    },
                  ]}
                />
              )
            ) : (
              renderTagTree(visibleHierarchy)
            )}
          </div>
        )}
      </div>

      {/* 新建标签模态框 */}
      {showCreateModal && (
        <TagEditModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateTag}
          availableTags={tags}
        />
      )}

      {/* 编辑标签模态框 */}
      {editTag && (
        <TagEditModal
          key={editTag.id}
          onClose={() => setEditTag(null)}
          tag={editTag}
          onUpdate={(updates) => handleUpdateTag(editTag.id, updates)}
          availableTags={tags.filter(t => t.id !== editTag.id)}
        />
      )}
    </>
  );

  // 嵌入形态：普通页面内容，无遮罩、无焦点陷阱，侧栏保持可点
  if (embedded) {
    return <div className="tag-panel tag-panel-embedded">{panelBody}</div>;
  }

  return (
    <div className="tag-panel-overlay" onClick={onClose}>
      <div
        ref={trapRef}
        className="tag-panel"
        role="dialog"
        aria-modal="true"
        aria-label="标签管理"
        onClick={(e) => e.stopPropagation()}
      >
        {panelBody}
      </div>
    </div>
  );
}
