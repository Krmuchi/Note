/** 斜杠命令项定义 */
export interface SlashCommandItem {
  id: string;
  title: string;
  /** 模糊搜索关键词（含英文别名，如 table / code / date） */
  keywords: string[];
  group: 'block' | 'media' | 'advanced';
  /** 图标：复用工具栏的字符/符号方案，避免引入图标库 */
  icon: string;
  /** 右侧键位提示（可选） */
  hint?: string;
  /** 传给 applyFormat 的附加参数（如提示块类型） */
  options?: { callout?: string; language?: string };
  /**
   * 实际应用的格式类型；缺省时等于 id。
   * 提示块有 5 个变体共用同一个 FormatType('callout')，id 必须唯一（React key、
   * 键盘选中都按 id 区分），因此需要把"命令 id"与"格式类型"分开。
   */
  format?: string;
}

/**
 * 斜杠命令清单：id 与 FormatType 对齐，执行时先删除 `/query` 再复用 applyFormat。
 * 单独成文件：SlashCommandMenu.tsx 只导出组件，常量与组件分离才能保住 Fast Refresh。
 */
export const SLASH_ITEMS: SlashCommandItem[] = [
  { id: 'heading1', title: '标题 1', keywords: ['h1', 'heading', 'biaoti'], group: 'block', icon: 'H1', hint: 'Ctrl+1' },
  { id: 'heading2', title: '标题 2', keywords: ['h2', 'heading', 'biaoti'], group: 'block', icon: 'H2', hint: 'Ctrl+2' },
  { id: 'heading3', title: '标题 3', keywords: ['h3', 'heading', 'biaoti'], group: 'block', icon: 'H3', hint: 'Ctrl+3' },
  { id: 'ulist', title: '无序列表', keywords: ['ul', 'list', 'liebiao'], group: 'block', icon: '•' },
  { id: 'olist', title: '有序列表', keywords: ['ol', 'list', 'liebiao'], group: 'block', icon: '1.' },
  { id: 'tasklist', title: '任务列表', keywords: ['task', 'todo', 'renwu'], group: 'block', icon: '☑' },
  { id: 'quote', title: '引用块', keywords: ['quote', 'yinyong'], group: 'block', icon: '❝' },
  { id: 'codeblock', title: '代码块', keywords: ['code', 'pre', 'daima'], group: 'block', icon: '</>' },
  { id: 'table', title: '表格', keywords: ['table', 'biaoge'], group: 'block', icon: '⊞' },
  { id: 'divider', title: '分割线', keywords: ['hr', 'divider', 'fengexian'], group: 'block', icon: '—' },
  { id: 'image', title: '图片', keywords: ['image', 'img', 'tupian'], group: 'media', icon: '🖼' },
  { id: 'link', title: '链接', keywords: ['link', 'url', 'lianjie'], group: 'media', icon: '🔗' },
  { id: 'callout-tip', format: 'callout', title: '提示块', keywords: ['tip', 'callout', 'tishi', 'tishi kuai', 'gaoliang'], group: 'advanced', icon: '💡', options: { callout: 'tip' } },
  { id: 'callout-note', format: 'callout', title: '说明块', keywords: ['note', 'info', 'shuoming'], group: 'advanced', icon: 'ℹ', options: { callout: 'note' } },
  { id: 'callout-warning', format: 'callout', title: '注意块', keywords: ['warning', 'warn', 'zhuyi'], group: 'advanced', icon: '⚠', options: { callout: 'warning' } },
  { id: 'callout-danger', format: 'callout', title: '警告块', keywords: ['danger', 'error', 'jinggao'], group: 'advanced', icon: '⛔', options: { callout: 'danger' } },
  { id: 'callout-success', format: 'callout', title: '完成块', keywords: ['success', 'done', 'wancheng'], group: 'advanced', icon: '✅', options: { callout: 'success' } },
  { id: 'code', title: '行内代码', keywords: ['code', 'inline', 'daima'], group: 'advanced', icon: '`' },
  { id: 'clearFormat', title: '清除格式', keywords: ['clear', 'qingchu'], group: 'advanced', icon: '🧹' },
];
