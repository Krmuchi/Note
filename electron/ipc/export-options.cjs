// 导出 / 打印的可配置项（C4 / C5）。
//
// 纯逻辑（不 require electron），便于 vitest 直接测试 —— 与 AI 层、window-state 同一约定。
// 所有来自渲染进程的值都要过这里，绝不直接透传给 Chromium 的打印接口。

const PAGE_SIZES = ['A4', 'A3', 'A5', 'Letter'];

/** 页边距预设（英寸，Chromium printToPDF 的单位） */
const MARGIN_PRESETS = {
  narrow: 0.25,
  normal: 0.5,
  wide: 0.9,
};

const DEFAULT_PAGE_SIZE = 'A4';
const DEFAULT_MARGIN = 'normal';

/**
 * 带页眉页脚时，上下边距必须留得下 —— 否则页码会压在正文上。
 * 这是 Chromium 的行为：displayHeaderFooter 会把页眉页脚画在页边距区域内。
 */
const HEADER_FOOTER_MIN_MARGIN = 0.4;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 归一化导出选项：未知值一律回落到默认，不抛错（用户界面上的选择不该让导出直接失败）。
 * @returns {{pageSize: string, margin: string, margins: {top:number,bottom:number,left:number,right:number}, headerFooter: boolean}}
 */
function normalizeExportOptions(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};

  const pageSize = PAGE_SIZES.includes(source.pageSize) ? source.pageSize : DEFAULT_PAGE_SIZE;
  const margin = Object.prototype.hasOwnProperty.call(MARGIN_PRESETS, source.margin)
    ? source.margin
    : DEFAULT_MARGIN;
  const headerFooter = source.headerFooter === true;

  const base = MARGIN_PRESETS[margin];
  const vertical = headerFooter ? Math.max(base, HEADER_FOOTER_MIN_MARGIN) : base;

  return {
    pageSize,
    margin,
    headerFooter,
    margins: { top: vertical, bottom: vertical, left: base, right: base },
  };
}

/** Chromium 打印模板：页眉放文档标题，页脚放"第 x / y 页" */
function buildHeaderFooterTemplates(title) {
  const safeTitle = escapeHtml(typeof title === 'string' ? title : '');
  const style = 'font-size:8px; width:100%; padding:0 12mm; color:#666; font-family:sans-serif;';
  return {
    headerTemplate: `<div style="${style}"><span class="title">${safeTitle}</span></div>`,
    footerTemplate: `<div style="${style} text-align:right;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  };
}

module.exports = {
  PAGE_SIZES,
  MARGIN_PRESETS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_MARGIN,
  HEADER_FOOTER_MIN_MARGIN,
  normalizeExportOptions,
  buildHeaderFooterTemplates,
};
