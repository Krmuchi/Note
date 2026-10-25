/**
 * 可由快捷键直接触发的格式化动作 id（与 `FormatType` / `keyboardSlice` 对齐）。
 *
 * 为什么单独成模块：这个集合被**两个内核共用** —— textarea 内核的
 * `useEditorKeys` 用它分发快捷键，富文本内核的 `RichEditor` 用它判断
 * "这次按键是不是格式化动作"。
 *
 * 它原先定义在 `useEditorKeys.ts` 里，于是 `RichEditor`（默认内核、必进首屏）
 * 为了拿一个常量，把 `useEditorKeys` + `useEditorLineOps`（约 357 行）整条
 * 依赖链拖进了主分块 —— 旧内核"改成 React.lazy"的收益被这一个 import 吃掉了。
 * 常量下沉到不依赖任何 hook 的模块，两边都只拉常量。
 */
export const FORMAT_ACTIONS: ReadonlySet<string> = new Set<string>([
  'bold', 'italic', 'underline', 'strike', 'code',
  'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
  'ulist', 'olist', 'tasklist', 'quote', 'link',
])
