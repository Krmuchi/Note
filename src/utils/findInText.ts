/**
 * 文档内查找的纯逻辑（BUG-3）。
 *
 * 编辑器是 textarea：DOM 无法给"全部命中"加高亮（没有富文本层），
 * 所以采用"选中当前命中 + 滚动到视口"的方案 —— 尽早在预览/渲染层之外
 * 提供可用的查找能力，不引入自绘高亮层的对齐风险。
 */

import { escapeRegExp } from '@/utils/sanitize'

export interface FindMatch {
  index: number
  length: number
}

/**
 * 查找选项。
 *
 * 原先只有"是否区分大小写"一个开关，且实现是纯 indexOf —— 想要"整词"或
 * 正则只能先去外部工具查好再贴回来。这里把两种模式都收进查找逻辑内部：
 * 匹配、计数、"全部替换"、"当前替换后重新定位"共用同一套规则，
 * 避免各自实现导致计数与实际替换不一致。
 */
export interface FindOptions {
  /** 区分大小写（默认 false） */
  caseSensitive?: boolean
  /** 全词匹配：命中两侧不能紧贴"词字符" */
  wholeWord?: boolean
  /** 把查询串当作正则表达式 */
  regex?: boolean
}

/** 查找结果。valid=false 表示查询串本身非法（目前只有"正则语法错误"） */
export interface FindResult {
  matches: FindMatch[]
  valid: boolean
  /** 非法原因，可直接作为无效态提示展示 */
  error?: string
  /** 编译后的正则；仅 regex 模式用于替换时展开 $1 这类捕获组引用 */
  regexp?: RegExp
}

/*
 * "词字符"的判定口径：\w 之外的 CJK / 假名 / 谚文也算词字符，
 * 否则"关键词"这种纯中文查询在 wholeWord 下几乎永远是 0 命中。
 */
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u

/** 单个字符是否属于"词"的一部分 */
export function isWordChar(char: string | undefined): boolean {
  if (!char) return false
  return WORD_CHAR_RE.test(char)
}

/**
 * 编译查询串。
 *
 * regex 模式必须 try/catch：用户敲到一半的 `(`、`[` 是常态，
 * 抛异常会让整个查找栏（乃至 React 树）崩掉，这里降级成"非法模式"返回 null。
 */
