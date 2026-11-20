/** 斜杠命令项定义 */
import type { ReactNode } from 'react';
import {
  IconCheck,
  IconImage,
  IconInfo,
  IconLightbulb,
  IconLink,
  IconWarning,
} from '@/components/common/Icon';

export interface SlashCommandItem {
  id: string;
  title: string;
  /** 模糊搜索关键词（含英文别名，如 table / code / date） */
  keywords: string[];
  group: 'block' | 'media' | 'advanced';
  /**
   * 图标：统一走全仓 SVG 线性图标体系（<IconXxx />，24px viewBox / currentColor），
   * 没有贴合件的场合才用 24 viewBox、stroke 2 的内联 svg 或纯字形字符串（H1、•、1. 等）。
   * **不放 emoji** —— emoji 跨平台渲染漂移、不随主题变色（见 Icon.tsx 头注与 tests/unit/iconContract.test.ts）。
   */
  icon: ReactNode;
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

/** 线性内联图标（无现成 Icon 件：禁止符号 / 成功圈 / 橡皮擦），与 Icon.tsx 同 24 视口 */
const ICON_STYLE = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const, focusable: 'false' as const };

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
  { id: 'tasklist', title: '任务列表', keywords: ['task', 'todo', 'renwu'], group: 'block', icon: <IconCheck size={14} /> },
  { id: 'quote', title: '引用块', keywords: ['quote', 'yinyong'], group: 'block', icon: '❝' },
  { id: 'codeblock', title: '代码块', keywords: ['code', 'pre', 'daima'], group: 'block', icon: '</>' },
  { id: 'table', title: '表格', keywords: ['table', 'biaoge'], group: 'block', icon: '⊞' },
  { id: 'divider', title: '分割线', keywords: ['hr', 'divider', 'fengexian'], group: 'block', icon: '—' },
  { id: 'image', title: '图片', keywords: ['image', 'img', 'tupian'], group: 'media', icon: <IconImage size={14} /> },
  { id: 'link', title: '链接', keywords: ['link', 'url', 'lianjie'], group: 'media', icon: <IconLink size={14} /> },
  { id: 'callout-tip', format: 'callout', title: '提示块', keywords: ['tip', 'callout', 'tishi', 'tishi kuai', 'gaoliang'], group: 'advanced', icon: <IconLightbulb size={14} />, options: { callout: 'tip' } },
  { id: 'callout-note', format: 'callout', title: '说明块', keywords: ['note', 'info', 'shuoming'], group: 'advanced', icon: <IconInfo size={14} />, options: { callout: 'note' } },
  { id: 'callout-warning', format: 'callout', title: '注意块', keywords: ['warning', 'warn', 'zhuyi'], group: 'advanced', icon: <IconWarning size={14} />, options: { callout: 'warning' } },
  { id: 'callout-danger', format: 'callout', title: '警告块', keywords: ['danger', 'error', 'jinggao'], group: 'advanced', icon: (
      <svg {...ICON_STYLE} width="14" height="14">
        <circle cx="12" cy="12" r="9" />
        <line x1="5.7" y1="5.7" x2="18.3" y2="18.3" />
      </svg>
    ), options: { callout: 'danger' } },
  { id: 'callout-success', format: 'callout', title: '完成块', keywords: ['success', 'done', 'wancheng'], group: 'advanced', icon: (
      <svg {...ICON_STYLE} width="14" height="14">
        <path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" />
        <polyline points="22 4 12 14 9 11" />
      </svg>
    ), options: { callout: 'success' } },
  { id: 'code', title: '行内代码', keywords: ['code', 'inline', 'daima'], group: 'advanced', icon: '`' },
  { id: 'clearFormat', title: '清除格式', keywords: ['clear', 'qingchu'], group: 'advanced', icon: (
      <svg {...ICON_STYLE} width="14" height="14">
        <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
        <path d="M22 21H7" />
        <path d="m5 11 9 9" />
      </svg>
    ) },
];
