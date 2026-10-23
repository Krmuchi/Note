/**
 * 撤销历史的合并策略（纯逻辑，便于单测）。
 *
 * 背景：旧实现只有一个固定的 1 秒合并窗口 —— 持续打字时整段输入会被合并成**一次**撤销，
 * 一次 Ctrl+Z 可能回退好几个句子；而两段毫不相关的输入只要间隔不到 1 秒也会被合并。
 *
 * 现在的规则更贴近用户预期：
 * 1. **停顿**超过 mergeWindow → 新开一条历史；
 * 2. 刚输入的字符是**句子边界**（空格 / 标点 / 换行）→ 新开一条历史；
 *    这样"写一句、空格、再写一句"可以逐句撤销，而不是逐段；
 * 3. 其余情况合并（连续打同一句话时不会每敲一个字就压一条快照）。
 */

/** 触发历史分界的字符：空格、常见中英标点、换行 */
const BOUNDARY_CHARS = new Set([
  ' ', '\n', '\t',
  '.', ',', ';', ':', '!', '?',
  '。', '，', '、', '；', '：', '！', '？',
  '…', '—', '）', ')', '】', '」', '』',
])

/** 该字符是否意味着"一句话写完了" */
export function isHistoryBoundaryChar(char: string | undefined | null): boolean {
  if (!char) return false
  return BOUNDARY_CHARS.has(char)
}

export interface ShouldStartNewHistoryParams {
  /** 上一次记录历史的时间戳（毫秒），0 表示尚无历史 */
  lastHistoryAt: number
  /** 当前时间戳（毫秒） */
  now: number
  /** 合并窗口（毫秒） */
  mergeWindow: number
  /** 本次输入产生的新增文本（可能为空：删除、撤销等） */
  insertedText?: string
}

/**
 * 是否应当开启一条新的撤销历史。
 *
 * 注意：删除操作永远不开启新历史 —— 否则"删掉一个词再撤销"会变成撤销一次删除，
 * 而不是撤销整段编辑；这正是用户最容易觉得"撤销坏了"的场景。
 */
export function shouldStartNewHistory({
  lastHistoryAt,
  now,
  mergeWindow,
  insertedText,
}: ShouldStartNewHistoryParams): boolean {
  // 还没有任何历史：必须从这里开始
  if (!lastHistoryAt) return true

  // 停顿足够久：视为新的编辑动作
  if (now - lastHistoryAt > mergeWindow) return true

  // 句子边界：让"逐句撤销"成立
  if (insertedText && isHistoryBoundaryChar(insertedText.slice(-1))) return true

  return false
}

/**
 * 计算两次文本之间的新增片段（用于判断最后一个输入字符是否为边界）。
 * 只做前缀/后缀对齐，足以覆盖文本域里的常规输入场景；无法对齐时返回空串。
 */
export function extractInsertedText(previous: string, next: string): string {
  if (previous === next) return ''
  // 纯删除
  if (next.length < previous.length && previous.startsWith(next)) return ''

  let prefix = 0
  const maxPrefix = Math.min(previous.length, next.length)
  while (prefix < maxPrefix && previous[prefix] === next[prefix]) prefix++

  let suffix = 0
  const maxSuffix = Math.min(previous.length - prefix, next.length - prefix)
  while (
    suffix < maxSuffix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++
  }

  return next.slice(prefix, next.length - suffix)
}
