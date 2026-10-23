/**
 * 启动性能标记（F1）。
 *
 * 这个项目此前**没有任何启动耗时数据** —— 谈优化只能凭感觉。
 * 这里用最小的代价记录几个关键节点（模块加载 → 应用挂载 → 数据加载完成 → 首篇文档渲染），
 * 在数据加载完成时汇总打印一次，方便在开发/打包环境下横向比较改动前后的差异。
 *
 * 刻意不引入任何依赖、不做远程上报（隐私与体积都划不来）。
 */

interface PerfSnapshot {
  /** 相对模块加载时刻的毫秒数 */
  boot: number
  appMounted?: number
  dataLoaded?: number
  firstDocRendered?: number
}

const startedAt = typeof performance !== 'undefined' ? performance.now() : 0
const snapshot: PerfSnapshot = { boot: 0 }
let logged = false

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/** 记录节点耗时（同一节点只记第一次，避免重复渲染把首次数据覆盖掉） */
export function markPerf(node: keyof PerfSnapshot): void {
  if (node === 'boot') return
  if (snapshot[node] !== undefined) return
  snapshot[node] = Math.round(now() - startedAt)
  maybeLog()
}

function maybeLog(): void {
  if (logged || snapshot.dataLoaded === undefined) return
  logged = true
  // eslint-disable-next-line no-console -- 启动性能摘要：每次启动只打印一次，供开发者直接比对
  console.log(
    '[perf] 启动：模块 ' + snapshot.boot + 'ms ｜ 应用挂载 ' +
      (snapshot.appMounted ?? '-') + 'ms ｜ 数据加载完成 ' + snapshot.dataLoaded +
      'ms ｜ 首篇文档渲染 ' + (snapshot.firstDocRendered ?? '-') + 'ms',
  )
}

/** 读取当前快照（供调试或"复制诊断信息"使用） */
export function readPerfSnapshot(): Readonly<PerfSnapshot> {
  return { ...snapshot }
}

/** 单行摘要，便于贴进诊断信息 */
export function formatPerfSnapshot(): string {
  const parts = [
    '模块 ' + snapshot.boot + 'ms',
    '应用挂载 ' + (snapshot.appMounted ?? '-') + 'ms',
    '数据加载 ' + (snapshot.dataLoaded ?? '-') + 'ms',
    '首篇文档 ' + (snapshot.firstDocRendered ?? '-') + 'ms',
  ]
  return parts.join(' / ')
}
