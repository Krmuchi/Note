import type { Template } from '@/types/templates';

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
