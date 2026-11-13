/**
 * 数据加载失败恢复引导的"最小化"状态（模块级外部 store，无 React 依赖）。
 *
 * 背景：coreSlice.loadNotes 失败会置 loadFailed 并阻止一切自动保存（保护磁盘数据）。
 * LoadFailureDialog 是该状态唯一的恢复出口。旧实现的「稍后处理」把弹窗一次性销毁，
 * 此后再无任何入口重新打开 —— 用户继续写的内容全部不落盘，事实上的数据丢失循环。
 *
 * 现在「稍后处理」= 最小化为一条常驻横幅（而非销毁）；横幅或侧栏 SaveIndicator
 * 点击都能重新展开完整恢复引导。用外部 store 承载，让 LoadFailureDialog 与
 * SaveIndicator 两个不相邻的组件共享同一份状态，且不经过 App 透传 props。
 */
let minimized = false
const listeners = new Set<() => void>()

export function isLoadFailureMinimized(): boolean {
  return minimized
}

export function setLoadFailureMinimized(value: boolean): void {
  if (minimized === value) return
  minimized = value
  listeners.forEach((listener) => listener())
}

export function subscribeLoadFailureUi(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}