import { useState, useMemo, useCallback } from 'react';
import type { Template } from '@/types/templates';
import { templateCategories, searchTemplates } from '@/data/templates';

interface TemplateCenterProps {
  onSelectTemplate: (template: Template) => void;
  onClose: () => void;
}

type ViewMode = 'grid' | 'list';

export default function TemplateCenter({ onSelectTemplate, onClose }: TemplateCenterProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filteredTemplates = useMemo(() => {
    let result = selectedCategory
      ? templateCategories.find(c => c.id === selectedCategory)?.templates || []
      : searchTemplates(searchQuery);

    if (searchQuery && selectedCategory) {
      result = result.filter(
        t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
             t.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return result;
  }, [searchQuery, selectedCategory]);

  const allTemplates = useMemo(() => {
    return templateCategories.flatMap(c => c.templates);
  }, []);

  const displayTemplates = searchQuery || selectedCategory ? filteredTemplates : allTemplates;

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
      <div className="template-center-header">
        <div className="template-center-title">
          <span className="title-icon">🎨</span>
          <div className="title-text">
            <h2>模板中心</h2>
            <p className="title-subtitle">选择模板，快速开始创作</p>
          </div>
        </div>
        <div className="template-center-actions">
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

      <div className="template-center-search">
        <span className="search-icon">🔍</span>
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

      <div className="template-categories">
        <button
          className={`category-btn ${!selectedCategory ? 'active' : ''}`}
          onClick={() => setSelectedCategory(null)}
        >
          <span className="category-icon">📋</span>
          <span className="category-name">全部</span>
          <span className="category-count">{allTemplates.length}</span>
        </button>
        {templateCategories.map((category) => (
          <button
            key={category.id}
            className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(category.id)}
          >
            <span className="category-icon">{category.icon}</span>
            <span className="category-name">{category.name}</span>
            <span className="category-count">{getCategoryCount(category.id)}</span>
          </button>
        ))}
      </div>

      <div className="template-results-info">
        <span className="results-count">
          {searchQuery ? `搜索 "${searchQuery}" 找到 ${displayTemplates.length} 个模板` :
           selectedCategory ? `${templateCategories.find(c => c.id === selectedCategory)?.name} · ${displayTemplates.length} 个模板` :
           `共 ${displayTemplates.length} 个模板`}
        </span>
      </div>

      <div className={`templates-container ${viewMode === 'grid' ? 'templates-grid' : 'templates-list'}`}>
        {displayTemplates.length === 0 ? (
          <div className="empty-templates">
            <span className="empty-icon">📭</span>
            <span className="empty-text">暂无匹配的模板</span>
            <span className="empty-hint">试试其他关键词或分类</span>
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
                  <h3 className="template-name">{template.name}</h3>
                </div>
                <p className="template-desc">{template.description}</p>
                <div className="template-meta">
                  <span className="template-tags">
                    {template.tags?.slice(0, 2).map((tag, idx) => (
                      <span key={idx} className="tag">{tag}</span>
                    ))}
                  </span>
                  <span className="template-usage">
                    {template.usageCount} 次使用
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {previewTemplate && (
        <div className="template-preview-overlay" onClick={() => setPreviewTemplate(null)}>
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
                <span className="preview-usage">{previewTemplate.usageCount} 次使用</span>
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
                {previewTemplate.content.split('\n').map((line, idx) => {
                  if (line.startsWith('# ')) {
                    return <h1 key={idx} className="preview-h1">{line.replace('# ', '')}</h1>;
                  }
                  if (line.startsWith('## ')) {
                    return <h2 key={idx} className="preview-h2">{line.replace('## ', '')}</h2>;
                  }
                  if (line.startsWith('### ')) {
                    return <h3 key={idx} className="preview-h3">{line.replace('### ', '')}</h3>;
                  }
                  if (line.startsWith('> ')) {
                    return <blockquote key={idx} className="preview-quote">{line.replace('> ', '')}</blockquote>;
                  }
                  if (line.startsWith('- [ ] ')) {
                    return <div key={idx} className="preview-checkbox">☐ {line.replace('- [ ] ', '')}</div>;
                  }
                  if (line.startsWith('- ')) {
                    return <div key={idx} className="preview-list-item">• {line.replace('- ', '')}</div>;
                  }
                  if (line.startsWith('|')) {
                    return <div key={idx} className="preview-table-line">{line}</div>;
                  }
                  if (line.trim() === '') {
                    return <div key={idx} className="preview-blank-line" />;
                  }
                  if (line.startsWith('**') && line.endsWith('**')) {
                    return <div key={idx} className="preview-bold">{line.replace(/\*\*/g, '')}</div>;
                  }
                  return <div key={idx} className="preview-text">{line}</div>;
                })}
              </div>
            </div>
            <div className="preview-footer">
              <p className="preview-desc">{previewTemplate.description}</p>
              <div className="preview-actions">
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
    </div>
  );
}