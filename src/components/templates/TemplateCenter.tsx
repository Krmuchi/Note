import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import type { JSX } from 'react';
import type { Template } from '@/types/templates';
import { templateCategories, searchTemplates, templates as allTemplates } from '@/data/templates';
import { useNotesStore } from '@/store';
import CustomTemplateModal from './CustomTemplateModal';
import { loadCustomTemplates, saveCustomTemplates, deleteCustomTemplate } from '@/utils/customTemplates';
import { confirmAction } from '@/hooks/useConfirmAction';
import { IconTemplate, IconSearch, IconLayers } from '@/components/common/Icon';

/**
 * 模板预览也要渲染 Markdown，但整条渲染链路（react-markdown + KaTeX ≈ 630KB）
 * 只有在用户真的打开某个模板的预览时才需要。静态 import 会把它绑进模板中心
 * 这个本就懒加载的分块，并让编辑器首屏多背一份预加载。
 */
const MarkdownPreview = lazy(() =>
  import('@/components/editor/MarkdownPreview').then((m) => ({ default: m.MarkdownPreview })),
);

/**
 * 模板使用次数 = 冷启动基线权重 + 用户真实使用累计。
 * 旧实现直接把 templates.ts 里的硬编码数字当真实次数展示（假数据），
 * 现改为内置模板只提供基线权重，真实次数来自 store.templateUsage。
 */
function usageOf(template: Template, templateUsage: Record<string, number>): number {
  return (template.baseUsageCount ?? 0) + (templateUsage[template.id] ?? 0);
}

interface TemplateCenterProps {
  onSelectTemplate: (template: Template) => void;
  onClose: () => void;
}

type ViewMode = 'grid' | 'list';
type SortType = 'popular' | 'newest' | 'name';

const FAVORITES_KEY = 'template-favorites';

/**
 * 高亮搜索匹配文本。
 * 必须定义在模块层：写在组件函数体内会每次渲染重建组件类型，
 * 导致整棵高亮子树卸载重挂载（SearchPanel 曾修复过同款问题）。
 */
const HighlightText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="search-highlight">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  );
};

