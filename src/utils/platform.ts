/** 平台感知工具：修饰键文案等 */

export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

/** 主修饰键显示文案：macOS 用 ⌘，其余平台用 Ctrl */
export const modKey = isMac ? '⌘' : 'Ctrl'
