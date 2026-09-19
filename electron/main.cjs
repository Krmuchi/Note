const { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage } = require("electron");
const path = require("node:path");
const { createStorageHandlers } = require("./ipc/handlers-storage.cjs");
const { createExportHandlers } = require("./ipc/handlers-export.cjs");
const { createAiHandlers } = require("./ipc/handlers-ai.cjs");

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let dataPath = null;

// keep a global reference to the main window to avoid it being garbage collected
let mainWindow = null;

console.log("[main] starting main process", { node: process.version, platform: process.platform, argv: process.argv });

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
process.on('exit', (code) => {
  console.log('[main] process exit', code);
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
          content:
            "# 欢迎使用桌面笔记\n\n这是你的第一篇笔记。\n\n- 左侧创建知识库\n- 中间管理文档\n- 右侧编辑内容",
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 700,
    title: "笔记",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    console.log("Loading dev server:", process.env.VITE_DEV_SERVER_URL);
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
      .then(() => console.log("[main] loadURL success"))
      .catch((err) => console.error("[main] Failed to load URL:", err));
    win.webContents.openDevTools({ mode: "right" });
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
    const allowedHosts = isDev ? ['localhost', '127.0.0.1'] : [];
    const parsed = new URL(url);
    if (!allowedHosts.includes(parsed.hostname)) {
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

  // keep reference
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
}

app.whenReady().then(async () => {
  dataPath = path.join(app.getPath("userData"), "notes-data.json");

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
              if (win) dialog.showMessageBox(win, { message: "学习笔记 - 开发版" });
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
  const exporter = createExportHandlers({ ipcMain, BrowserWindow, dialog, JSZip: require("jszip") });
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

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});