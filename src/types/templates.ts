export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  content: string;
  tags?: string[];
  /**
   * 冷启动热度权重（内置模板的历史热度基线）。
   * 展示/排序时的真实次数 = baseUsageCount + store.templateUsage[id]（用户实际使用累计）。
   */
  baseUsageCount?: number;
  createdAt: string;
}

export interface TemplateCategory {
  id: string;
  name: string;
  icon: string;
  templates: Template[];
}

export type TemplateCategoryId = 'work' | 'personal' | 'project' | 'education' | 'meeting';