/**
 * 富文本编辑器的特性开关。
 *
 * contenteditable 内核是**架构级替换**。开关保留的意义不在于"未完成"，
 * 而在于给用户一条**退路**：新内核万一在某个边缘场景出问题，
 * 可以立刻切回 textarea，而不是陷入"打不了字"的状态。
 *
 * 默认**开启**（新内核已通过全部验收：单元测试、实机交互、复杂文档无损）。
 *
 * 存储语义（重要）：只有**显式关闭**才写 `'0'`。
 * 不能沿用"写 '1' 表示开启、删除表示关闭"的老写法 ——
 * 默认值改成开启后，删除键会等于"恢复默认（开启）"，
 * 用户永远关不掉。所以这里用"不等于 '0' 即开启"。
 */

const STORAGE_KEY = 'notes-rich-editor'

/** 读取当前开关状态。无存储（首次运行）时返回默认值 **true**。 */
export function isRichEditorEnabled(): boolean {
  try {
    // 只有明确存了 '0' 才算关闭；其它情况（含首次运行、旧版存 '1'）都是开启
    return localStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    // 存储不可用（隐私模式/配额满）时按默认值处理，不能让读取本身抛错
    return true
  }
}

/** 设置开关状态 */
export function setRichEditorEnabled(enabled: boolean): void {
  try {
    // 关闭必须显式写入 '0'：删除键会回落到"默认开启"
    if (enabled) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, '0')
  } catch {
    // 静默失败：开关写不进去只影响下次启动的默认值，不影响本次会话
  }
}

/** 供测试重置（恢复默认：开启） */
export function clearRichEditorFlag(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 同上
  }
}
