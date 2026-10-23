// 窗口位置 / 大小的持久化。
// 刻意不 require("electron")：纯逻辑便于单测（主进程模块在 vitest 里无法加载）。
// 显示器信息与 fs 由调用方注入。

const path = require("node:path");

const WINDOW_STATE_FILE = "window-state.json";
const DEFAULT_BOUNDS = { width: 1280, height: 840 };
const MIN_BOUNDS = { width: 980, height: 700 };

function toFiniteInt(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * 计算本次启动应使用的窗口尺寸与位置。
 *
 * 两个容易踩的点：
 * 1. 外接屏拔掉后，旧坐标可能落在"已不存在的显示器"上，直接套用会让窗口出现在看不见的地方
 *   —— 用户体感是"点了图标但应用没打开"。因此必须与当前显示器工作区求交。
 * 2. 保存的值还要过一遍最小值钳制，否则旧版本/手工改坏的 state 能造出比 minWidth 还窄的窗口。
 */
function resolveWindowBounds(state, displays) {
  const width = Math.max(MIN_BOUNDS.width, toFiniteInt(state && state.width) || DEFAULT_BOUNDS.width);
  const height = Math.max(MIN_BOUNDS.height, toFiniteInt(state && state.height) || DEFAULT_BOUNDS.height);

  const x = toFiniteInt(state && state.x);
  const y = toFiniteInt(state && state.y);
  if (x === null || y === null) return { width, height };

  const list = Array.isArray(displays) ? displays : [];
  const visible = list.some((display) => {
    const area = display && display.workArea;
    if (!area) return false;
    return (
      x < area.x + area.width &&
      x + width > area.x &&
      y < area.y + area.height &&
      y + height > area.y
    );
  });

  return visible ? { x, y, width, height } : { width, height };
}

/**
 * @param {object} deps
 * @param {string} deps.dir 状态文件所在目录（通常是 app.getPath("userData")）
 * @param {() => Array} deps.displays 返回当前显示器列表（Electron screen.getAllDisplays）
 * @param {object} [deps.fsSync] 注入 node:fs（测试可替换）
 */
function createWindowStateStore({ dir, displays, fsSync = require("node:fs") }) {
  const file = path.join(dir, WINDOW_STATE_FILE);

  function read() {
    try {
      const parsed = JSON.parse(fsSync.readFileSync(file, "utf-8"));
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      // 首次启动（文件不存在）或文件损坏：都退回默认尺寸，不打扰用户
      return null;
    }
  }

  function write(state) {
    try {
      fsSync.writeFileSync(file, JSON.stringify(state), "utf-8");
      return true;
    } catch (err) {
      console.warn("[window-state] 保存窗口状态失败:", err && err.message ? err.message : err);
      return false;
    }
  }

  /** 本次启动应使用的窗口参数 */
  function readBounds() {
    return resolveWindowBounds(read(), typeof displays === "function" ? displays() : []);
  }

  /** 是否应在启动时直接最大化 */
  function readMaximized() {
    const state = read();
    return !!(state && state.maximized);
  }

  return { file, read, write, readBounds, readMaximized };
}

module.exports = { createWindowStateStore, resolveWindowBounds, WINDOW_STATE_FILE, DEFAULT_BOUNDS, MIN_BOUNDS };
