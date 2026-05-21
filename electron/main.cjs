const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const JSZip = require("jszip");

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let dataPath = null;

// keep a global reference to the main window to avoid it being garbage collected
let mainWindow = null;

console.log("[main] starting main process", { node: process.version, platform: process.platform, argv: process.argv });

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

async function ensureStoreFile() {
  try {
    await fs.access(dataPath);
  } catch {
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, JSON.stringify(defaultData, null, 2), "utf-8");
  }
}

async function readStore() {
  await ensureStoreFile();
  const raw = await fs.readFile(dataPath, "utf-8");
  return JSON.parse(raw);
}

async function writeStore(payload) {
  await fs.writeFile(dataPath, JSON.stringify(payload, null, 2), "utf-8");
  return payload;
}

const safeName = (name) => (name || "note").replace(/[\\/:*?"<>|]/g, "_");

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
    win.loadURL(process.env.VITE_DEV_SERVER_URL).catch((err) => console.error("Failed to load URL:", err));
    // 自动打开开发者工具以便调试
    win.webContents.openDevTools({ mode: "right" });
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  // keep reference
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
}

app.whenReady().then(() => {
  dataPath = path.join(app.getPath("userData"), "notes-data.json");

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

  ipcMain.handle("notes:load", async () => {
    return readStore();
  });

  ipcMain.handle("notes:save", async (_event, payload) => {
    return writeStore(payload);
  });

  ipcMain.handle("notes:export-doc", async (_event, payload) => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined, {
      title: "导出 Markdown 文档",
      defaultPath: `${safeName(payload.title)}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (canceled || !filePath) return false;
    await fs.writeFile(filePath, payload.content ?? "", "utf-8");
    return true;
  });

  ipcMain.handle("notes:export-notebook", async (_event, payload) => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined, {
      title: "导出知识库 Markdown",
      defaultPath: `${safeName(payload.title)}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (canceled || !filePath) return false;
    const text = (payload.docs ?? [])
      .map((doc) => `# ${doc.title || "未命名文档"}\n\n${doc.content || ""}\n`)
      .join("\n---\n\n");
    await fs.writeFile(filePath, text, "utf-8");
    return true;
  });

  ipcMain.handle("notes:export-notebook-zip", async (_event, payload) => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined, {
      title: "导出知识库 ZIP",
      defaultPath: `${safeName(payload.title)}.zip`,
      filters: [{ name: "Zip", extensions: ["zip"] }],
    });
    if (canceled || !filePath) return false;

    const zip = new JSZip();
    const titleCount = new Map();
    (payload.docs ?? []).forEach((doc, index) => {
      const base = safeName(doc.title || `文档-${index + 1}`);
      const count = titleCount.get(base) ?? 0;
      titleCount.set(base, count + 1);
      const name = count > 0 ? `${base}-${count + 1}.md` : `${base}.md`;
      zip.file(name, doc.content || "");
    });
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    await fs.writeFile(filePath, buffer);
    return true;
  });

  ipcMain.handle("notes:save-image", async (_event, payload) => {
    try {
      const { name, data } = payload || {};
      if (!data) return "";
      const imagesDir = path.join(app.getPath("userData"), "images");
      await fs.mkdir(imagesDir, { recursive: true });
      // data is expected to be a data URL: data:<mime>;base64,<base64>
      const match = String(data).match(/^data:(.+);base64,(.*)$/);
      let ext = path.extname(name) || "";
      let buffer;
      if (match) {
        const b64 = match[2];
        buffer = Buffer.from(b64, "base64");
        const mime = match[1];
        if (!ext) {
          // rudimentary mime -> ext mapping
          if (mime === "image/png") ext = ".png";
          else if (mime === "image/jpeg") ext = ".jpg";
          else if (mime === "image/gif") ext = ".gif";
          else if (mime === "image/webp") ext = ".webp";
          else if (mime === "image/svg+xml") ext = ".svg";
          else {
            // Default to png if mime type is unknown
            ext = ".png";
          }
        }
      } else {
        // if not data URL, assume base64 raw
        buffer = Buffer.from(String(data), "base64");
      }
      
      // Validate file extension to prevent malicious uploads
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
      if (!allowedExtensions.includes(ext.toLowerCase())) {
        throw new Error(`Invalid file extension: ${ext}. Only image files are allowed.`);
      }
      
      // Sanitize filename to prevent path traversal attacks
      const cleanBaseName = path.basename(name, path.extname(name))
        .replace(/[^a-zA-Z0-9-_]/g, '_')
        .substring(0, 100); // Limit length to prevent extremely long filenames
      
      const filename = `${cleanBaseName}-${Date.now()}${ext}`;
      const dest = path.join(imagesDir, filename);
      
      // Double-check that the destination is within the intended directory
      const resolvedDest = path.resolve(dest);
      const resolvedImagesDir = path.resolve(imagesDir);
      if (!resolvedDest.startsWith(resolvedImagesDir + path.sep) && resolvedDest !== resolvedImagesDir) {
        throw new Error("Invalid file path - path traversal detected");
      }
      
      await fs.writeFile(dest, buffer);
      // return file:// URL for renderer
      return `file://${dest.replace(/\\/g, "/")}`;
    } catch (err) {
      console.error("save-image failed", err);
      return "";
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});