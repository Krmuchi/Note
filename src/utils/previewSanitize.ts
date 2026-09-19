import type { CSSProperties } from 'react'
import { defaultUrlTransform } from 'react-markdown'
import { defaultSchema, type Options } from 'rehype-sanitize'

/**
 * 预览渲染消毒（安全基线）。
 *
 * 背景：`content` 里允许出现编辑器写入的行内 HTML（`<span style>`、`<mark>`、
 * `<div style="text-align">`、`<u>`、`<sup>/<sub>`），但旧实现把这串内容直接交给
 * `rehype-raw` 原样渲染，没有任何消毒环节。于是"从网页粘贴的内容 / 导入的 .md /
 * 别人给的备份文件"里的 `<script>`、`onclick`、`javascript:` 链接会被原样注入预览 DOM。
 *
 * 本模块在 hast-util-sanitize 的默认白名单（GitHub 级）之上做最小必要扩展：
 * 1. 补齐默认白名单缺失、但编辑器确实会产出的标签与属性（`u`、`mark`、`style`）；
 * 2. 放行本地图片/附件所需的 `file:`、`data:` 协议（默认仅 http/https，会把落盘图片
 *    的 `file://` 路径整个丢掉，导致预览里图片全部消失）；
 * 3. 保留 rehype-katex 识别公式节点所需的 `language-math`/`math-inline`/`math-display`
 *    类名（默认只放行 `language-*` 正则）。
 *
 * 执行顺序：必须在 rehype-katex **之前**（见 `MarkdownPreview`）。这样 KaTeX 自身
 * 产出的大量 `span/style` 不会经过消毒流程，公式渲染不受影响；这也是 rehype-katex
 * 官方文档推荐的顺序。
 *
 * 另需配套 `previewUrlTransform`（见文件末尾）：react-markdown 在渲染前还会用
 * `defaultUrlTransform` 过滤一遍 `src`/`href`，而它只放行 http/https/irc/mailto/xmpp，
 * 会把 `file://` 与 `data:` 地址整个清空——只改消毒白名单不改这里，图片依然不显示。
 */

/** 编辑器工具栏会写入的 CSS 属性白名单（与 useEditorFormatting / editorTextOps 输出一致） */
const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'background',
  'background-color',
  'font-size',
  'font-weight',
  'font-style',
  'text-align',
  'text-decoration',
  'line-height',
])

/**
 * 危险样式值特征：
 * - `url(...)` / `@import`：外链资源，可用于追踪或覆盖页面样式
 * - `expression(...)` / `javascript:` / `vbscript:`：老式脚本执行入口
 * - 反斜杠与注释符：CSS 转义绕过与声明逃逸
 * - `</` 与控制字符：尝试闭合属性或插入标签
 */
// eslint-disable-next-line no-control-regex -- 这里正是要匹配控制字符并拒绝它们
const UNSAFE_STYLE_VALUE_RE = /url\s*\(|expression\s*\(|javascript:|vbscript:|@import|\\|<\/|\/\*|[\u0000-\u001f]/i

/** 单条 style 长度上限：正常编辑器输出的样式远小于该值，超长视为异常输入 */
const MAX_STYLE_LENGTH = 300

/**
 * 按白名单过滤一串 CSS 声明。
 * 全部声明都被过滤掉时返回 `undefined`（等价于该元素不带 style）。
 */
export function sanitizeCssStyle(style?: string | null): string | undefined {
  if (!style || typeof style !== 'string') return undefined
  if (style.length > MAX_STYLE_LENGTH) return undefined

  const safe: string[] = []
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon === -1) continue
    const prop = declaration.slice(0, colon).trim().toLowerCase()
    const value = declaration.slice(colon + 1).trim()
    if (!prop || !value) continue
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue
    if (UNSAFE_STYLE_VALUE_RE.test(value)) continue
    safe.push(`${prop}:${value}`)
  }
  return safe.length > 0 ? safe.join(';') : undefined
}

