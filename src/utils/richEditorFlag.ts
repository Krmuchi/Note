import { useSyncExternalStore } from 'react'

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
 *
 * 为什么是外部 store（useSyncExternalStore）而不是 useState lazy init：
 * 旧实现只在挂载时读一次，改完开关必须刷新页面，而开关又只存在于 devtools
 * （设置页没有入口）—— 等于"退路存在但没人能走"。现在设置页可以直接切换，
 * 切换后所有订阅者（Editor）立即重渲染，无需刷新。
 */

const STORAGE_KEY = 'notes-rich-editor'

/* ---------------- 外部 store ---------------- */

const listeners = new Set<() => void>()

/**
 * useSyncExternalStore 要求 getSnapshot 在无变更时返回**同一个值**（引用稳定）。
 * 布尔是原始值，天然稳定；这里额外缓存一份，是为了让"订阅时同步 localStorage"
 * 这件事有地方落脚 —— 否则 devtools 改完 localStorage 后 hook 永远看不到。
 */
let cached = readFromStorage()

function readFromStorage(): boolean {
  try {
    // 只有明确存了 '0' 才算关闭；其它情况（含首次运行、旧版存 '1'）都是开启
    return localStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    // 存储不可用（隐私模式/配额满）时按默认值处理，不能让读取本身抛错
    return true
  }
}

function emitChange(): void {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  // 订阅时对齐一次：localStorage 可能在组件卸载期间被外部改动（devtools / 另一个窗口）
  cached = readFromStorage()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/*
 * 两个读取入口的分工，别混用：
 *  - `isRichEditorEnabled()`：**每次实时读 localStorage**。供非 React 代码与测试使用，
 *    行为与旧实现完全一致（直接写 localStorage 也能被读到）。
 *  - `useRichEditorEnabled()`：读缓存的快照，靠 emitChange 触发重渲染。
 *    getSnapshot 必须稳定，不能在渲染期返回会变的临时值，否则 React 会无限重渲染。
 */

/** 读取当前开关状态（每次实时读存储，非 React 场景使用）。 */
export function isRichEditorEnabled(): boolean {
  cached = readFromStorage()
  return cached
}

/** 设置开关状态（会通知所有订阅者，无需刷新页面）。 */
export function setRichEditorEnabled(enabled: boolean): void {
  try {
    // 关闭必须显式写入 '0'：删除键会回落到"默认开启"
    if (enabled) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, '0')
  } catch {
    // 静默失败：开关写不进去只影响下次启动的默认值，不影响本次会话
  }
  if (cached === enabled) return
  cached = enabled
  emitChange()
}

/** 供测试重置（恢复默认：开启） */
export function clearRichEditorFlag(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 同上
  }
  if (cached !== true) {
    cached = true
    emitChange()
  }
}

/**
 * 订阅开关状态（React）。
 *
 * 与 `isRichEditorEnabled()` 的区别：这个会随开关变化重渲染，
 * 编辑器内核分支必须用它，否则切换开关后界面不更新。
 *
 * getSnapshot 读 `cached` 而不是实时读存储 —— React 在渲染期可能多次调用它，
 * 返回实时值会让"无变更时引用稳定"这条契约失效（布尔虽不变，但配合
 * subscribe 里的对齐逻辑才是完整语义）。
 */
export function useRichEditorEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => cached, () => cached)
}