export function compileFindRegExp(query: string, options: FindOptions = {}): RegExp | null {
  if (!query) return null
  const { caseSensitive = false, regex = false } = options
  try {
    return new RegExp(regex ? query : escapeRegExp(query), caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}

/**
 * 核心查找：返回全部命中区间 + 查询串是否合法。
 *
 * 零宽匹配（如 `a*`、`(?:)`）**不计入命中**：它会让"下一个"永远停在原地、
 * 也让"替换"变成在同一处无限插入文本，直接当作没有命中处理。
 */
export function findMatches(text: string, query: string, options: FindOptions = {}): FindResult {
  const { wholeWord = false, regex = false } = options
  if (!query) return { matches: [], valid: true }

  // 先编译：空文档 + 非法正则时也要如实报"无效"，不能因为没正文就放过
  const re = compileFindRegExp(query, options)
  if (!re) {
    return { matches: [], valid: false, error: invalidPatternMessage(query) }
  }
  if (!text) return { matches: [], valid: true, regexp: regex ? re : undefined }

  const matches: FindMatch[] = []
  let found: RegExpExecArray | null = re.exec(text)
  while (found) {
    const length = found[0].length
    if (length > 0) {
      const start = found.index
      const end = start + length
      // 全词：两侧都不能紧贴词字符。用"是否紧贴"而不是 \b —— 中文没有词边界
      const wholeWordOk = !wholeWord || (!isWordChar(text[start - 1]) && !isWordChar(text[end]))
      if (wholeWordOk) matches.push({ index: start, length })
      re.lastIndex = end
      found = re.exec(text)
    } else {
      // 零宽：手推一格，否则 exec 永远停在同一位置造成死循环
      re.lastIndex = found.index + 1
      found = re.exec(text)
    }
  }

  return { matches, valid: true, regexp: regex ? re : undefined }
}

/** 给非法正则生成一句面向用户的提示（浏览器的原生报错是英文） */
function invalidPatternMessage(query: string): string {
  // 单独再编译一次取原生报错文案；失败时回退到通用提示
  try {
    new RegExp(query)
  } catch (err) {
    if (err instanceof Error && err.message) return `正则表达式无效：${err.message}`
  }
  return '正则表达式无效'
}

/**
 * 找出全部匹配（不重叠，按出现顺序）。
 *
 * 第三参数保留"区分大小写"的布尔写法（既有调用方与单测按这个签名用），
 * 需要全词 / 正则时用第四参数的对象写法。
 */
export function findAllMatches(
  text: string,
  query: string,
  caseSensitive = false,
  options: Omit<FindOptions, 'caseSensitive'> = {},
): FindMatch[] {
  return findMatches(text, query, { ...options, caseSensitive }).matches
}

/** 文本偏移 → 行号（0 基） */
export function lineIndexAt(text: string, index: number): number {
  let line = 0
  const end = Math.min(index, text.length)
  for (let i = 0; i < end; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

/**
 * 把某一行滚动进视口所需的 scrollTop。
 * 目标行放在视口 1/3 处而不是正中：上下文更完整，连续按"下一个"时跳动也更可预期。
 */
export function computeScrollTop(lineIndex: number, lineHeight: number, viewportHeight: number): number {
  return Math.max(0, lineIndex * lineHeight - viewportHeight / 3)
}

/** 读取 textarea 的实际行高（lineHeight 可能是 'normal'，退回字号 × 1.6） */
export function measureLineHeight(ta: HTMLTextAreaElement): number {
  const style = window.getComputedStyle(ta)
  const fontSize = parseFloat(style.fontSize) || 15
  return parseFloat(style.lineHeight) || fontSize * 1.6
}

/* ---------------- 替换 ---------------- */

/**
 * 把一次匹配的替换文本展开。
 *
 * 纯文本查找时按字面量插入（用户写的 `$1` 就应该是 `$1`）；
 * 正则查找时按捕获组展开 `$&` / `$1`…`$99` / `$$`，
 * 与主流编辑器的正则替换手感一致 —— 否则用户想调换 (`(w+), (w+)` → `$2 $1`)
 * 只能得到字面量 `$2 $1`。
 */
export function expandReplacement(
  matched: string,
  groups: Array<string | undefined>,
  replacement: string,
): string {
  return replacement.replace(/\$(\$|&|\d{1,2})/g, (token, body: string) => {
    if (body === '$') return '$'
    if (body === '&') return matched
    const groupIndex = Number(body)
    if (!Number.isInteger(groupIndex) || groupIndex <= 0 || groupIndex > groups.length) return token
    return groups[groupIndex - 1] ?? ''
  })
}

/** 取出某个区间在一次正则执行结果里的捕获组（无正则时返回空数组） */
function captureGroupsAt(regexp: RegExp | undefined, text: string, match: FindMatch): string[] | null {
  if (!regexp) return null
  regexp.lastIndex = match.index
  const found = regexp.exec(text)
  regexp.lastIndex = 0
  if (!found || found.index !== match.index || found[0].length !== match.length) return null
  return found.slice(1)
}

/** 单次替换的文本（供"替换当前"与"全部替换"共用，保证两种走法口径一致） */
export function replacementTextFor(
  text: string,
  match: FindMatch,
  replacement: string,
  regexp?: RegExp,
): string {
  const groups = captureGroupsAt(regexp, text, match)
  if (!groups) return replacement
  return expandReplacement(text.slice(match.index, match.index + match.length), groups, replacement)
}

/**
 * 把全部匹配替换为 replacement，返回新文本。
 * 一次性按匹配区间拼接，避免"边替换边查找"造成的自我递归替换。
 *
 * 传入 regexp（正则模式下 findMatches 返回的那个）时，replacement 支持
 * `$1` 这类捕获组引用；纯文本模式一律按字面量插入。
 */
export function replaceAllMatches(
  text: string,
  matches: FindMatch[],
  replacement: string,
  regexp?: RegExp,
): string {
  if (matches.length === 0) return text
  const expand = (match: FindMatch): string => replacementTextFor(text, match, replacement, regexp)

  let result = ''
  let cursor = 0
  for (const match of matches) {
    result += text.slice(cursor, match.index) + expand(match)
    cursor = match.index + match.length
  }
  return result + text.slice(cursor)
}
