const { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage, screen, Tray, nativeImage, globalShortcut, shell } = require("electron");
const path = require("node:path");
const { createStorageHandlers } = require("./ipc/handlers-storage.cjs");
const { createExportHandlers } = require("./ipc/handlers-export.cjs");
const { createAiHandlers } = require("./ipc/handlers-ai.cjs");
const { createWindowStateStore, MIN_BOUNDS } = require("./window-state.cjs");
const { createAppSettingsStore } = require("./app-settings.cjs");
const { createCrashLogStore, formatCrashEntry } = require("./crash-log.cjs");
const { evaluateUpdate, parseReleaseManifest } = require("./update-check.cjs");
const { validateMigration, planMigrationEntries } = require("./data-migration.cjs");
const {
  extractOpenFilePath,
  pickDocumentPath,
  buildRegistryPlan,
  buildRegistryCommands,
} = require("./file-open.cjs");
const { titleFromImportPath } = require("./ipc/import-content.cjs");
const fsp = require("node:fs/promises");
const { spawn } = require("node:child_process");
// Notification 用于 P7：长任务完成时在后台提醒
const { Notification } = require("electron");

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let dataPath = null;

// keep a global reference to the main window to avoid it being garbage collected
let mainWindow = null;

console.log("[main] starting main process", { node: process.version, platform: process.platform, argv: process.argv });

// 单例锁：应用双开时两个实例会并发写同一个 notes-data.json，
// 后写入的实例会覆盖先写入的数据（且备份节流状态各自独立）。
// 拿不到锁的实例直接退出，并由已运行实例聚焦自己的窗口。
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  console.log("[main] 已有实例在运行，本次启动退出");
  app.quit();
} else {
  // P5：macOS 通过 open-file 事件传文件（Windows 走命令行参数）
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    void openExternalFile(filePath);
  });

  app.on("second-instance", (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    // P10：从任务栏"最近文档"再次启动时会带 --open-doc=<id>，这里转给已运行的实例
    const docId = extractOpenDocId(argv);
    if (docId) sendAppAction("openDoc", { docId });

    // P5：双击另一个 .md 时，系统会再启动一次进程，这里把文件转给已运行的实例
    const filePath =
      extractOpenFilePath(argv) ||
      pickDocumentPath(argv, { exePath: process.execPath, existsSync: require("node:fs").existsSync });
    if (filePath) void openExternalFile(filePath);
  });
}

// 修复白屏：部分环境（远程桌面/虚拟机/受限沙箱/显卡驱动异常）下 GPU 进程会反复崩溃
// （日志表现为 "GPU process exited unexpectedly" 直至 "GPU process isn't usable. Goodbye."），
// 导致窗口创建后无法绘制任何内容，呈现白屏。
// 笔记类应用对 GPU 渲染无强需求，禁用硬件加速可彻底规避这一类问题。
// disableHardwareAcceleration 在部分 Chromium 版本下不足以阻止 GPU 进程初始化，
// 因此同时追加 --disable-gpu 命令行开关双保险。
// 如确认本机 GPU 正常且需要 GPU 渲染（如复杂动画），可设置环境变量 NOTES_ENABLE_GPU=1 恢复。
if (process.env.NOTES_ENABLE_GPU !== "1") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
}

// GPU 进程崩溃兜底：若运行时 GPU 进程仍然崩溃，降级为软件渲染而不是直接退出
app.on("child-process-gone", (_event, details) => {
  if (details.type === "GPU") {
    console.warn("[main] GPU process gone, reason:", details.reason, "- 继续使用软件渲染");
  }
});

process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection', reason);
});
/*
 * 退出时记录退出码。
 * 这里必须保证"绝不抛错"：exit 事件里任何异常都无法再被捕获，
 * 会覆盖掉真正的退出原因，反而让排查更难。stdout 此时可能已关闭（EPIPE），
 * 因此用 try/catch 包住，并优先用 process.stdout.write（比 console.log 少一层格式化）。
 */
process.on('exit', (code) => {
  try {
    if (process.stdout && process.stdout.writable) {
      process.stdout.write(`[main] process exit ${code}\n`);
    }
  } catch {
    // 退出阶段无法做任何补救，静默即可
  }
});

