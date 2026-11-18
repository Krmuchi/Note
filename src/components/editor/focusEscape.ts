/**
 * P1-8：编辑器的 Tab 逃生通道。
 *
 * contenteditable（以及 textarea 分支的智能输入）都把 Tab 拦下来做缩进 ——
 * 这是对的，但副作用是**键盘用户永远无法用 Tab 离开正文**：焦点困在编辑器里，
 * 到不了工具栏、大纲、评论面板。浏览器与语雀/Google Docs 的通行约定是
 * "先 Esc、再 Tab"：Esc 表示"我这一步的局部操作结束了"，随后的 Tab 恢复
 * 默认的焦点导航。
 *
 * 两个内核共用这一份状态（在 contenteditable 内部，非用户内容，不影响往返）。
 */

/** 武装有效期：Esc 之后 1.5 秒内的第一个 Tab 才放行 */
const ESCAPE_WINDOW_MS = 1500

let armedAt = 0
let hintShown = false

/**
 * 正文里按下了 Esc，武装下一个 Tab。
 * @returns true 表示这是本会话第一次武装 —— 调用方据此给一次性的提示
 */
export function armFocusEscape(): boolean {
  armedAt = Date.now()
  if (hintShown) return false
  hintShown = true
  return true
}

/**
 * Tab 到来：是否应当放行（交给浏览器做焦点导航）。
 * 读到即消费 —— 逃生是一次性的，用完立刻回到缩进语义。
 */
export function consumeFocusEscape(): boolean {
  if (armedAt === 0) return false
  const withinWindow = Date.now() - armedAt <= ESCAPE_WINDOW_MS
  armedAt = 0
  return withinWindow
}

/**
 * 用户在正文里继续输入 / 点选：主动解除武装，
 * 避免一次误按的 Esc 改变很久之后 Tab 的行为。
 */
export function resetFocusEscape(): void {
  armedAt = 0
}

/** 仅测试使用：连一次性提示标记一起复位 */
export function resetFocusEscapeForTest(): void {
  armedAt = 0
  hintShown = false
}
