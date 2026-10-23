/**
 * 拖文件到窗口导入（体验优化方案 P6）。
 *
 * 编辑器内部的拖放只处理"图片/附件插入当前文档"；把 .md 拖到窗口任意位置，
 * 用户的预期是"导入成新文档"。这里只负责纯逻辑，事件接线在 useFileDropImport。
 */

export const IMPORTABLE_EXTENSIONS = ['.md', '.markdown', '.txt'] as const

export function isImportableFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return IMPORTABLE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** 去掉扩展名，作为兜底标题 */
function basename(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim() || '导入的文档'
}

/**
 * 由文件名 + 内容推导标题与正文。
 * 标题优先取正文第一个 Markdown 标题（与「导入文档」菜单的行为保持一致），
 * 没有标题行时用文件名。
 */
export function deriveDocFromFile(name: string, content: string): { title: string; content: string } {
  const firstLine = content.split('\n').find((line) => line.trim().length > 0) ?? ''
  const headingMatch = firstLine.match(/^#{1,6}\s+(.+)$/)
  return {
    title: headingMatch ? headingMatch[1].trim() : basename(name),
    content,
  }
}

/** 拖拽内容里是否有"可导入的文档文件"（用于决定要不要显示导入遮罩） */
export function hasImportableFiles(files: { name: string }[] | undefined): boolean {
  if (!files || files.length === 0) return false
  return files.some((file) => isImportableFileName(file.name))
}
