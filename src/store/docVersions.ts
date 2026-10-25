import type { DocVersion, NoteDoc } from '@/types'
import { newId } from './storeUtils'

/**
 * 版本快照的唯一写入层。
 *
 * 为什么要有这个文件：快照此前散在三个地方各写各的，上限策略互相矛盾 ——
 * `coreSlice.pushAutoVersion` 对大文档收紧到 5 份（避免 payload 撞 IPC 50MB 上限），
 * 而 `versionSlice.restoreVersion` / `createVersionSnapshot` 硬编码 50 份全量拷贝。
 * 结果是：一篇 200KB 的文档，自动快照被限制在 5 份，用户点一次「恢复版本」就能
 * 往同一个数组里塞回 50 份全量正文 —— saveNotes 直接撞上限，保存永久失败。
 *
 * 现在所有写入都过 `commitVersions`：容量按**字节预算**统一算，快照数上限只是上限。
 */

/** 快照条数上限（手动版本优先保留，自动版本占用剩余名额） */
export const MAX_VERSIONS = 50

/** 大文档收紧后的条数上限 */
export const MAX_VERSIONS_LARGE_DOC = 5

/** 大文档阈值：超过这个正文长度按大文档处理 */
export const LARGE_DOC_THRESHOLD = 100_000

/**
 * 单篇文档版本区的字节预算。
 *
 * 50 篇中等文档 × 50 份全量快照 ≈ 数百 MB，远超 notes:save 的 50MB 上限；
 * 这里按 8MB/篇 设预算，既容纳正常使用（几十份小快照），
 * 又保证即便用户有几十篇大文档也不会把 payload 撑爆。
 */
export const VERSION_BUDGET_BYTES_PER_DOC = 8 * 1024 * 1024

/** 估算一份快照占用的字节数（按 UTF-8 上界：中文 3 字节/字，统一按 3 计最保守） */
function estimateBytes(version: DocVersion): number {
  return (version.content?.length ?? 0) * 3 + (version.title?.length ?? 0) * 3 + 64
}

/**
 * 统一的快照落盘入口：按字节预算裁剪后写回 `doc.versions`。
 *
 * 保留顺序：新的在前；手动版本（`type === 'manual'`）优先，
 * 因为它们是用户主动「定住」的版本，被自动快照挤掉是数据丢失。
 */
export function commitVersions(doc: NoteDoc, candidates: DocVersion[]): void {
  const large = (doc.content?.length ?? 0) > LARGE_DOC_THRESHOLD
  const countCap = large ? MAX_VERSIONS_LARGE_DOC : MAX_VERSIONS

  const manual = candidates.filter(v => v.type === 'manual')
  const auto = candidates.filter(v => v.type !== 'manual')

  // 手动版本先占名额（最多 countCap 份），剩余名额按新→旧补给自动版本
  const kept: DocVersion[] = manual.slice(0, countCap)
  for (const v of auto) {
    if (kept.length >= countCap) break
    kept.push(v)
  }

  // 再按字节预算裁剪：从尾部（最旧）开始丢，不会丢到一条都不剩
  let total = 0
  let cut = kept.length
  for (let i = 0; i < kept.length; i++) {
    const next = total + estimateBytes(kept[i])
    if (next > VERSION_BUDGET_BYTES_PER_DOC && i > 0) {
      cut = i
      break
    }
    total = next
  }

  doc.versions = kept.slice(0, cut)
}

/** 自动快照去重窗口：这段时间内的连续编辑合并为一份 */
export const AUTO_VERSION_MERGE_WINDOW_MS = 30_000

/**
 * 构造一份快照（不落盘）。
 * 调用方拿它拼进候选列表后交给 `commitVersions`，避免各处重复拼字段。
 */
export function createVersion(
  doc: NoteDoc,
  notebookId: string,
  overrides: Partial<DocVersion> & Pick<DocVersion, 'type'>,
): DocVersion {
  const now = new Date().toISOString()
  return {
    id: newId(),
    docId: doc.id,
    notebookId,
    title: doc.title ?? '',
    content: doc.content ?? '',
    tags: doc.tags ?? [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/**
 * 自动快照：30s 窗口内合并，超出则新建。
 *
 * 副作用：直接在传入的 immer 草稿 doc 上写 `versions`。
 * 必须在 `set((state) => ...)` 内调用（`pushAutoVersion` 的旧约定）。
 */
export function pushAutoVersion(
  doc: NoteDoc,
  notebookId: string,
  updates: Partial<NoteDoc>,
): void {
  const existing = doc.versions || []
  const lastAuto = existing.find(v => v.type === 'auto')
  if (lastAuto && Date.now() - new Date(lastAuto.createdAt).getTime() < AUTO_VERSION_MERGE_WINDOW_MS) {
    return
  }

  // doc/updates 都可能来自未归一化的外部数据（备份导入、草稿恢复），
  // content 缺失时不能直接取 .length，否则 updateDoc 会抛 TypeError 中断编辑
  const nextContent = updates.content ?? doc.content ?? ''

  const version = createVersion(doc, notebookId, {
    type: 'auto',
    // 快照记的是"这次改动之后"的内容与标题
    title: updates.title || doc.title || '',
    content: nextContent,
    tags: updates.tags || doc.tags || [],
  })

  commitVersions(doc, [version, ...existing])
}
