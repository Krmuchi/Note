/**
 * 极简模糊匹配（快速打开用）。S6：2026-11-17 起支持拼音首字母与全拼。
 *
 * 打分四档：「完全相等 / 前缀 / 子串 / 字符子序列」；
 * 拼音匹配复用同一套打分 —— 先把标题转成「首字母串」与「全拼串」（pinyin-pro，
 * 带 Map 缓存），再对两串各打一次分取最高。
 *
 * 依赖约束：pinyin-pro 只应从**异步入口**可达（QuickOpenPanel 在 App 里是 React.lazy），
 * 否则字典会进启动 preload —— 与 CLAUDE.md 的启动包预算直接冲突，改动 import 链前先看 dist/index.html。
 */
import { pinyin } from 'pinyin-pro'

/** 命中 CJK 的粗判：只要标题含常用汉字，就值得算拼音 */
const CJK_RE = /[\u4e00-\u9fff]/

interface PinyinForms {
  /** 周记会议 → 'zjhy' */
  first: string
  /** 周记会议 → 'zhoujihuiyi' */
  full: string
}

const pinyinCache = new Map<string, PinyinForms>()
const PINYIN_CACHE_CAP = 4000

/**
 * 标题 → 拼音两串。
 * 用 type:'array' + nonZh:'consecutive'：汉字逐字出结果、连续非汉字整体保留，
 * join 后再剥掉空白 —— 拉丁部分仍按原样参与子序列匹配（'周记 README' → 'zjREADME'）。
 * pinyin-pro 对个别字符会抛错或返回原文，包 try/catch 兜底：匹配是锦上添花，
 * 绝不能因为一张脏字符表让快速打开面板崩掉。
 */
function pinyinForms(text: string): PinyinForms {
  const hit = pinyinCache.get(text)
  if (hit) return hit

  let forms: PinyinForms
  try {
    const first = pinyin(text, { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'consecutive' }).join('')
    const full = pinyin(text, { toneType: 'none', type: 'array', nonZh: 'consecutive' }).join('')
    forms = { first: first.replace(/\s+/g, ''), full: full.replace(/\s+/g, '') }
  } catch {
    forms = { first: '', full: '' }
  }

  // 容量兜底：标题总数远小于上限；异常场景（脏数据反复造 key）直接清空重来
  if (pinyinCache.size >= PINYIN_CACHE_CAP) pinyinCache.clear()
  pinyinCache.set(text, forms)
  return forms
}

/** 对单串打四档分（原始 fuzzyScore 的主体，供原文与拼音串复用） */
function scoreAgainst(target: string, q: string): number {
  if (target === q) return 1000

  const index = target.indexOf(q)
  if (index === 0) return 900
  if (index > 0) return 800 - Math.min(index, 199)

  // 字符子序列：按顺序出现即可，间隔越多分越低
  let cursor = 0
  let gaps = 0
  let lastHit = -1
  for (let i = 0; i < target.length && cursor < q.length; i++) {
    if (target[i] !== q[cursor]) continue
    if (lastHit >= 0) gaps += i - lastHit - 1
    lastHit = i
    cursor++
  }

  if (cursor === q.length) return Math.max(1, 300 - Math.min(gaps, 299))
  return 0
}

export function fuzzyScore(text: string, query: string): number {
  const target = text.toLowerCase()
  const q = query.trim().toLowerCase()
  if (!q) return 1

  const direct = scoreAgainst(target, q)

  // 拼音通道（S6）：仅当 —— 标题含汉字、查询是拉丁字母/数字（用户在打首字母或全拼）、
  // 且原文没给出满分答案时才启用；查询含汉字时拼音串必然打不出分，直接跳过省一次正则。
  if (direct >= 1000 || !CJK_RE.test(target) || !/[a-z0-9]/.test(q)) return direct

  const { first, full } = pinyinForms(text)
  if (!first && !full) return direct
  return Math.max(
    direct,
    first ? scoreAgainst(first.toLowerCase(), q) : 0,
    full ? scoreAgainst(full.toLowerCase(), q) : 0,
  )
}