const defaultData = {
  notebooks: [
    {
      id: "nb-default",
      title: "学习笔记",
      docs: [
        {
          id: "doc-welcome",
          title: "欢迎使用",
          // 欢迎文档 = 可交互上手清单：预览模式下可直接点勾选框，
          // 让新用户在前 60 秒里把核心能力都试一遍（配合首启引导）
          content:
            "# 欢迎使用桌面笔记\n\n" +
            "这是一篇可以直接改写的文档。下面 5 件事都能用键盘完成 —— 在预览模式下点一下复选框，就能把它勾掉：\n\n" +
            "- [ ] 在空白行输入 `/` 唤起快捷命令（表格、公式、流程图、待办）\n" +
            "- [ ] 按 `Ctrl+K` 全局搜索；按 `Ctrl+/` 查看全部快捷键\n" +
            "- [ ] 选中一段文字，用 AI 改写或润色\n" +
            "- [ ] 在左侧文档树里拖拽这篇文档，试试排序与置顶\n" +
            "- [ ] 改几行字后打开「版本历史」，看看自动快照\n\n" +
            "**数据在哪里**：默认存在本机用户数据目录，每保存一次会自动生成备份（最多保留 10 份）。\n" +
            "需要回退时，从侧栏「更多 → 从备份恢复」选一个时间点即可。\n\n" +
            "**换个主题**：点编辑器右上角的日/夜切换，或到「更多 → 设置 → 通用」里挑一个，也可以选「跟随系统」。\n",
          parentId: null,
          tags: ["入门", "学习"],
          favorite: true,
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  ],
  trash: [],
};

// 窗口状态存储：延迟到 app ready 之后创建（getPath / screen 都要求 ready）
let windowStateStore = null;

function getWindowStateStore() {
  if (!windowStateStore) {
    windowStateStore = createWindowStateStore({
      dir: app.getPath("userData"),
      displays: () => screen.getAllDisplays(),
    });
  }
  return windowStateStore;
}

// 应用级设置（托盘行为 / 全局快捷键）：延迟到 app ready 之后创建
let appSettingsStore = null;

function getAppSettingsStore() {
  if (!appSettingsStore) {
    appSettingsStore = createAppSettingsStore({ dir: app.getPath("userData") });
  }
  return appSettingsStore;
}

/**
 * 当前生效的数据目录（O5）：用户在设置里迁移过就用迁移后的，否则用系统默认。
 * 迁移后重启，这里读到的就是新目录。
 */
function resolveDataDir() {
  try {
    const custom = getAppSettingsStore().read().dataDir;
    if (typeof custom === "string" && custom && path.isAbsolute(custom)) return custom;
  } catch {
    /* 设置读不出来时回落系统默认目录 */
  }
  return app.getPath("userData");
}

/* ---------------- .md 文件关联（P5） ---------------- */

/** 调 reg.exe。用 spawn + 参数数组而不是拼字符串，避免引号/空格被 shell 解释 */
function runReg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("reg.exe", args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error((stderr || stdout || "reg.exe 退出码 " + code).trim()));
    });
  });
}

const MAX_OPEN_FILE_BYTES = 5 * 1024 * 1024;

/** 待投递的"要打开的文件"：渲染进程就绪前先存着，否则这类启动参数会丢 */
let pendingOpenFile = null;

/**
 * 读取外部文件并交给渲染进程新建文档。
 * 只读文本、带上限；读失败就明确告知，而不是静默什么都不发生。
 */
async function openExternalFile(filePath) {
  const win = getMainWindow();
  if (!win) {
    pendingOpenFile = filePath;
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (stat.size > MAX_OPEN_FILE_BYTES) {
      win.webContents.send("app:action", {
        type: "openFileFailed",
        reason: "文件超过 5MB，请手动导入",
      });
      return;
    }
    const content = await fsp.readFile(filePath, "utf-8");
    win.webContents.send("app:action", {
      type: "openFile",
      title: titleFromImportPath(filePath, content),
      content,
      sourcePath: filePath,
    });
  } catch (err) {
    console.warn("[main] 打开外部文件失败：", err && err.message ? err.message : err);
    win.webContents.send("app:action", {
      type: "openFileFailed",
      reason: "无法读取该文件：" + (err && err.message ? err.message : "未知错误"),
    });
  }
}

/** 启动参数里可能带 --open-file（关联）或裸路径（拖到 exe 上） */
function takeStartupOpenFile() {
  const fromSwitch = extractOpenFilePath(process.argv);
  if (fromSwitch) return fromSwitch;
  return pickDocumentPath(process.argv, { exePath: process.execPath, existsSync: require("node:fs").existsSync });
}

function dispatchPendingOpenFile(win) {
  const filePath = takeStartupOpenFile() || pendingOpenFile;
  if (!filePath) return;
  pendingOpenFile = null;
  win.webContents.once("did-finish-load", () => {
    void openExternalFile(filePath);
  });
}

/* ---------------- 崩溃记录（D5）与更新检查（D3） ---------------- */

/** 默认更新源：仓库的 latest release（公开仓库无需额外托管） */
const DEFAULT_UPDATE_MANIFEST_URL = "https://api.github.com/repos/Krmuchi/Note/releases/latest";
const UPDATE_CHECK_TIMEOUT = 8000;

