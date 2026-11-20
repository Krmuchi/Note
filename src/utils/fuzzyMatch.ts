/**
 * 极简模糊匹配（快速打开用）。S6：2026-11-17 起支持拼音首字母与全拼。
 *
 * 打分四档：「完全相等 / 前缀 / 子串 / 字符子序列」；
 * 拼音匹配复用同一套打分 —— 先把标题转成「首字母串」与「全拼串」（pinyin-pro，
 * 带 Map 缓存），再对两串各打一次分取最高。
 *
 * 依赖约束（包预算红线）：pinyin-pro 只应从**异步入口**可达（QuickOpenPanel 在 App 里
 * 是 React.lazy），且这里用**动态 import** 把 pinyin-pro 拆成独立 chunk —— 静态 import
 * 会让整本字典成为快速打开 chunk 的同步依赖。改动 import 链前先看 dist/index.html。
 *
 * 击键期约束（S6 性能）：1000 篇标题全量建拼音索引约 300~800ms，绝不能发生在首键
 * 击键路径上。现在的分工：
 * - loadPinyinEngine()：动态加载引擎（QuickOpenPanel 打开时预热，不阻塞首键）；
 * - prebuildPinyinForms()：**分批**补建缓存（面板在 requestIdleCallback 空闲片里调用）；
 * - fuzzyScore 的 cacheOnlyPinyin：批量打分（rankQuickOpenItems）只读缓存，
 *   未缓存条目由调用方按预算（rankQuickOpenItems 的 pinyinBuildBudget）补建。
 * 引擎未就绪 / 缓存未命中时拼音通道整体退化为原文匹配，绝不抛错。
 */

type PinyinFn = typeof import('pinyin-pro').pinyin

let pinyinEngine: PinyinFn | null = null
let enginePromise: Promise<boolean> | null = null

/** 拼音引擎是否已就绪（就绪前拼音通道整体退化为原文匹配） */
export function isPinyinEngineReady(): boolean {
  return pinyinEngine !== null
}

/**
 * 动态加载 pinyin-pro（独立 chunk，不进启动 preload）。重复调用共享同一 Promise；
 * 加载失败返回 false —— 拼音匹配是锦上添花，降级为原文匹配即可。
 */
export function loadPinyinEngine(): Promise<boolean> {
  if (pinyinEngine) return Promise.resolve(true)
  enginePromise ??= import('pinyin-pro')
    .then((mod) => {
      pinyinEngine = mod.pinyin
      return true
    })
    .catch(() => false)
  return enginePromise
}

/** 命中 CJK 的粗判：只要标题含常用汉字，就值得算拼音 */
const CJK_RE = /[\u4e00-\u9fff]/

interface PinyinForms {
  /** 周记会议 → 'zj' */
  first: string
  /** 周记会议 → 'zhoujihuiyi' */
  full: string
}

const pinyinCache = new Map<string, PinyinForms>()
const PINYIN_CACHE_CAP = 4000

/**
 * 标题 → 拼音两串（带缓存）。
 * 用 type:'array' + nonZh:'consecutive'：汉字逐字出结果、连续非汉字整体保留，
 * join 后再剥掉空白 —— 拉丁部分仍按原样参与子序列匹配（'周记 README' → 'zjREADME'）。
 * pinyin-pro 对个别字符会抛错或返回原文，包 try/catch 兜底：匹配是锦上添花，
 * 绝不能因为一张脏字符表让快速打开面板崩掉。
 *
 * 返回 null 表示"这次拿不到拼音"：引擎尚未加载，或调用方指定只读缓存（cacheOnly）。
 */
function pinyinForms(text: string, allowCompute: boolean): PinyinForms | null {
  const hit = pinyinCache.get(text)
  if (hit) return hit
  if (!pinyinEngine || !allowCompute) return null

  let forms: PinyinForms
  try {
    const first = pinyinEngine(text, { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'consecutive' }).join('')
    const full = pinyinEngine(text, { toneType: 'none', type: 'array', nonZh: 'consecutive' }).join('')
    forms = { first: first.replace(/\s+/g, ''), full: full.replace(/\s+/g, '') }
  } catch {
    forms = { first: '', full: '' }
  }

  // 容量兜底：标题总数远小于上限；异常场景（脏数据反复造 key）直接清空重来
  if (pinyinCache.size >= PINYIN_CACHE_CAP) pinyinCache.clear()
  pinyinCache.set(text, forms)
  return forms
}

/**
 * 分批预构建拼音缓存（面板打开后在空闲片里调用）：
 * 最多处理 maxCount 条**尚未缓存且含汉字**的串，返回实际处理条数。
 * 已缓存 / 非汉字的串不占预算；引擎未就绪时返回 0。
 */
export function prebuildPinyinForms(texts: readonly string[], maxCount: number): number {
  if (!pinyinEngine || maxCount <= 0) return 0
  let processed = 0
  for (const text of texts) {
    if (processed >= maxCount) break
    if (pinyinCache.has(text) || !CJK_RE.test(text)) continue
    pinyinForms(text, true)
    processed++
  }
  return processed
}

/** 当前拼音缓存条数（预构建进度 / 测试断言用） */
export function pinyinCacheSize(): number {
  return pinyinCache.size
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

/**
 * 模糊打分。options.cacheOnlyPinyin = true 时拼音通道**只读缓存**：
 * 批量打分（如 rankQuickOpenItems）用它把建索引的成本移出击键路径，
 * 缓存外的条目本次按原文打分，等预构建/预算补建后再纳入拼音命中。
 */
export function fuzzyScore(text: string, query: string, options?: { cacheOnlyPinyin?: boolean }): number {
  const target = text.toLowerCase()
  const q = query.trim().toLowerCase()
  if (!q) return 1

  const direct = scoreAgainst(target, q)

  // 拼音通道（S6）：仅当 —— 标题含汉字、查询是拉丁字母/数字（用户在打首字母或全拼）、
  // 且原文没给出满分答案时才启用；查询含汉字时拼音串必然打不出分，直接跳过省一次正则。
  if (direct >= 1000 || !CJK_RE.test(target) || !/[a-z0-9]/.test(q)) return direct

  const forms = pinyinForms(text, !options?.cacheOnlyPinyin)
  if (!forms || (!forms.first && !forms.full)) return direct
  return Math.max(
    direct,
    forms.first ? scoreAgainst(forms.first.toLowerCase(), q) : 0,
    forms.full ? scoreAgainst(forms.full.toLowerCase(), q) : 0,
  )
}