export default function TemplateCenter({ onSelectTemplate, onClose }: TemplateCenterProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortType>('popular');
  // 惰性初始化：直接在首次渲染时从 localStorage 读取，避免 effect 中同步 setState 触发级联渲染
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const fav = localStorage.getItem(FAVORITES_KEY);
      return fav ? JSON.parse(fav) : [];
    } catch {
      return [];
    }
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<Template[]>(() => loadCustomTemplates());
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  // 组件内自订阅真实使用计数，避免 App 顶层订阅导致无关重渲染
  const templateUsage = useNotesStore((s) => s.templateUsage);

  const toggleFavorite = useCallback((templateId: string) => {
    setFavorites(prev => {
      const next = prev.includes(templateId)
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // 保存自定义模板
  const handleSaveCustomTemplate = useCallback((template: Template) => {
    setCustomTemplates(prev => {
      const existing = prev.find(t => t.id === template.id);
      let updated: Template[];
      if (existing) {
        updated = prev.map(t => t.id === template.id ? template : t);
      } else {
        updated = [...prev, template];
      }
      saveCustomTemplates(updated);
      return updated;
    });
    setEditingTemplate(null);
  }, []);

  /** 自定义模板 id 集合，用于判断卡片是否展示删除入口 */
  const customTemplateIds = useMemo(
    () => new Set(customTemplates.map(t => t.id)),
    [customTemplates],
  );

  // 删除自定义模板（内置模板不提供删除）：走全局 ConfirmDialog，与其余破坏性操作保持一致
  const handleDeleteCustomTemplate = useCallback((template: Template) => {
    confirmAction({
      title: '删除自定义模板',
      message: `确定删除自定义模板「${template.name}」吗？此操作无法撤销。`,
      confirmText: '删除',
      variant: 'danger',
      onConfirm: () => {
        deleteCustomTemplate(template.id);
        setCustomTemplates(prev => prev.filter(t => t.id !== template.id));
        // 同步清理收藏，避免收藏列表残留指向已删除模板的 id
        setFavorites(prev => {
          if (!prev.includes(template.id)) return prev;
          const next = prev.filter(id => id !== template.id);
          localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
          return next;
        });
        setPreviewTemplate(current => (current && current.id === template.id ? null : current));
      },
    });
  }, []);

  const filteredTemplates = useMemo(() => {
    // 合并内置模板和自定义模板
    const allTemplatesWithCustom = [...allTemplates, ...customTemplates];
    
    let result = selectedCategory
      ? selectedCategory === 'custom'
        ? customTemplates
        : templateCategories.find(c => c.id === selectedCategory)?.templates || []
      : searchQuery ? searchTemplates(searchQuery) : allTemplatesWithCustom;

    if (searchQuery && selectedCategory) {
      result = result.filter(
        t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
             t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
             t.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // 收藏筛选
    if (showFavoritesOnly) {
      result = result.filter(t => favorites.includes(t.id));
    }

    // 排序
    switch (sortBy) {
      case 'popular':
        result = [...result].sort((a, b) => usageOf(b, templateUsage) - usageOf(a, templateUsage));
        break;
      case 'newest':
        result = [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'name':
        result = [...result].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        break;
    }

    return result;
  }, [searchQuery, selectedCategory, sortBy, showFavoritesOnly, favorites, customTemplates, templateUsage]);

  const displayTemplates = filteredTemplates;

  const handleTemplateClick = useCallback((template: Template) => {
    setPreviewTemplate(template);
  }, []);

  const handleUseTemplate = useCallback((template: Template) => {
    onSelectTemplate(template);
    onClose();
  }, [onSelectTemplate, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (previewTemplate) {
        setPreviewTemplate(null);
      } else {
        onClose();
      }
    }
  }, [previewTemplate, onClose]);

  const getCategoryCount = useCallback((categoryId: string) => {
    return templateCategories.find(c => c.id === categoryId)?.templates.length || 0;
  }, []);

  return (
    <div className="template-center" onKeyDown={handleKeyDown}>
      {/* 头部 */}
      <div className="template-center-header">
        <div className="template-center-title">
          <span className="title-icon"><IconTemplate size={18} /></span>
          <div className="title-text">
            <h2>模板中心</h2>
            <p className="title-subtitle">选择模板，快速开始创作</p>
          </div>
        </div>
        <div className="template-center-actions">
          <div className="sort-select-wrapper">
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortType)}
            >
              <option value="popular">最热门</option>
              <option value="newest">最新</option>
              <option value="name">按名称</option>
            </select>
          </div>
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="网格视图"
            >
              ⊞
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="列表视图"
            >
              ☰
            </button>
          </div>
          <button className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {/* 搜索 */}
      <div className="template-center-search">
        <span className="search-icon"><IconSearch size={15} /></span>
        <input
          type="text"
          placeholder="搜索模板名称、描述或标签..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
          autoFocus
        />
        {searchQuery && (
          <button className="search-clear" onClick={() => setSearchQuery('')}>
            ✕
          </button>
        )}
      </div>

      {/* 分类和筛选 */}
      <div className="template-categories">
        <button
          className={`category-btn ${!selectedCategory ? 'active' : ''}`}
          onClick={() => { setSelectedCategory(null); setShowFavoritesOnly(false); }}
        >
          <span className="category-icon"><IconLayers size={16} /></span>
          <span className="category-name">全部</span>
          <span className="category-count">{allTemplates.length}</span>
        </button>
        <button
          className={`category-btn ${showFavoritesOnly ? 'active' : ''}`}
          onClick={() => { setShowFavoritesOnly(!showFavoritesOnly); setSelectedCategory(null); }}
        >
          <span className="category-icon">⭐</span>
          <span className="category-name">收藏</span>
          <span className="category-count">{favorites.length}</span>
        </button>
        {templateCategories.map((category) => (
          <button
            key={category.id}
            className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
            onClick={() => { setSelectedCategory(category.id); setShowFavoritesOnly(false); }}
          >
            <span className="category-icon">{category.icon}</span>
            <span className="category-name">{category.name}</span>
            <span className="category-count">{getCategoryCount(category.id)}</span>
          </button>
        ))}
        <button
          className={`category-btn ${selectedCategory === 'custom' ? 'active' : ''}`}
          onClick={() => { setSelectedCategory('custom'); setShowFavoritesOnly(false); }}
        >
          <span className="category-icon">✨</span>
          <span className="category-name">自定义</span>
          <span className="category-count">{customTemplates.length}</span>
        </button>
        <button
          className="category-btn create-template-btn"
          onClick={() => setShowCustomModal(true)}
        >
          <span className="category-icon">+</span>
          <span className="category-name">创建模板</span>
        </button>
      </div>

      {/* 结果信息 */}
      <div className="template-results-info">
        <span className="results-count">
          {searchQuery ? `搜索 "${searchQuery}" 找到 ${displayTemplates.length} 个模板` :
           showFavoritesOnly ? `收藏的模板 · ${displayTemplates.length} 个` :
           selectedCategory ? `${templateCategories.find(c => c.id === selectedCategory)?.name} · ${displayTemplates.length} 个模板` :
           `共 ${displayTemplates.length} 个模板`}
        </span>
      </div>

      {/* 模板列表 */}
      <div className={`templates-container ${viewMode === 'grid' ? 'templates-grid' : 'templates-list'}`}>
        {displayTemplates.length === 0 ? (
          <div className="empty-templates">
            <span className="empty-icon"><IconSearch size={36} /></span>
            <span className="empty-text">
              {showFavoritesOnly ? '暂无收藏的模板' : '暂无匹配的模板'}
            </span>
            <span className="empty-hint">
              {showFavoritesOnly ? '点击模板卡片上的星标收藏模板' : '试试其他关键词或分类'}
            </span>
          </div>
        ) : (
          displayTemplates.map((template) => (
            <div
              key={template.id}
              className={`template-card ${viewMode === 'list' ? 'template-card-list' : ''} ${hoveredId === template.id ? 'hovered' : ''}`}
              onClick={() => handleTemplateClick(template)}
              onMouseEnter={() => setHoveredId(template.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="template-card-preview">
                <div className="template-icon-large">{template.icon}</div>
                <div className="template-preview-overlay">
                  <button className="preview-btn" onClick={(e) => { e.stopPropagation(); setPreviewTemplate(template); }}>
                    预览
                  </button>
                  <button className="use-btn" onClick={(e) => { e.stopPropagation(); handleUseTemplate(template); }}>
                    使用
                  </button>
                </div>
              </div>
              <div className="template-info">
                <div className="template-info-header">
                  <span className="template-icon-small">{template.icon}</span>
                  <h3 className="template-name">
                    <HighlightText text={template.name} query={searchQuery} />
                  </h3>
                  <button
                    className={`template-fav-btn ${favorites.includes(template.id) ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(template.id); }}
                    title={favorites.includes(template.id) ? '取消收藏' : '收藏'}
                  >
                    {favorites.includes(template.id) ? '★' : '☆'}
                  </button>
                  {customTemplateIds.has(template.id) && (
                    <button
                      className="template-delete-btn"
                      onClick={(e) => { e.stopPropagation(); handleDeleteCustomTemplate(template); }}
                      title="删除自定义模板"
                      aria-label={`删除自定义模板 ${template.name}`}
                    >
                      🗑
                    </button>
                  )}
                </div>
                <p className="template-desc">
                  <HighlightText text={template.description} query={searchQuery} />
                </p>
                <div className="template-meta">
                  <span className="template-tags">
                    {template.tags?.slice(0, 2).map((tag, idx) => (
                      <span key={idx} className="tag">
                        <HighlightText text={tag} query={searchQuery} />
                      </span>
                    ))}
                  </span>
                  <span className="template-usage">
                    {usageOf(template, templateUsage)} 次使用
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 预览面板 */}
      {previewTemplate && (
        <div className="template-preview-overlay-bg" onClick={() => setPreviewTemplate(null)}>
          <div className="template-preview-panel" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <div className="preview-title-row">
                <span className="preview-icon">{previewTemplate.icon}</span>
                <h3 className="preview-title">{previewTemplate.name}</h3>
              </div>
              <div className="preview-meta">
                <span className="preview-category">
                  {templateCategories.find(c => c.id === previewTemplate.category)?.icon}
                  {' '}
                  {templateCategories.find(c => c.id === previewTemplate.category)?.name}
                </span>
                <span className="preview-usage">{usageOf(previewTemplate, templateUsage)} 次使用</span>
                {previewTemplate.tags && (
                  <span className="preview-tags">
                    {previewTemplate.tags.map((tag, idx) => (
                      <span key={idx} className="tag">{tag}</span>
                    ))}
                  </span>
                )}
              </div>
              <button className="preview-close" onClick={() => setPreviewTemplate(null)}>✕</button>
            </div>
            <div className="preview-body">
              <div className="preview-content">
                <Suspense fallback={<div className="preview-loading">正在加载预览…</div>}>
                  <MarkdownPreview content={previewTemplate.content} />
                </Suspense>
              </div>
            </div>
            <div className="preview-footer">
              <p className="preview-desc">{previewTemplate.description}</p>
              <div className="preview-actions">
                <button
                  className={`preview-fav-btn ${favorites.includes(previewTemplate.id) ? 'active' : ''}`}
                  onClick={() => toggleFavorite(previewTemplate.id)}
                >
                  {favorites.includes(previewTemplate.id) ? '★ 已收藏' : '☆ 收藏'}
                </button>
                {customTemplateIds.has(previewTemplate.id) && (
                  <button className="btn-delete-template" onClick={() => handleDeleteCustomTemplate(previewTemplate)}>
                    删除模板
                  </button>
                )}
                <button className="btn-cancel" onClick={() => setPreviewTemplate(null)}>
                  取消
                </button>
                <button className="btn-use-template" onClick={() => handleUseTemplate(previewTemplate)}>
                  使用此模板
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 自定义模板模态框 */}
      <CustomTemplateModal
        isOpen={showCustomModal}
        onClose={() => { setShowCustomModal(false); setEditingTemplate(null); }}
        onSave={handleSaveCustomTemplate}
        editTemplate={editingTemplate}
      />
    </div>
  );
}
