/**
 * 状态栏的纯文本计算（与组件分离，便于单测，也不破坏 Fast Refresh）。
 *
 * 从 EditorStatusBar.tsx 抽出的原因：组件文件里导出非组件函数会让
 * react-refresh 失效（改一行就要整页重载）。
 */

/**
 * 换行位置缓存。
 *
 * 必须以**内容字符串本身**为键，不能按 `text.length` 判断失效：
 * 等长替换（"aaa\nbbb" → "aa\nbbbb"）会让基于长度的缓存返回过期结果，
 * 状态栏的行列显示随之出错。
 */
let cachedContent: string | null = null
let cachedNewlines: number[] = []

/** 取内容中所有换行符的位置（升序）；同一份内容复用上一次的结果 */
export function getNewlinePositions(text: string): number[] {
  if (cachedContent === text) return cachedNewlines
  const newlines: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) newlines.push(i)
  }
  cachedContent = text
  cachedNewlines = newlines
  return newlines
}

/** 统计小于 pos 的换行数（即光标所在行号 - 1） */
export function countNewlinesBefore(newlines: number[], pos: number): number {
  let lo = 0
  let hi = newlines.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (newlines[mid] < pos) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * 光标所在行列（1 基）。
 *
 * 旧实现是 `text.substring(0, pos).split('\n')`：每次按键都分配一个
 * 「光标之前的全文」字符串再拆数组，长文档下纯为显示「行 X, 列 Y」
 * 就要 O(文档长度) 的内存与时间。
 * 现在列号从光标向前找上一个换行（通常只扫很短一段），行号走缓存的二分查找。
 */
export function getCursorPosition(text: string, selectionStart: number): { line: number; column: number } {
  if (!text) return { line: 1, column: 1 }

  const pos = Math.max(0, Math.min(selectionStart, text.length))
  // 列号：从光标向前找上一个换行，命中即停
  const lastNewline = text.lastIndexOf('\n', pos - 1)
  const column = pos - lastNewline

  // 行号：复用同内容的换行位置表
  const line = countNewlinesBefore(getNewlinePositions(text), pos) + 1

  return { line, column }
}
