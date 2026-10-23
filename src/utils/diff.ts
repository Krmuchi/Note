/**
 * 行级文本 diff 纯函数（LCS 动态规划）。
 * 职责：把两段文本按行比较，分别产出左（当前版本）/ 右（对比版本）两栏的显示行，供版本历史面板双栏对比使用。
 * 原实现内联在 VersionHistoryPanel 组件中，此处原样抽出：算法、复杂度与返回值结构均未改动。
 */

/** diff 操作类型：未变 / 新增 / 删除 / 修改 */
export type DiffOpType = 'unchanged' | 'added' | 'removed' | 'modified'

/** 单条 diff 操作：current 为当前版本侧文本，compare 为对比版本侧文本 */
export interface DiffOp {
  type: DiffOpType
  current?: string
  compare?: string
}

/** 左侧（当前版本）显示行 */
export interface DiffCurrentLine {
  text: string
  type: 'unchanged' | 'added'
}

/** 右侧（对比版本）显示行 */
export interface DiffCompareLine {
  text: string
  type: 'unchanged' | 'removed'
}

/** 双栏对比结果 */
export interface DiffResult {
  current: DiffCurrentLine[]
  compare: DiffCompareLine[]
}

/**
 * 基于 LCS 的行级 diff 算法
 */
export function computeDiff(currentLines: string[], compareLines: string[]): DiffResult {
  const m = currentLines.length
  const n = compareLines.length
  // 构建 LCS 矩阵
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = currentLines[i - 1] === compareLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // 回溯生成 diff 操作序列
  const ops: DiffOp[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && currentLines[i - 1] === compareLines[j - 1]) {
      ops.unshift({ type: 'unchanged', current: currentLines[i - 1], compare: compareLines[j - 1] })
      i--; j--
    } else if (i > 0 && j > 0 && dp[i - 1][j - 1] >= dp[i - 1][j] && dp[i - 1][j - 1] >= dp[i][j - 1]) {
      // 相邻行不同，视为"修改"
      ops.unshift({ type: 'modified', current: currentLines[i - 1], compare: compareLines[j - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'removed', compare: compareLines[j - 1] })
      j--
    } else {
      ops.unshift({ type: 'added', current: currentLines[i - 1] })
      i--
    }
  }

  // 分别生成两侧显示行
  const current = ops
    .filter(op => op.type !== 'removed')
    .map(op => ({
      text: op.current!,
      type: (op.type === 'modified' ? 'added' : op.type) as 'unchanged' | 'added',
    }))
  const compare = ops
    .filter(op => op.type !== 'added')
    .map(op => ({
      text: op.compare!,
      type: (op.type === 'modified' ? 'removed' : op.type) as 'unchanged' | 'removed',
    }))

  return { current, compare }
}