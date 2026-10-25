/**
 * 编辑器工具栏的 UI 状态类型。
 *
 * 放在 types/ 而不是组件文件里：`useEditorHeaderMenus` 需要它们，
 * 而 hook 不该为了一个类型去 import 具体组件模块（层倒置）。
 */

/** 颜色选择器当前激活的页签 */
export type ColorTab = 'text' | 'highlight'