let crashLogStore = null;

function getCrashLogStore() {
  if (!crashLogStore) {
    crashLogStore = createCrashLogStore({ dir: app.getPath("userData") });
  }
  return crashLogStore;
}

/**
 * 记录崩溃。**不主动结束进程**：
 * 主进程承担的是 IO 与窗口管理，为一次偶发异常直接退出对用户更糟
 * （正在编辑的内容会因为没来得及保存而丢）。异常先如实记下来，
 * 用户在「设置 → 关于与诊断」里能看到，也可以一键复制发给我们。
 */
function recordCrash(type, error) {
  try {
    const err = error instanceof Error ? error : null;
    getCrashLogStore().append({
      type,
      message: err ? err.message : String(error || ""),
      stack: err && err.stack ? err.stack : "",
      appVersion: app.getVersion(),
      platform: process.platform,
    });
  } catch {
    /* 连崩溃日志都写不进去时只能放弃，绝不能因此再抛一次 */
  }
}

function installCrashHandlers() {
  process.on("uncaughtException", (error) => recordCrash("main-uncaught", error));
  process.on("unhandledRejection", (reason) => recordCrash("main-rejection", reason));

  app.on("render-process-gone", (_event, _contents, details) => {
    // 正常退出（clean-exit）不记；崩溃/被杀才记
    if (details && details.reason && details.reason !== "clean-exit") {
      recordCrash("renderer-gone", new Error("渲染进程退出：" + details.reason + "（exitCode " + details.exitCode + "）"));
    }
  });

  app.on("child-process-gone", (_event, details) => {
    if (details && details.reason && details.reason !== "clean-exit") {
      recordCrash("child-process-gone", new Error((details.type || "子进程") + " 退出：" + details.reason));
    }
  });
}

/* ---------------- 系统托盘（P3）与全局速记（P4） ---------------- */

const GLOBAL_QUICK_NOTE_ACCELERATOR = "Control+Alt+N";
let tray = null;
/** 真正退出（托盘菜单/菜单栏/系统）时置位，用于让"关闭窗口"区分隐藏与退出 */
let isQuitting = false;

function getMainWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function showMainWindow() {
  const win = getMainWindow();
  if (!win) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** 主 → 渲染的轻量动作通道：托盘菜单、全局快捷键、任务栏最近文档都从这里进 */
function sendAppAction(type, payload) {
  const win = getMainWindow();
  if (!win) return;
  showMainWindow();
  win.webContents.send("app:action", payload ? { type, ...payload } : { type });
}

/* ---------------- 平台集成（P7 通知 / P8 缩放记忆 / P9 开机自启 / P10 最近文档） ---------------- */

const ZOOM_PERSIST_DELAY = 500;
let zoomPersistTimer = null;

/** P8：把上次的缩放比例应用到新窗口（重启后保持） */
function applyStoredZoom(win) {
  try {
    const factor = getAppSettingsStore().read().zoomFactor;
    if (typeof factor === "number" && Math.abs(factor - 1) > 0.001) {
      win.webContents.setZoomFactor(factor);
    }
  } catch (err) {
    console.warn("[main] 应用缩放失败：", err && err.message ? err.message : err);
  }
}

/** P8：缩放变化后延迟落盘（Ctrl +/- 连按不该每次都写文件） */
function persistZoomSoon(win) {
  if (zoomPersistTimer) clearTimeout(zoomPersistTimer);
  zoomPersistTimer = setTimeout(() => {
    zoomPersistTimer = null;
    try {
      if (win.isDestroyed()) return;
      const factor = win.webContents.getZoomFactor();
      getAppSettingsStore().write({ zoomFactor: factor });
    } catch {
      /* 窗口已销毁或读取失败：下次启动用旧值，不影响本次使用 */
    }
  }, ZOOM_PERSIST_DELAY);
}

/**
 * P9：开机自启。返回系统真实状态而不是"我们想设置的值" ——
 * 用户可能在任务管理器里手动禁用了自启，界面必须如实反映。
 */
function applyAutoLaunch(enabled) {
  if (process.platform === "linux") {
    return { ok: false, error: "当前系统不支持从应用内设置开机自启" };
  }
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, openAsHidden: false });
    const actual = app.getLoginItemSettings().openAtLogin;
    if (actual !== !!enabled) {
      return { ok: false, error: "系统未接受开机自启设置", autoLaunch: actual };
    }
    return { ok: true, autoLaunch: actual };
  } catch (err) {
    return { ok: false, error: err && err.message ? String(err.message) : "设置开机自启失败" };
  }
}

function readAutoLaunchState() {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}

/** P10：任务栏最近文档（Windows JumpList）。 */
let recentDocs = [];

