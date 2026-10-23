import { newId } from '@/store/storeUtils'

/**
 * 可撤销的批量操作记录。
 *
 * 背景：批量打标签 / 移动 / 收藏 / 置顶 都没有撤销入口 —— 误操作只能手工逐个改回来，
 * 而批量恰恰是最容易误点的一类操作（一次影响 N 篇文档）。
 *
 * 设计取舍：不为这些操作引入通用命令栈（那需要把 store 的每个 action 都改造一遍，
 * 成本远大于收益）。只保存"反向操作"闭包，配合 toast 上的"撤销"按钮，
 * 时效由 toast 停留时间自然界定（8 秒），过期即作废。
 */

export interface UndoableBatch {
  id: string
  /** 人类可读的操作描述，用于提示文案 */
  label: string
  /** 执行反向操作 */
  undo: () => void
}

/** 当前可撤销的批量操作（只保留最近一次：批量操作是连续动作，栈式历史反而更难用） */
let pendingBatch: UndoableBatch | null = null

export function setPendingBatchUndo(label: string, undo: () => void): string {
  const id = newId()
  pendingBatch = { id, label, undo }
  return id
}

/**
 * 撤销指定批次。
 * 必须校验 id：toast 可能延迟触发，期间用户又做了新的批量操作，
 * 不校验就会"撤销掉另一次操作"。
 */
export function undoBatch(id: string): boolean {
  if (!pendingBatch || pendingBatch.id !== id) return false
  const { undo } = pendingBatch
  pendingBatch = null
  try {
    undo()
    return true
  } catch (err) {
    console.error('[undoBatch] 撤销批量操作失败:', err)
    return false
  }
}

/** 丢弃待撤销记录（例如用户已经手动改了别的东西） */
export function clearPendingBatchUndo(): void {
  pendingBatch = null
}
