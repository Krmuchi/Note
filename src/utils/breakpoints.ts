/**
 * 响应式断点常量（TS 侧唯一来源）。
 *
 * 注意：CSS 无法读取 TS 常量，`src/styles/responsive.css` 中的 media query 必须
 * 与此处保持数值一致（该文件顶部有对应注释指向本文件）。
 * 之前 MOBILE_BREAKPOINT 只是散落在 hooks 里的魔数镜像，改动时容易与 CSS 漂移。
 */

/** 桌面宽屏 → 常规（CSS: max-width: 1200px） */
export const BREAKPOINT_WIDE = 1200

/** 常规 → 紧凑（CSS: max-width: 992px） */
export const BREAKPOINT_COMPACT = 992

/** 紧凑 → 移动端抽屉导航（CSS: max-width: 768px） */
export const BREAKPOINT_MOBILE = 768

/** 移动端 → 窄屏（CSS: max-width: 576px） */
export const BREAKPOINT_NARROW = 576

/** 兼容旧引用：布局面板低于该宽度时切换为移动端模式 */
export const MOBILE_BREAKPOINT = BREAKPOINT_MOBILE