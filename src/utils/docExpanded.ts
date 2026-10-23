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

/** 清理持久化数据（文档/知识库被删除时同步裁剪，避免残留无用 id） */
export function pruneExpandedDocs(ids: Set<string>, aliveIds: Set<string>): Set<string> {
  const next = new Set<string>()
  ids.forEach((id) => {
    if (aliveIds.has(id)) next.add(id)
  })
  return next
}
