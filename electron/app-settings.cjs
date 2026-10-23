// 应用级设置（主进程需要知道的那些）：托盘行为、全局快捷键开关。
//
// 刻意不放进渲染层的 localStorage / notes-data.json：
// - 主进程要在**窗口还没创建时**就决定托盘与快捷键行为；
// - notes-data.json 会被导出/备份，而这些是"本机偏好"，不该跟着数据走。
//
// 纯逻辑（不 require electron），便于 vitest 直接测试。

const path = require("node:path");

const SETTINGS_FILE = "app-settings.json";

const DEFAULT_SETTINGS = {
  /** 关闭窗口时最小化到托盘，而不是退出应用 */
  closeToTray: false,
  /** 启用全局速记快捷键（任意界面唤起便签） */
  globalQuickNote: false,
  /** 开机自启（系统登录项），Windows / macOS 生效 */
  autoLaunch: false,
  /** 窗口不在前台时也用系统通知提醒（长任务完成等） */
  notifyWhenBackground: true,
  /** 界面缩放（P8）：重启后保持上次的缩放比例 */
  zoomFactor: 1,
  /** 自定义更新清单地址（D3）；留空则用仓库的 GitHub Releases */
  updateManifestUrl: "",
  /** 自定义数据目录（O5）；留空表示用系统默认的 userData 目录 */
  dataDir: "",
  /** 是否把 .md 关联到本应用（P5，仅 Windows，默认关闭） */
  fileAssociation: false,
  /** 关联前的 .md 默认值，关闭开关时用于恢复 */
  previousMdAssociation: "",
};

/** 缩放范围：小到看不清或大到一屏只有几个字都没有意义 */
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2;

function clampZoom(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SETTINGS.zoomFactor;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

/** 只接受已知字段，未知字段一律丢弃（防脏数据把主进程行为带偏） */
function sanitizeSettings(raw) {
  const result = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return result;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const expected = typeof DEFAULT_SETTINGS[key];
    if (typeof raw[key] !== expected) continue;
    // 更新地址只放行 https，避免被脏数据指到 http / file 上
    if (key === "updateManifestUrl" && raw[key] && !/^https:\/\//.test(raw[key])) continue;
    // 数据目录必须是绝对路径；相对路径会让数据落到进程工作目录，位置随启动方式变化
    if (key === "dataDir" && raw[key] && !require("node:path").isAbsolute(raw[key])) continue;
    result[key] = raw[key];
  }
  result.zoomFactor = clampZoom(result.zoomFactor);
  return result;
}

/**
 * @param {object} deps
 * @param {string} deps.dir 设置文件所在目录（通常是 app.getPath("userData")）
 * @param {object} [deps.fsSync] 注入 node:fs（测试可替换）
 */
function createAppSettingsStore({ dir, fsSync = require("node:fs") }) {
  const file = path.join(dir, SETTINGS_FILE);
  let cache = null;

  function read() {
    if (cache) return { ...cache };
    try {
      cache = sanitizeSettings(JSON.parse(fsSync.readFileSync(file, "utf-8")));
    } catch {
      // 首次启动（文件不存在）或文件损坏：都用默认值，不打扰用户
      cache = { ...DEFAULT_SETTINGS };
    }
    return { ...cache };
  }

  function write(patch) {
    const next = sanitizeSettings({ ...read(), ...(patch || {}) });
    try {
      fsSync.writeFileSync(file, JSON.stringify(next, null, 2), "utf-8");
      cache = next;
      return { ok: true, settings: { ...next } };
    } catch (err) {
      console.warn("[app-settings] 保存设置失败:", err && err.message ? err.message : err);
      return { ok: false, error: "保存设置失败" };
    }
  }

  return { file, read, write };
}

module.exports = {
  createAppSettingsStore,
  sanitizeSettings,
  DEFAULT_SETTINGS,
  SETTINGS_FILE,
  MIN_ZOOM,
  MAX_ZOOM,
  clampZoom,
};
