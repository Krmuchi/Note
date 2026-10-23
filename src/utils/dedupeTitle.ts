/**
 * 去掉"与文档标题完全重复的首行 H1"。
 *
 * 背景：本项目有独立的文档标题字段（侧栏/面包屑/搜索结果都读它），
 * 而 Markdown 内容里也常自带一个 `# 标题`（从别的工具导入、或用户手写）。
 * 两者同时存在时，正文顶部会出现**两个一模一样的标题**，看起来像渲染错误。
 *
 * 处理策略（已与产品确认的方向）：**打开文档时一次性合并**，而不是渲染时隐藏。
 * - 隐藏只是把问题藏起来：用户仍然能选中、能编辑那个"看不见的标题"；
 * - 合并是可逆的语义操作：被删掉的只是一个与标题逐字相同的 H1，零信息损失。
 *
 * 严格条件（避免误删用户内容）：
 * 1. 必须是**首行**，且是 1 级标题（`#`）；
 * 2. 标题文本与 `doc.title` 去除首尾空白后**完全相同**（区分大小写）；
 * 3. 文档标题本身非空。
 */

/** 返回合并后的内容；无需改动时返回 null（调用方据此避免无谓的写盘与版本快照） */
export function stripDuplicateTitleHeading(content: string, title: string): string | null {
  const normalizedTitle = (title ?? '').trim()
  if (!normalizedTitle || !content) return null

  // 只检查第一行：允许行尾有空白，标题文本用捕获组精确比较
  const newlineAt = content.indexOf('\n')
  const firstLine = newlineAt === -1 ? content : content.slice(0, newlineAt)
  const match = /^#\s+(.*)$/.exec(firstLine)
  if (!match) return null
  if (match[1].trim() !== normalizedTitle) return null

  const rest = newlineAt === -1 ? '' : content.slice(newlineAt + 1)
  // 连带吃掉标题后的空行，避免文档以空段落开头
  const trimmed = rest.replace(/^\s*\n/, '')
  return trimmed
}
