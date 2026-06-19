export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  content: string;
  tags?: string[];
  usageCount: number;
  createdAt: string;
}

export interface TemplateCategory {
  id: string;
  name: string;
  icon: string;
  templates: Template[];
}

export type TemplateCategoryId = 'work' | 'personal' | 'project' | 'education' | 'meeting';