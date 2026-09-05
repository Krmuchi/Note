import { useState, useCallback } from 'react';
import type { Template } from '@/types/templates';

interface CustomTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (template: Template) => void;
  editTemplate?: Template | null;
}

const CUSTOM_TEMPLATES_KEY = 'notes-custom-templates';

/** 加载自定义模板 */
export function loadCustomTemplates(): Template[] {
  try {
    const saved = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

/** 保存自定义模板 */
export function saveCustomTemplates(templates: Template[]): void {
  try {
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
  } catch {
    // ignore
  }
}

/** 删除自定义模板 */
export function deleteCustomTemplate(id: string): void {
  const templates = loadCustomTemplates();
  const filtered = templates.filter(t => t.id !== id);
  saveCustomTemplates(filtered);
}

export default function CustomTemplateModal({ isOpen, onClose, onSave, editTemplate }: CustomTemplateModalProps) {
  const [name, setName] = useState(editTemplate?.name || '');
  const [description, setDescription] = useState(editTemplate?.description || '');
  const [content, setContent] = useState(editTemplate?.content || '');
  const [category, setCategory] = useState(editTemplate?.category || 'custom');
  const [icon, setIcon] = useState(editTemplate?.icon || '📝');
  const [tags, setTags] = useState(editTemplate?.tags?.join(', ') || '');

  const handleSave = useCallback(() => {
    if (!name.trim() || !content.trim()) return;

    const template: Template = {
      id: editTemplate?.id || `custom-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || '自定义模板',
      content: content.trim(),
      category: category || 'custom',
      icon: icon || '📝',
      tags: tags.split(',').map(t => t.trim()).filter(t => t),
      usageCount: editTemplate?.usageCount || 0,
      createdAt: editTemplate?.createdAt || new Date().toISOString().split('T')[0],
    };

    onSave(template);
    onClose();
  }, [name, description, content, category, icon, tags, editTemplate, onSave, onClose]);

  if (!isOpen) return null;

  return (
    <div className="custom-template-overlay" onClick={onClose}>
      <div className="custom-template-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editTemplate ? '编辑模板' : '创建自定义模板'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>模板名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入模板名称"
              className="form-input"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>描述</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简短描述模板用途"
              className="form-input"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>图标</label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="📝"
                className="form-input"
                maxLength={2}
              />
            </div>

            <div className="form-group">
              <label>分类</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="form-select"
              >
                <option value="custom">自定义</option>
                <option value="work">工作办公</option>
                <option value="meeting">会议协作</option>
                <option value="project">项目管理</option>
                <option value="personal">个人生活</option>
                <option value="education">学习教育</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>标签（用逗号分隔）</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="例如: 工作, 会议, 计划"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>模板内容 *（支持 Markdown）</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="输入模板内容，支持 Markdown 语法"
              className="form-textarea"
              rows={12}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!name.trim() || !content.trim()}
          >
            {editTemplate ? '保存修改' : '创建模板'}
          </button>
        </div>
      </div>
    </div>
  );
}
