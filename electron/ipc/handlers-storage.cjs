// 存储类 IPC handlers：数据读写、备份、图片保存、全量导出/备份导入。
// 从 main.cjs 纯拆分而来，逻辑不变。

const path = require("node:path");
const fs = require("node:fs/promises");
const { assertStorePayload, safeName, MAX_IMAGE_BYTES } = require("./shared.mjs");

/**
 * @param {object} deps
 * @param {Electron.App} deps.app
 * @param {Electron.IpcMain} deps.ipcMain
 * @param {() => string} deps.getDataPath 数据文件路径（在 whenReady 中确定）
 * @param {object} deps.defaultData 首次启动时写入的默认数据
 */
function createStorageHandlers({ app, ipcMain, getDataPath, defaultData }) {
  async function ensureStoreFile() {
    const dataPath = getDataPath();
    try {
      await fs.access(dataPath);
    } catch {
      await fs.mkdir(path.dirname(dataPath), { recursive: true });
      await fs.writeFile(dataPath, JSON.stringify(defaultData, null, 2), "utf-8");
    }
  }

  async function readStore() {
    await ensureStoreFile();
    return JSON.parse(await fs.readFile(getDataPath(), "utf-8"));
  }

  let writeQueue = Promise.resolve();

  async function writeStore(payload, preSerializedJson) {
    const dataPath = getDataPath();
    const tempPath = dataPath + ".tmp";
    const maxAttempts = 3;
    let lastErr;
    // json 由 assertStorePayload 序列化并返回，避免大 payload 全量 stringify 两遍
    const json = preSerializedJson ?? JSON.stringify(payload, null, 2);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await fs.writeFile(tempPath, json, "utf-8");
        await fs.rename(tempPath, dataPath);
        return payload;
      } catch (err) {
        lastErr = err;
        // Windows 下目标文件可能被杀毒软件/索引服务短暂占用导致 rename 失败（EBUSY/EPERM），退避后重试
        const retryable = ["EBUSY", "EPERM", "EACCES"].includes(err && err.code);
        if (attempt < maxAttempts && retryable) {
          await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
          continue;
        }
        // 清理残留的临时文件，避免占用磁盘空间
        try { await fs.unlink(tempPath); } catch { /* tmp 可能不存在 */ }
        throw lastErr;
      }
    }
    throw lastErr;
  }

  function enqueueWrite(payload, preSerializedJson) {
    writeQueue = writeQueue.then(
      () => writeStore(payload, preSerializedJson),
      () => writeStore(payload, preSerializedJson),
    );
    return writeQueue;
  }

  let lastBackupAt = 0;
  const BACKUP_INTERVAL_MS = 60_000; // 备份节流：最多每分钟一次，避免频繁保存时反复全量复制大库
  const MAX_BACKUPS = 10;

  const getBackupDir = () => path.join(app.getPath("userData"), "backups");

  /**
   * 列出备份目录中的文件（按修改时间倒序）。
   * 时间取文件 mtime 而非文件名反解：备份一律由本进程写出，mtime 更简单可靠。
   */
  async function listBackupFiles() {
    const backupDir = getBackupDir();
    await fs.mkdir(backupDir, { recursive: true });
    const files = (await fs.readdir(backupDir)).filter((f) => f.toLowerCase().endsWith(".json"));
    const entries = [];
    for (const name of files) {
      try {
        const stat = await fs.stat(path.join(backupDir, name));
        entries.push({
          name,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
          mtimeMs: stat.mtimeMs,
          // prerestore-* 是"恢复前自动留存的快照"，不属于常规自动备份
          auto: name.startsWith("backup-"),
        });
      } catch {
        // 单个文件读取失败不影响整体列表
      }
    }
    entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return entries;
  }

  /** 复制当前数据文件到备份目录（自定义前缀，用于"恢复前先备份"） */
  async function writeBackupCopy(prefix) {
    const backupDir = getBackupDir();
    await fs.mkdir(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `${prefix}-${timestamp}.json`);
    const raw = await fs.readFile(getDataPath(), "utf-8");
    await fs.writeFile(backupPath, raw, "utf-8");
    return backupPath;
  }

  /** 只保留最近 MAX_BACKUPS 份（两类备份合并计数，按时间淘汰最旧的） */
  async function pruneBackups() {
    try {
      const stale = (await listBackupFiles()).slice(MAX_BACKUPS);
      await Promise.all(stale.map((e) => fs.unlink(path.join(getBackupDir(), e.name))));
    } catch (err) {
      console.warn("Backup prune failed:", err);
    }
  }

  async function createBackup() {
    const now = Date.now();
    if (now - lastBackupAt < BACKUP_INTERVAL_MS) return null;
    lastBackupAt = now;
    try {
      const backupPath = await writeBackupCopy("backup");
      await pruneBackups();
      return { at: new Date().toISOString(), name: path.basename(backupPath) };
    } catch (err) {
      console.warn("Backup creation failed:", err);
      return null;
    }
  }

  function register() {
    // 加载通道永不抛错，改为返回信封。
    // 旧实现直接 throw：渲染层 coreSlice 内部 catch 后只置 loadFailed，
    // 用户既看不到任何提示，也不知道可以从备份恢复（数据保护做了，体验出口没做）。
    ipcMain.handle("notes:load", async () => {
      try {
        const data = await readStore();
        return { ok: true, data };
      } catch (err) {
        console.error("notes:load failed", err);
        const message = err && err.message ? String(err.message) : "读取数据文件失败";
        return { ok: false, error: message };
      }
    });

    // 应用信息（版本 / 数据目录 / 备份目录）：失败恢复引导与关于页都要用
    ipcMain.handle("notes:app-info", async () => {
      try {
        const dataPath = getDataPath();
        return {
          ok: true,
          info: {
            version: typeof app.getVersion === "function" ? app.getVersion() : "",
            dataPath,
            dataDir: path.dirname(dataPath),
            backupDir: getBackupDir(),
          },
        };
      } catch (err) {
        return { ok: false, error: err && err.message ? String(err.message) : "读取应用信息失败" };
      }
    });

    // 打开数据目录：路径完全由主进程给出，渲染进程无法传入任意路径
    ipcMain.handle("notes:open-data-dir", async () => {
      try {
        const { shell } = require("electron");
        const message = await shell.openPath(path.dirname(getDataPath()));
        if (message) return { ok: false, error: message };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err && err.message ? String(err.message) : "打开数据目录失败" };
      }
    });

    // 用系统浏览器打开链接（D3 的"打开下载页"）。
    // 只放行 https：渲染进程若能传任意协议，file:// 之类就成了本地文件探针。
    ipcMain.handle("notes:open-external", async (_event, payload) => {
      const url = payload && typeof payload.url === "string" ? payload.url : "";
      if (!/^https:\/\/[^\s]+$/i.test(url)) {
        return { ok: false, error: "只能打开 https 链接" };
      }
      try {
        const { shell } = require("electron");
        await shell.openExternal(url);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err && err.message ? String(err.message) : "打开链接失败" };
      }
    });

    ipcMain.handle("notes:save", async (event, payload) => {
      // 校验并序列化一次，写盘复用同一份 json
      const json = assertStorePayload(payload);
      const result = await enqueueWrite(payload, json);
      // 备份是节流的（每分钟最多一次），成功后主动告知渲染端"上次备份时间"，
      // 失败只记日志不打扰用户（备份失败不影响保存本身）
      createBackup()
        .then((info) => {
          if (info && event && event.sender && !event.sender.isDestroyed()) {
            event.sender.send("backup:created", info);
          }
        })
        .catch(err => console.warn('Backup failed:', err));
      return result;
    });

    // 列出本地自动备份（供"一键恢复"入口使用）
    ipcMain.handle("backup:list", async () => {
      try {
        const backups = (await listBackupFiles()).map(({ name, size, createdAt, auto }) => ({
          name,
          size,
          createdAt,
          auto,
        }));
        return { ok: true, backups };
      } catch (err) {
        console.error("backup:list failed", err);
        return { ok: false, error: err && err.message ? String(err.message) : "读取备份列表失败" };
      }
    });

    // 从本地备份恢复（覆盖式）：数据安全优先——覆盖前先把当前数据另存一份
    ipcMain.handle("notes:restore-backup", async (_event, payload) => {
      const name = payload && payload.name;
      // 文件名白名单校验 + 路径穿越二次校验（绝不信任渲染进程传来的路径）
      if (typeof name !== "string" || !/^[A-Za-z0-9._-]+\.json$/.test(name) || name.includes("..")) {
        return { ok: false, error: "备份文件名无效" };
      }
      try {
        const backupDir = path.resolve(getBackupDir());
        const target = path.resolve(backupDir, name);
        if (!target.startsWith(backupDir + path.sep)) {
          return { ok: false, error: "备份文件路径无效" };
        }

        const raw = await fs.readFile(target, "utf-8");
        const parsed = JSON.parse(raw);
        // 复用保存通道的同一套结构/体积校验，避免用损坏备份覆盖有效数据
        const json = assertStorePayload(parsed);

        // 覆盖前留存当前数据：恢复错了还能回头
        lastBackupAt = 0; // 绕过 60s 节流，确保这份快照一定落盘
        await writeBackupCopy("prerestore");
        await pruneBackups();

        await enqueueWrite(parsed, json);
        return { ok: true, restoredAt: new Date().toISOString() };
      } catch (err) {
        console.error("notes:restore-backup failed", err);
        return { ok: false, error: err && err.message ? String(err.message) : "恢复备份失败" };
      }
    });

    ipcMain.handle("notes:save-image", async (_event, payload) => {
      // 统一返回信封 { ok, path } / { ok:false, error }：
      // 旧实现失败时返回空串，调用方无法区分"空文件名"与"落盘失败"
      const imagesDir = path.join(app.getPath("userData"), "images");
      await fs.mkdir(imagesDir, { recursive: true });

      const { name, data } = payload || {};
      let ext = path.extname(name || "");

      try {
        let buffer;
        const match = String(data).match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          const b64 = match[2];
          buffer = Buffer.from(b64, "base64");
          const mime = match[1];
          if (!ext) {
            if (mime === "image/png") ext = ".png";
            else if (mime === "image/jpeg") ext = ".jpg";
            else if (mime === "image/gif") ext = ".gif";
            else if (mime === "image/webp") ext = ".webp";
            else if (mime === "image/svg+xml") ext = ".svg";
            else ext = ".png";
          }
        } else {
          buffer = Buffer.from(String(data), "base64");
        }

        const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
        if (!allowedExtensions.includes(ext.toLowerCase())) {
          throw new Error(`Invalid file extension: ${ext}. Only image files are allowed.`);
        }

        // 落盘大小上限（MAX_IMAGE_BYTES = 20MB）：超限图片会撑大 store，
        // 间接把保存 payload 推向 IPC 50MB 上限导致保存失败
        if (buffer.length > MAX_IMAGE_BYTES) {
          throw new Error(`Image too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_IMAGE_BYTES / 1024 / 1024}MB limit`);
        }

        // 清洗文件名，防止路径穿越
        const cleanBaseName = path.basename(name, path.extname(name))
          .replace(/[^a-zA-Z0-9-_]/g, '_')
          .substring(0, 100);

        const filename = `${cleanBaseName}-${Date.now()}${ext}`;
        const dest = path.join(imagesDir, filename);

        // 二次校验目标路径仍在预期目录内
        const resolvedDest = path.resolve(dest);
        const resolvedImagesDir = path.resolve(imagesDir);
        if (!resolvedDest.startsWith(resolvedImagesDir + path.sep) && resolvedDest !== resolvedImagesDir) {
          throw new Error("Invalid file path - path traversal detected");
        }

        await fs.writeFile(dest, buffer);
        // 返回 file:// URL 供渲染进程引用
        return { ok: true, path: `file://${dest.replace(/\\/g, "/")}` };
      } catch (err) {
        console.error("save-image failed", err);
        const message = err && err.message ? String(err.message) : "图片保存失败";
        return { ok: false, error: message };
      }
    });

    // 导出全部数据为 JSON 备份文件
    ipcMain.handle("notes:export-all", async (_event, payload) => {
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid export payload: expected an object");
      }
      const size = Buffer.byteLength(JSON.stringify(payload), "utf-8");
      if (size > 50 * 1024 * 1024) {
        throw new Error("Export payload too large");
      }
      const { BrowserWindow, dialog } = require("electron");
      const win = BrowserWindow.getFocusedWindow();
      const timestamp = new Date().toISOString().slice(0, 10);
      const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined, {
        title: "导出全部数据备份",
        defaultPath: `笔记备份-${timestamp}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (canceled || !filePath) return false;
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
      return true;
    });

    // 从备份文件导入数据
    ipcMain.handle("notes:import-backup", async () => {
      const { BrowserWindow, dialog } = require("electron");
      const win = BrowserWindow.getFocusedWindow();
      const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
        title: "从备份文件导入数据",
        filters: [{ name: "JSON 备份", extensions: ["json"] }],
        properties: ["openFile"],
      });
      if (canceled || !filePaths || filePaths.length === 0) return null;

      try {
        const content = await fs.readFile(filePaths[0], "utf-8");
        const data = JSON.parse(content);

        if (!data || typeof data !== 'object') {
          throw new Error('无效的备份文件格式');
        }
        if (!Array.isArray(data.notebooks)) {
          throw new Error('备份文件缺少 notebooks 数据');
        }

        return data;
      } catch (err) {
        console.error("Failed to import backup:", err);
        throw new Error('导入备份文件失败：' + (err && err.message ? err.message : String(err)));
      }
    });
  }

  return { register, readStore, writeStore, createBackup, getBackupDir, listBackupFiles, pruneBackups };
}

module.exports = { createStorageHandlers, safeName };
