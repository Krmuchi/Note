// 导入 React hooks 和类型定义
import { useState, useEffect } from "react";
import type { Tag, TagStats } from "../types";
import { useNotesStore } from "../store/notesStore";
import TagEditModal from "./TagEditModal";
import TagStatsPanel from "./TagStatsPanel";

/**
 * 标签面板组件属性接口
 */
interface TagPanelProps {
  isOpen: boolean;       // 面板是否打开
  onClose: () => void;   // 关闭回调
}

/**
 * 默认标签颜色列表
 */
const defaultColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

/**
 * 默认标签图标列表
 */
const defaultIcons = ['📌', '⭐', '🔖', '🏷️', '📎', '📁', '📂', '🗂️', '📊', '📈', '💡', '🎯', '🎨', '🎭', '🌱'];

/**
 * 标签管理面板组件
 */
export default function TagPanel({ isOpen, onClose }: TagPanelProps) {
  const { 
    tags, 
    createTag, 
    updateTag, 
    deleteTag, 
    getTagsWithHierarchy, 
    getTagStats,
    batchUpdateTags,
  } = useNotesStore();

  const [selectedTags, setSelectedTags] = useState<string[]>([]); // 选中的标签 ID 列表
  const [searchText, setSearchText] = useState('');               // 搜索文本
  const [showStats, setShowStats] = useState(false);              // 是否显示统计面板
  const [editTag, setEditTag] = useState<Tag | null>(null);       // 当前编辑的标签
  const [showCreateModal, setShowCreateModal] = useState(false);  // 是否显示新建标签弹窗

  const tagsWithHierarchy = getTagsWithHierarchy(); // 获取带层级的标签列表
  const stats: TagStats = getTagStats();            // 获取标签统计信息

  // 面板打开时重置状态
  useEffect(() => {
    if (isOpen) {
      setSelectedTags([]);
      setSearchText('');
    }
  }, [isOpen]);

  // 根据搜索文本过滤标签
  const filteredTags = tags.filter(tag => 
    tag.name.toLowerCase().includes(searchText.toLowerCase())
  );

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
  const handleDeleteTag = (tagId: string) => {
    if (window.confirm('确定要删除这个标签吗？所有使用该标签的文档将失去此标签。')) {
      deleteTag(tagId);
      setSelectedTags(selectedTags.filter(id => id !== tagId));
    }
  };

  /**
   * 批量删除标签
   */
  const handleBatchDelete = () => {
    if (window.confirm(`确定要删除选中的 ${selectedTags.length} 个标签吗？`)) {
      selectedTags.forEach(tagId => deleteTag(tagId));
      setSelectedTags([]);
    }
  };

  /**
   * 批量更新标签（随机设置颜色和图标）
   */
  const handleBatchUpdate = () => {
    if (selectedTags.length === 0) return;
    const randomColor = defaultColors[Math.floor(Math.random() * defaultColors.length)];
    const randomIcon = defaultIcons[Math.floor(Math.random() * defaultIcons.length)];
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
                renderTagTree(tagsWithHierarchy)
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
            onClose={() => setEditTag(null)}
            tag={editTag}
            onUpdate={(updates) => handleUpdateTag(editTag.id, updates)}
            availableTags={tags.filter(t => t.id !== editTag.id)}
          />
        )}
      </div>
    </div>
  );
}