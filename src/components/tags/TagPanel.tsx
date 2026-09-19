// 导入 React hooks 和类型定义
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { Tag, TagStats } from "@/types";
import { useNotesStore } from "@/store";
import TagEditModal from "./TagEditModal";
import TagStatsPanel from "./TagStatsPanel";
import { TAG_DEFAULT_COLORS, TAG_DEFAULT_ICONS } from "@/shared/constants";

/**
 * 标签面板组件属性接口
 */
interface TagPanelProps {
  isOpen: boolean;       // 面板是否打开
  onClose: () => void;   // 关闭回调
}

export default function TagPanel({ isOpen, onClose }: TagPanelProps) {
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
  const handleCreateTag = (name: string, color: string, icon: string, parentId: string | null) => {
    createTag(name, color, icon, parentId);
    setShowCreateModal(false);
  };

  /**
   * 处理更新标签
   */
  const handleUpdateTag = (tagId: string, updates: Partial<Tag>) => {
    updateTag(tagId, updates);
    setEditTag(null);
  };

  /**
   * 处理删除标签
   */
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null)

  const handleDeleteTag = (tagId: string) => {
    setConfirmMessage('确定要删除这个标签吗？所有使用该标签的文档将失去此标签。')
    setConfirmAction(() => () => {
      deleteTag(tagId)
      setSelectedTags(selectedTags.filter(id => id !== tagId))
      setConfirmMessage(null)
      setConfirmAction(null)
    })
  }

  const handleBatchDelete = () => {
    setConfirmMessage(`确定要删除选中的 ${selectedTags.length} 个标签吗？`)
    setConfirmAction(() => () => {
      selectedTags.forEach(tagId => deleteTag(tagId))
      setSelectedTags([])
      setConfirmMessage(null)
      setConfirmAction(null)
    })
  }

  /**
   * 批量更新标签（随机设置颜色和图标）
   */
  const handleBatchUpdate = () => {
    if (selectedTags.length === 0) return;
    const randomColor = TAG_DEFAULT_COLORS[Math.floor(Math.random() * TAG_DEFAULT_COLORS.length)];
    const randomIcon = TAG_DEFAULT_ICONS[Math.floor(Math.random() * TAG_DEFAULT_ICONS.length)];
    batchUpdateTags(selectedTags, { color: randomColor, icon: randomIcon });
    setSelectedTags([]);
  };

  /**
   * 切换标签选中状态
   */
  const toggleSelectTag = (tagId: string) => {
    setSelectedTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  /**
   * 全选/取消全选
   */
  const selectAllTags = () => {
    if (selectedTags.length === filteredTags.length) {
      setSelectedTags([]);
    } else {
      setSelectedTags(filteredTags.map(tag => tag.id));
    }
  };

  /**
   * 递归渲染标签树
   */
  const renderTagTree = (tagList: Tag[], depth = 0) => {
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

  return (
    <div className="tag-panel-overlay" onClick={onClose}>
      <div className="tag-panel" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="tag-panel-header">
          <h3 className="tag-panel-title">标签管理</h3>
          <button className="tag-panel-close" onClick={onClose}>×</button>
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
                <div className="tag-empty">
                  <span className="tag-empty-icon">🏷️</span>
                  <span className="tag-empty-text">暂无标签</span>
                </div>
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
      </div>

      {confirmMessage && (
        <div className="confirm-dialog-overlay" onClick={() => { setConfirmMessage(null); setConfirmAction(null) }}>
          <div className="confirm-dialog confirm-dialog-warning" onClick={(e) => e.stopPropagation()}>
            <h3>确认操作</h3>
            <p>{confirmMessage}</p>
            <div className="confirm-dialog-actions">
              <button onClick={() => { setConfirmMessage(null); setConfirmAction(null) }}>取消</button>
              <button onClick={() => confirmAction?.()} className="btn-primary">确认</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}