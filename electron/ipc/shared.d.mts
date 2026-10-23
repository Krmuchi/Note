/**
 * electron/ipc/shared.mjs 的类型声明。
 *
 * 这个模块被两侧共用：主进程 require()、渲染层 import（Web 模式的导出 HTML 生成）。
 * 之前是 .cjs，TypeScript 对没有声明的 .cjs 会静默按 any 处理；
 * 换成 .mjs 后必须显式声明，否则报 TS7016。既然要写，就写准确的类型，
 * 让渲染层调用导出函数时能真正被类型检查覆盖。
 */

export declare const MAX_STORE_BYTES: number
export declare const MAX_EXPORT_CONTENT_BYTES: number
export declare const MAX_EXPORT_DOCS: number
export declare const MAX_IMAGE_BYTES: number

/** 校验 notes:save 全量存储 payload；通过时返回序列化后的 JSON 字符串 */
export declare function assertStorePayload(payload: unknown): string

/** 校验导出类 payload（title/content/docs），不通过则抛错 */
export declare function assertExportPayload(
  payload: { title?: string; content?: string; docs?: Array<{ title: string; content: string }> },
  options?: { allowDocs?: boolean },
): void

/** 文件名字符清洗（去掉 Windows 不允许的字符） */
export declare function safeName(name?: string): string

/** HTML 转义，导出 HTML/PDF 时必须 */
export declare function escapeHtml(str: unknown): string

/** markdown → 导出用 HTML 片段 */
export declare function markdownToSimpleHtml(content?: string): string

/** 生成完整导出 HTML 文档（HTML 导出 / PDF 打印 / Web 导出共用） */
export declare function buildExportDocument(options?: {
  title?: string
  content?: string
  forPrint?: boolean
}): string