/** camelCase 样式键 → CSS 属性名（`backgroundColor` → `background-color`） */
function toKebabCase(prop: string): string {
  return prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

/**
 * 解析并消毒样式，返回 React 可直接使用的样式对象。
 *
 * 兼容两种输入：
 * - hast 上保留的原始 `style` 字符串（rehype-raw 产出的形态）
 * - react-markdown 已经转好的样式对象（style-to-js 产出）
 *
 * 两者都必须经过同一份白名单，避免"对象形态绕过字符串过滤"的缺口。
 */
export function parseSafeStyle(input: unknown): CSSProperties | undefined {
  let declarations = ''
  if (typeof input === 'string') {
    declarations = input
  } else if (input && typeof input === 'object') {
    declarations = Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${toKebabCase(key)}:${String(value)}`)
      .join(';')
  }

  const sanitized = sanitizeCssStyle(declarations)
  if (!sanitized) return undefined

  const out: Record<string, string> = {}
  for (const declaration of sanitized.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon === -1) continue
    const prop = declaration.slice(0, colon)
    const value = declaration.slice(colon + 1)
    out[prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value
  }
  return out as CSSProperties
}

/** 属性白名单的一条规则集合 */
type AttributeList = NonNullable<Options['attributes']>[string]

/** rehype-katex 官方要求在消毒阶段放行的公式类名（配合 `language-*` 正则） */
const CODE_ATTRIBUTES: AttributeList = [
  ['className', /^language-./, 'math-inline', 'math-display'],
]

/** 只放开编辑器确实会产出 style 的标签，其余标签的 style 一律由消毒器丢弃 */
const STYLE_TAGS = ['span', 'div', 'mark', 'u', 'sup', 'sub'] as const

/** 在默认属性白名单上补出编辑器所需的 style 支持 */
function buildAttributes(): NonNullable<Options['attributes']> {
  const attributes: NonNullable<Options['attributes']> = { ...(defaultSchema.attributes ?? {}) }
  for (const tag of STYLE_TAGS) {
    const existing: AttributeList = attributes[tag] ?? []
    attributes[tag] = existing.includes('style') ? existing : [...existing, 'style']
  }
  attributes.code = CODE_ATTRIBUTES
  return attributes
}

/** 预览渲染消毒配置（默认白名单 + 最小必要扩展） */
export const previewSchema: Options = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'u', 'mark'],
  attributes: buildAttributes(),
  protocols: {
    ...(defaultSchema.protocols ?? {}),
    // 桌面模式图片落盘为 file:// 路径，Web 模式为 data: URL；
    // 默认白名单只有 http/https，会把两者都判定为非法协议并清除 src
    src: [...(defaultSchema.protocols?.src ?? []), 'file', 'data'],
    href: [...(defaultSchema.protocols?.href ?? []), 'file'],
  },
  // 默认只丢弃 <script> 的内容。style/iframe 等不在 tagNames 中的标签会被"拆壳保留
  // 内容"，于是 CSS 文本、iframe 的降级内容会漏进正文，这里显式丢弃这些标签的内容
  strip: [
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'form',
    'link',
    'meta',
    'base',
    'template',
  ],
}

/** 内联图片允许的 data: 媒体类型（其余 data:（如 text/html）一律拒绝） */
const SAFE_DATA_URL_RE = /^data:image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml|avif);/i

/**
 * react-markdown 的 URL 过滤器，替代默认的 `defaultUrlTransform`。
 *
 * 默认实现只放行 http/https/irc/ircs/mailto/xmpp，会把桌面端落盘图片的 `file://`
 * 路径和 Web 端的内联 `data:` 图片判为非法并清空 src（预览里图片全部消失）。
 * 这里在默认规则之上补两个例外，其余协议仍交给默认实现把关：
 * - `file:` —— 本地图片/附件（Electron 渲染进程可信来源）
 * - `data:image/*`（仅 `src`）—— 内联图片；`href` 不放开，避免 data:text/html 钓鱼
 */
export function previewUrlTransform(url: string, key: string): string {
  const colon = url.indexOf(':')
  if (colon !== -1) {
    const protocol = url.slice(0, colon).toLowerCase()
    if (protocol === 'file') return url
    if (protocol === 'data' && key === 'src' && SAFE_DATA_URL_RE.test(url)) return url
  }
  return defaultUrlTransform(url)
}
