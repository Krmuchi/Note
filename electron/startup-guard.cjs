// 启动阶段"可恢复失败"的处置决策（纯逻辑，不 require electron，可直接单测）。
//
// 背景（P1-5）：此前主进程对两类失败只写 console ——
//   * did-fail-load：生产环境 dist/index.html 加载失败，用户面对永远的白窗，
//     界面里没有 React、也没有 ErrorBoundary，渲染层那套恢复链全部够不着；
//   * render-process-gone：直接 win.webContents.reload()，没有次数上限，
//     渲染层反复崩溃时窗口会自己"闪一下"地无限循环，且用户全程看不到原因。
// 这里把"第几次失败、该怎么办"抽成纯函数；main.cjs 只负责执行决策与弹框。

/** 渲染进程崩溃允许的自动重载次数，超过后改为向用户拿指示 */
const MAX_RENDER_RELOADS = 3;

/**
 * 窗口在内容就绪前保持隐藏的兜底显示延迟（毫秒）。
 * 正常路径由 ready-to-show 触发；ready-to-show 不触发（加载失败、极端卡顿）时
 * 必须兜底显示窗口，否则"加载失败"会表现成"应用根本没启动"。
 */
const SHOW_FALLBACK_MS = 4000;

/**
 * @param {{ maxRenderReloads?: number }} [options]
 * @returns {{
 *   recordLoadFail: () => { count: number, action: 'dialog' },
 *   recordRenderGone: () => { count: number, action: 'reload' | 'dialog' },
 *   reset: () => void,
 *   counts: () => { loadFails: number, renderGones: number },
 * }}
 */
function createLoadGuard(options = {}) {
  const maxRenderReloads =
    typeof options.maxRenderReloads === "number" && options.maxRenderReloads > 0
      ? options.maxRenderReloads
      : MAX_RENDER_RELOADS;
  let loadFails = 0;
  let renderGones = 0;

  return {
    // 界面加载失败没有"自动重试"的价值（多半是产物缺失 / 被安全软件拦截）：直接找用户拿指示
    recordLoadFail() {
      loadFails += 1;
      return { count: loadFails, action: "dialog" };
    },
    // 崩溃先自动重载，超限后交给用户决定（重载 / 退出），绝不无限循环
    recordRenderGone() {
      renderGones += 1;
      return {
        count: renderGones,
        action: renderGones <= maxRenderReloads ? "reload" : "dialog",
      };
    },
    // 一次成功加载即视为恢复：之后的崩溃重新计数
    reset() {
      loadFails = 0;
      renderGones = 0;
    },
    counts() {
      return { loadFails, renderGones };
    },
  };
}

/**
 * 窗口原生背景色：BrowserWindow 默认是纯白，深色主题下窗口出现的第一帧会白闪 ——
 * 渲染层 public/theme-init.js 只能管到文档首帧，管不到原生窗口这一层。
 * 主进程读不到 localStorage（它属于渲染层），故按系统深浅色取中性灰。
 */
function resolveWindowBackgroundColor(shouldUseDark) {
  return shouldUseDark ? "#1a1a1a" : "#f0f0f0";
}

module.exports = {
  createLoadGuard,
  resolveWindowBackgroundColor,
  MAX_RENDER_RELOADS,
  SHOW_FALLBACK_MS,
};
