/**
 * 提示块（callout）的元数据：类型、别名、默认标题、图标路径。
 *
 * 单独成文件的原因：这套元数据要被**三处**共用 ——
 * 1. `markdownToHtml`（编辑器渲染，输出 HTML 字符串）；
 * 2. `remarkCallout`（预览渲染，改 mdast 节点）；
 * 3. `MarkdownPreview`（预览的标题图标，React 组件）。
 * 分散定义会导致"编辑器里是橙色感叹号、预览里变成别的图标"这类漂移。
 */

export type CalloutKind = 'tip' | 'note' | 'warning' | 'danger' | 'success'

export const CALLOUT_KINDS: CalloutKind[] = ['tip', 'note', 'warning', 'danger', 'success']

/** 语法别名 → 规范类型（从别处粘来的 `[!INFO]` / `[!CAUTION]` 也要能识别） */
export const CALLOUT_ALIAS: Record<string, CalloutKind> = {
  tip: 'tip',
  note: 'note',
  info: 'note',
  warning: 'warning',
  warn: 'warning',
  caution: 'warning',
  danger: 'danger',
  error: 'danger',
  success: 'success',
  done: 'success',
}

/** 用户没写标题时展示的默认文案 */
export const CALLOUT_LABELS: Record<CalloutKind, string> = {
  tip: '提示',
  note: '说明',
  warning: '注意',
  danger: '警告',
  success: '完成',
}

/**
 * 图标路径（24×24 viewBox，线性描边）。
 *
 * 只存 path 的 `d`，由调用方决定包成 HTML 字符串还是 React 元素。
 * 不用 emoji：SVG 的 <path> 不产生 textContent，不会污染回写时
 * "块是否被编辑过"的可见文本比较。
 */
export const CALLOUT_PATHS: Record<CalloutKind, string[]> = {
  tip: ['M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z'],
  note: ['M12 16v-4M12 8h.01', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z'],
  warning: ['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4M12 17h.01'],
  danger: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M15 9l-6 6M9 9l6 6'],
  success: ['M22 11.1V12a10 10 0 1 1-5.9-9.1', 'M22 4 12 14.01l-3-3'],
}

export function normalizeCalloutKind(raw: string): CalloutKind | null {
  return CALLOUT_ALIAS[raw.toLowerCase()] ?? null
}

/** 编辑器侧：直接拼成 HTML 字符串（`markdownToHtml` 的输出形态） */
export function calloutIconHtml(kind: CalloutKind): string {
  const paths = CALLOUT_PATHS[kind].map((d) => `<path d="${d}"/>`).join('')
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
}
