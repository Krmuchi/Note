/**
 * 文档树展开态的持久化（对齐语雀：刷新/重启后保持上次的展开状态）。
 *
 * 存的是"已展开集合"而不是"已折叠集合"：
 * 文档树默认是收起的，绝大多数节点不该被记进 localStorage ——
 * 存折叠集合会把**所有未展开的文档 id** 都写进去，一个几百篇的库能撑到几十 KB。
 *
 * 容量上限：只保留最近操作过的 500 条。展开集合是"用户主动点开过"的记录，
 * 超出这个量级后旧记录已无参考价值，而无限增长会拖慢每次读写。
 */

const STORAGE_KEY = 'notes-doc-expanded'
const MAX_ENTRIES = 500

/** 读取已展开的文档 id 集合；存储不可用或数据损坏时返回空集合 */
export function readExpandedDocs(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()

    // 过滤掉非字符串项：手改过的 localStorage 不该让文档树崩掉
    const ids = parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
    return new Set(ids.slice(-MAX_ENTRIES))
  } catch {
    return new Set()
  }
}

/**
 * 写入展开态；超出上限时保留最后写入的 MAX_ENTRIES 条。
 *
 * @param aliveIds 可选：当前仍存在的文档 id 集合。传入时会在写入前裁掉已删除文档的残留 id ——
 *   把清理放在**写入路径**而不是组件的 effect 里，避免"effect 里 setState 驱动渲染"
 *   （那会触发级联渲染，也是 react-hooks/set-state-in-effect 明确拦下的写法）。
 */
export function writeExpandedDocs(ids: Set<string>, aliveIds?: Set<string>): void {
  try {
    const source = aliveIds ? pruneExpandedDocs(ids, aliveIds) : ids
    const list = [...source].slice(-MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 存储不可用（隐私模式 / 配额满）：展开态是纯体验优化，失败不应影响使用
  }
}

/**
 * 创建「存活 id 集」派生器：成员不变时返回**同一个 Set 引用**。
 *
 * 用途：DocTree 的 persistExpanded effect 依赖 aliveDocIds —— 击键/改标题会换
 * activeNotebook 引用，但 id 集不变；引用稳定后 effect 不会跟着每次修改重跑
 * （重跑＝debounce 反复重置 + JSON.stringify + 同步 setItem）。
 * 成员变化（增删文档）时返回新 Set，effect 照常触发写回。
 */
export function createAliveIdsDeriver(): (docs: readonly { id: string }[]) => Set<string> {
  let prev: Set<string> | null = null
  return (docs) => {
    const next = new Set<string>()
    for (const doc of docs) next.add(doc.id)
    if (prev && prev.size === next.size) {
      let same = true
      for (const id of next) {
        if (!prev.has(id)) {
          same = false
          break
        }
      }
      if (same) return prev
    }
    prev = next
    return next
  }
}

/** 清理持久化数据（文档/知识库被删除时同步裁剪，避免残留无用 id） */
export function pruneExpandedDocs(ids: Set<string>, aliveIds: Set<string>): Set<string> {
  const next = new Set<string>()
  ids.forEach((id) => {
    if (aliveIds.has(id)) next.add(id)
  })
  return next
}