function rebuildJumpList() {
  if (process.platform !== "win32") return;
  try {
    const items = recentDocs.slice(0, 5).map((doc) => ({
      type: "task",
      program: process.execPath,
      args: "--open-doc=" + doc.id,
      title: String(doc.title || "未命名文档").slice(0, 60),
      description: "打开「" + String(doc.title || "未命名文档").slice(0, 60) + "」",
      iconPath: process.execPath,
      iconIndex: 0,
    }));
    if (items.length === 0) {
      app.setJumpList([]);
      return;
    }
    app.setJumpList([{ type: "custom", name: "最近文档", items }]);
  } catch (err) {
    console.warn("[main] 更新任务栏最近文档失败：", err && err.message ? err.message : err);
  }
}

/** 从命令行参数里取 --open-doc=<id>（冷启动与二次启动都可能带） */
function extractOpenDocId(argv) {
  const list = Array.isArray(argv) ? argv : [];
  for (const arg of list) {
    if (typeof arg === "string" && arg.startsWith("--open-doc=")) {
      const id = arg.slice("--open-doc=".length).trim();
      if (id) return id;
    }
  }
  return null;
}

/** 冷启动时带 --open-doc 的处理：等渲染进程就绪后再派发，否则消息会丢 */
function dispatchPendingOpenDoc(win) {
  const docId = extractOpenDocId(process.argv);
  if (!docId) return;
  win.webContents.once("did-finish-load", () => {
    sendAppAction("openDoc", { docId });
  });
}

/**
 * 注册/注销全局速记快捷键。
 * 注册失败（被其它程序占用）时必须如实回传，否则 UI 会显示"已开启"却按了没反应。
 */
function applyGlobalQuickNote(enabled) {
  try {
    globalShortcut.unregister(GLOBAL_QUICK_NOTE_ACCELERATOR);
  } catch {
    /* 未注册过时 unregister 会抛，忽略 */
  }

  if (!enabled) return { ok: true };

  try {
    const registered = globalShortcut.register(GLOBAL_QUICK_NOTE_ACCELERATOR, () => {
      sendAppAction("quickNote");
    });
    if (!registered) return { ok: false, error: "快捷键 Ctrl+Alt+N 已被其它程序占用" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : "注册全局快捷键失败" };
  }
}

function createTray() {
  if (tray) return tray;

  const iconPath = path.join(__dirname, "../build/tray.png");
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    // 图标缺失不应导致主进程崩溃：退回空图标，托盘仍然可用
    console.warn("[main] 托盘图标读取失败，使用空图标:", iconPath);
    image = nativeImage.createEmpty();
  }

  tray = new Tray(image);
  tray.setToolTip("笔记");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开笔记", click: () => showMainWindow() },
      { label: "新建便签", click: () => sendAppAction("quickNote") },
      { type: "separator" },
      {
        label: "打开数据目录",
        click: () => {
          if (dataPath) void shell.openPath(path.dirname(dataPath));
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );

  // 单击：窗口可见时收起、不可见时唤起（符合托盘图标的普遍预期）
  tray.on("click", () => {
    const win = getMainWindow();
    if (win && win.isVisible() && !win.isMinimized()) win.hide();
    else showMainWindow();
  });
  tray.on("double-click", () => showMainWindow());

  return tray;
}

function createWindow() {
  const windowState = getWindowStateStore();
  const win = new BrowserWindow({
    // 恢复上次的位置与大小（越界时自动回落到默认尺寸）
    ...windowState.readBounds(),
    minWidth: MIN_BOUNDS.width,
    minHeight: MIN_BOUNDS.height,
    title: "笔记",
    // 打包后由安装包写入的 exe 图标接管；开发模式下显式指定，
    // 否则任务栏会是 Electron 默认图标（build/ 不进 asar，故只在 dev 设置）
    ...(isDev ? { icon: path.join(__dirname, "../build/icon.ico") } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (windowState.readMaximized()) win.maximize();

  // 窗口状态持久化：拖动/缩放过程中事件非常密集，统一防抖 400ms 写盘。
  // 最大化/全屏时保存 getNormalBounds()，否则下次"还原"会把窗口还原成整屏大小。
  let persistTimer = null;

  const captureState = () => {
    if (win.isDestroyed()) return null;
    const maximized = win.isMaximized();
    const fullScreen = win.isFullScreen();
    const bounds = maximized || fullScreen ? win.getNormalBounds() : win.getBounds();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized };
  };

  const persistWindowState = () => {
    const state = captureState();
    if (state) windowState.write(state);
  };

  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistWindowState();
    }, 400);
  };

  win.on("resize", schedulePersist);
  win.on("move", schedulePersist);
  win.on("maximize", schedulePersist);
  win.on("unmaximize", schedulePersist);
  win.on("close", (event) => {
    // 关闭前同步落盘一次，避免 400ms 内的最后一次调整丢失
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persistWindowState();

    // 关闭到托盘：真正退出（托盘菜单/菜单栏/系统）时不拦截，
    // 否则"退出"会变成"隐藏"，用户会以为应用退不掉
    if (!isQuitting && getAppSettingsStore().read().closeToTray) {
      event.preventDefault();
      win.hide();
    }
  });

  if (isDev) {
    console.log("Loading dev server:", process.env.VITE_DEV_SERVER_URL);
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
      .then(() => console.log("[main] loadURL success"))
      .catch((err) => console.error("[main] Failed to load URL:", err));
    /*
     * DevTools 只在显式要求时打开。
     * 原来无条件 openDevTools({ mode: "right" })：每次启动都占掉窗口右侧一大块，
     * 检查界面效果时反而要手动关掉。需要时设置 NOTES_DEVTOOLS=1 即可。
     */
    if (process.env.NOTES_DEVTOOLS === "1") {
      win.webContents.openDevTools({ mode: "right" });
    }
  } else {
    // 未执行 npm run build 时 dist/index.html 不存在，loadFile 会 reject；
    // 不捕获则整个主进程以未处理拒绝退出，且没有任何可定位的信息
    win.loadFile(path.join(__dirname, "../dist/index.html")).catch((err) => {
      console.error("[main] 加载 dist/index.html 失败，请先执行 npm run build：", err);
    });
  }

  // 加载结果诊断对开发/生产都要生效，否则生产启动失败时只剩空白窗口、无任何日志
  win.webContents.on('did-finish-load', () => console.log('[main] did-finish-load'));
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[main] did-fail-load', errorCode, errorDescription);
  });

  win.webContents.on('will-navigate', (event, url) => {
    // 默认拒绝：解析失败（畸形 URL）或非白名单 host 一律拦截。
    // 不能依赖抛异常来阻止导航 —— will-navigate 回调里抛错不会取消这次导航，
    // 所以 new URL() 必须先兜住，否则畸形 URL 会被放行。
    const allowedHosts = isDev ? ['localhost', '127.0.0.1'] : [];
    let hostname = '';
    try {
      hostname = new URL(url).hostname;
    } catch (err) {
      console.error('[main] will-navigate 无法解析 URL，已拦截:', url, err && err.message);
      event.preventDefault();
      return;
    }
    if (!allowedHosts.includes(hostname)) {
      event.preventDefault();
    }
  })

  // 渲染进程崩溃/无响应时的自愈与诊断日志，避免静默白屏
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] render-process-gone:', details.reason, details.exitCode);
    if (details.reason !== 'clean-exit' && details.reason !== 'killed') {
      win.webContents.reload();
    }
  });
  win.webContents.on('unresponsive', () => {
    console.error('[main] renderer unresponsive');
  });
  // Electron 41 起 (level, message, ...) 位置参数已废弃，改用事件对象上的 message；
  // 仍按旧签名取值会在后续版本静默失效（渲染错误不再上报）
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error' || /error|failed/i.test(event.message)) {
      console.error('[renderer]', event.message);
    }
  });

  // 禁止渲染进程通过 window.open 打开新窗口（生产环境无此需求，防钓鱼/防逃逸）
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // P8：恢复上次的缩放比例，并在缩放变化后落盘
  applyStoredZoom(win)
  win.webContents.on('zoom-changed', () => persistZoomSoon(win))
  win.on('close', () => {
    if (zoomPersistTimer) {
      clearTimeout(zoomPersistTimer)
      zoomPersistTimer = null
    }
    try {
      if (!win.isDestroyed()) getAppSettingsStore().write({ zoomFactor: win.webContents.getZoomFactor() })
    } catch {
      /* 关闭阶段的失败不影响退出 */
    }
  })

  // P10：冷启动带 --open-doc=<id> 时，等页面就绪再派发
  dispatchPendingOpenDoc(win)

  // P5：冷启动带 --open-file / 裸文件路径（双击关联文件）时，等页面就绪再送进去
  dispatchPendingOpenFile(win)

  // keep reference
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // 未拿到单例锁（已被 app.quit 调度）时不再注册 IPC / 建窗口，
  // 否则退出前的短暂窗口期仍可能发出写入请求
  if (!gotSingleInstanceLock) return;

  dataPath = path.join(resolveDataDir(), "notes-data.json");

  // D5：尽早装上崩溃记录钩子，启动阶段的问题也要能留下痕迹
  installCrashHandlers();

  // P9：启动时把设置里的开机自启同步到系统一次（幂等；系统改过则以系统为准，界面会显示真实值）
  try {
    const stored = getAppSettingsStore().read().autoLaunch;
    if (stored !== readAutoLaunchState()) applyAutoLaunch(stored);
  } catch (err) {
    console.warn("[main] 同步开机自启状态失败：", err && err.message ? err.message : err);
  }

  const { session } = require("electron");
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (isDev) {
      // 开发模式：移除所有 CSP 限制，避免影响 Vite HMR
      const headers = { ...details.responseHeaders };
      delete headers["content-security-policy"];
      delete headers["Content-Security-Policy"];
      callback({ responseHeaders: headers });
    } else {
      // 生产模式：保持严格 CSP
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: file:; font-src 'self' data:; connect-src 'self' ws:;",
          ],
        },
      });
    }
  });

  // 设置中文菜单（开发模式下也可见）
  try {
    const template = [
      {
        label: "文件",
        submenu: [
          { role: "quit", label: "退出" },
        ],
      },
      {
        label: "编辑",
        submenu: [
          { role: "undo", label: "撤销" },
          { role: "redo", label: "重做" },
          { type: "separator" },
          { role: "cut", label: "剪切" },
          { role: "copy", label: "复制" },
          { role: "paste", label: "粘贴" },
          { role: "selectAll", label: "全选" },
        ],
      },
      {
        label: "视图",
        submenu: [
          { role: "reload", label: "重新加载" },
          { role: "toggleDevTools", label: "切换开发者工具" },
          { type: "separator" },
          { role: "resetZoom", label: "重置缩放" },
          { role: "zoomIn", label: "放大" },
          { role: "zoomOut", label: "缩小" },
          { type: "separator" },
          { role: "togglefullscreen", label: "切换全屏" },
        ],
      },
      {
        label: "窗口",
        submenu: [
          { role: "minimize", label: "最小化" },
          { role: "close", label: "关闭" },
        ],
      },
      {
        label: "帮助",
        submenu: [
          {
            label: "关于",
            click: () => {
              const win = BrowserWindow.getFocusedWindow();
              // 版本与数据目录都要能追溯：出问题时用户能直接说出"装的是哪版、数据在哪"
              const options = {
                type: "info",
                title: "关于",
                message: "笔记",
                detail: [
                  `版本：${typeof app.getVersion === "function" ? app.getVersion() : "开发版"}`,
                  `数据目录：${dataPath ? path.dirname(dataPath) : "(尚未初始化)"}`,
                ].join("\n"),
                buttons: ["确定"],
              };
              if (win) dialog.showMessageBox(win, options);
              else dialog.showMessageBox(options);
            },
          },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } catch (err) {
    console.warn("设置应用菜单失败", err);
  }

  const storage = createStorageHandlers({ app, ipcMain, getDataPath: () => dataPath, defaultData });
  const exporter = createExportHandlers({
    ipcMain,
    BrowserWindow,
    dialog,
    JSZip: require("jszip"),
    // ZIP 导入的配图需要落到 userData/images/ 下，路径与存储层同源
    getDataPath: () => dataPath,
  });
  const ai = createAiHandlers({ app, ipcMain, safeStorage });

  storage.register();
  exporter.register();

  // AI 配置用 safeStorage 加密存储，必须在 whenReady 之后才可用
  try {
    await ai.load();
    ai.register();
  } catch (err) {
    console.error("[main] AI 模块初始化失败：", err && err.message ? err.message : err);
  }

  // O5：迁移数据目录。步骤刻意保守：校验 → 拒绝覆盖已有数据 → 复制 → 记下新目录 → 让用户重启。
  // 原目录的内容**不删除**：迁移失败或用户反悔时，数据永远还在老地方。
  ipcMain.handle("notes:migrate-data-dir", async () => {
    const sourceDir = resolveDataDir();
    const win = getMainWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
      title: "选择新的数据目录",
      properties: ["openDirectory", "createDirectory"],
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    const targetDir = filePaths[0];
    const check = validateMigration(sourceDir, targetDir);
    if (!check.ok) return { ok: false, error: check.error };

    const sourceDataFile = path.join(sourceDir, "notes-data.json");
    const targetDataFile = path.join(targetDir, "notes-data.json");

    try {
      // 目标目录已有数据文件时拒绝：覆盖别人的笔记是不可逆的事故
      try {
        await fsp.access(targetDataFile);
        return { ok: false, error: "目标目录里已经有一份 notes-data.json，请换一个目录（避免覆盖）" };
      } catch {
        /* 不存在才继续 */
      }

      let hasDataFile = true;
      try {
        await fsp.access(sourceDataFile);
      } catch {
        hasDataFile = false;
      }

      const sourceBackupDir = path.join(sourceDir, "backups");
      let backupCount = 0;
      try {
        backupCount = (await fsp.readdir(sourceBackupDir)).length;
      } catch {
        backupCount = 0;
      }

      await fsp.mkdir(targetDir, { recursive: true });

      const entries = planMigrationEntries(sourceDir, targetDir, { hasDataFile, backupCount });
      for (const entry of entries) {
        if (entry.kind === "data") {
          // 先写临时文件再改名：中途断电也不会留下半截数据文件
          const temp = entry.to + ".tmp";
          await fsp.copyFile(entry.from, temp);
          await fsp.rename(temp, entry.to);
        } else {
          await fsp.cp(entry.from, entry.to, { recursive: true, force: false });
        }
      }

      const saved = getAppSettingsStore().write({ dataDir: targetDir });
      if (!saved.ok) {
        return { ok: false, error: "数据已复制，但设置未能保存，迁移未生效（原数据仍在原处）" };
      }

      return {
        ok: true,
        dataDir: targetDir,
        copiedDataFile: hasDataFile,
        copiedBackups: backupCount,
      };
    } catch (err) {
      console.error("[main] 迁移数据目录失败：", err && err.message ? err.message : err);
      return { ok: false, error: "迁移失败：" + (err && err.message ? err.message : "未知错误") };
    }
  });

  // O5：迁移完成后重启应用（新目录要重新走一遍启动流程才会生效）
  ipcMain.handle("notes:relaunch", async () => {
    try {
      app.relaunch();
      app.exit(0);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? String(err.message) : "重启失败，请手动重启应用" };
    }
  });

  // P5：.md 文件关联开关。只写 HKCU（不需要管理员），关闭时恢复原关联。
  ipcMain.handle("notes:file-association:get", async () => {
    if (process.platform !== "win32") {
      return { ok: true, supported: false, enabled: false };
    }
    const settings = getAppSettingsStore().read();
    return {
      ok: true,
      supported: true,
      enabled: !!settings.fileAssociation,
      previous: settings.previousMdAssociation || "",
    };
  });

  ipcMain.handle("notes:file-association:set", async (_event, payload) => {
    if (process.platform !== "win32") {
      return { ok: false, error: "当前系统不支持从应用内设置文件关联" };
    }
    const enabled = !!(payload && payload.enabled);
    const plan = buildRegistryPlan(process.execPath);
    if (!plan) return { ok: false, error: "无法确定应用路径" };

    const settings = getAppSettingsStore();
    const current = settings.read();

    // 开启前先记下原有 .md 关联，关闭时才能还回去
    let previous = current.previousMdAssociation || "";
    if (enabled && !previous) {
      try {
        const result = await runReg(["query", "HKCU\\Software\\Classes\\.md", "/ve"]);
        const match = result.stdout.match(/REG_SZ\s+(.+)/);
        const existing = match ? match[1].trim() : "";
        // 原本就指向我们自己的话不记录，避免"恢复"成自己
        if (existing && existing !== plan.progId) previous = existing;
      } catch {
        previous = "";
      }
    }

    const commands = enabled ? buildRegistryCommands(plan, previous).enable : buildRegistryCommands(plan, previous).disable;

    try {
      for (const args of commands) {
        await runReg(args);
      }
    } catch (err) {
      return { ok: false, error: "写入系统设置失败：" + (err && err.message ? err.message : "未知错误") };
    }

    const saved = settings.write(
      enabled
        ? { fileAssociation: true, previousMdAssociation: previous }
        : { fileAssociation: false },
    );
    if (!saved.ok) return { ok: false, error: "系统设置已改，但本地记录未能保存" };

    return { ok: true, enabled, previous };
  });

  // D5：崩溃记录读取 / 清理 / 打开日志目录
  ipcMain.handle("notes:crash-log:get", async () => {
    try {
      const store = getCrashLogStore();
      const entries = store.readAll();
      const latest = store.readLatest();
      return {
        ok: true,
        entries,
        latest,
        summary: formatCrashEntry(latest),
        file: store.file,
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? String(err.message) : "读取崩溃日志失败" };
    }
  });

  ipcMain.handle("notes:crash-log:clear", async () => {
    try {
      return getCrashLogStore().clear();
    } catch (err) {
      return { ok: false, error: err && err.message ? String(err.message) : "清理崩溃日志失败" };
    }
  });

  // D3：检查更新。默认走 GitHub Releases API（仓库公开即可用，无需自建更新托管），
  // 也接受 app-settings 里配置的自定义清单地址。只检查、只提示，不静默下载安装。
  ipcMain.handle("notes:check-update", async (_event, payload) => {
    const settings = getAppSettingsStore().read();
    const customUrl = payload && typeof payload.url === "string" && payload.url ? payload.url : settings.updateManifestUrl;
    const url = customUrl || DEFAULT_UPDATE_MANIFEST_URL;

    if (!/^https:\/\//.test(url)) {
      return { ok: false, error: "更新地址必须是 https 地址" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        return { ok: false, error: "更新服务返回 " + response.status };
      }
      const text = await response.text();
      const manifest = parseReleaseManifest(text);
      if (!manifest) {
        return { ok: false, error: "更新信息格式无法识别" };
      }
      return { ok: true, current: app.getVersion(), ...evaluateUpdate(app.getVersion(), manifest) };
    } catch (err) {
      const aborted = err && (err.name === "AbortError" || err.code === "ABORT_ERR");
      return { ok: false, error: aborted ? "检查更新超时" : "网络请求失败" };
    } finally {
      clearTimeout(timer);
    }
  });

  // P7：系统通知。只在窗口不在前台时才弹 —— 用户正看着应用时，应用内 toast 已经够了，
  // 再叠一个系统通知纯属打扰。
  ipcMain.handle("notes:notify", async (_event, payload) => {
    try {
      if (!payload || typeof payload.title !== "string" || payload.title.length === 0) {
        return { ok: false, error: "通知内容无效" };
      }
      const settings = getAppSettingsStore().read();
      if (!settings.notifyWhenBackground) return { ok: false, skipped: true };

      const win = getMainWindow();
      const focused = !!(win && win.isFocused() && !win.isMinimized());
      if (focused) return { ok: false, skipped: true };

      if (!Notification.isSupported()) return { ok: false, error: "当前系统不支持通知" };

      const notification = new Notification({
        title: payload.title.slice(0, 120),
        body: typeof payload.body === "string" ? payload.body.slice(0, 500) : "",
        silent: false,
      });
      // 点击通知把窗口带到前台，而不是让它自己在那亮着
      notification.on("click", () => {
        showMainWindow();
      });
      notification.show();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? String(err.message) : "发送通知失败" };
    }
  });

  // P10：最近文档 → 任务栏跳转列表（仅 Windows）
  ipcMain.handle("notes:update-recents", async (_event, payload) => {
    const list = Array.isArray(payload) ? payload : [];
    recentDocs = list
      .filter((item) => item && typeof item.id === "string" && item.id.length > 0)
      .slice(0, 10)
      .map((item) => ({ id: item.id, title: typeof item.title === "string" ? item.title : "" }));
    rebuildJumpList();
    return { ok: true };
  });

  // 应用设置：托盘行为 + 全局速记（P3 / P4）
  ipcMain.handle("notes:app-settings:get", async () => {
    try {
      const settings = getAppSettingsStore().read();
      // P9：开机自启以**系统真实状态**为准（用户可能在任务管理器里手动禁用了）
      return { ok: true, settings: { ...settings, autoLaunch: readAutoLaunchState() } };
    } catch (err) {
      return { ok: false, error: err && err.message ? String(err.message) : "读取设置失败" };
    }
  });

  ipcMain.handle("notes:app-settings:set", async (_event, patch) => {
    if (!patch || typeof patch !== "object") {
      return { ok: false, error: "设置载荷无效" };
    }
    const result = getAppSettingsStore().write(patch);
    if (!result.ok) return result;

    // P9：开机自启要先问系统，系统不认就如实回滚，别让开关停在"假的已开启"
    if (Object.prototype.hasOwnProperty.call(patch, "autoLaunch")) {
      const applied = applyAutoLaunch(result.settings.autoLaunch);
      if (!applied.ok) {
        const rolledBack = getAppSettingsStore().write({ autoLaunch: false });
        return {
          ok: false,
          error: applied.error,
          settings: { ...(rolledBack.ok ? rolledBack.settings : result.settings), autoLaunch: readAutoLaunchState() },
        };
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "globalQuickNote")) {
      const applied = applyGlobalQuickNote(result.settings.globalQuickNote);
      if (!applied.ok) {
        // 快捷键被占用：把开关回滚，避免界面显示已开启但按了没反应
        const rolledBack = getAppSettingsStore().write({ globalQuickNote: false });
        return {
          ok: false,
          error: applied.error,
          settings: rolledBack.ok ? rolledBack.settings : result.settings,
        };
      }
    }

    return result;
  });

  try {
    createTray();
  } catch (err) {
    console.error("[main] 创建系统托盘失败：", err && err.message ? err.message : err);
  }

  const initialSettings = getAppSettingsStore().read();
  if (initialSettings.globalQuickNote) {
    const applied = applyGlobalQuickNote(true);
    if (!applied.ok) console.warn("[main]", applied.error);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 真正退出时置位：让窗口的 close 处理器放行（区分"隐藏到托盘"与"退出"）
app.on("before-quit", () => {
  isQuitting = true;
});

// 全局快捷键必须显式注销，否则进程退出后仍可能占用组合键
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});