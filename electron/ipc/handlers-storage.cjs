// 存储类 IPC handlers：数据读写、备份、图片保存、全量导出/备份导入。
// 从 main.cjs 纯拆分而来，逻辑不变。

const path = require("node:path");
const fs = require("node:fs/promises");
const { assertStorePayload, safeName, MAX_IMAGE_BYTES } = require("./shared.cjs");

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

  async function createBackup() {
    const now = Date.now();
    if (now - lastBackupAt < BACKUP_INTERVAL_MS) return;
    lastBackupAt = now;
    try {
      const backupDir = path.join(app.getPath("userData"), "backups");
      await fs.mkdir(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = path.join(backupDir, `backup-${timestamp}.json`);

      const raw = await fs.readFile(getDataPath(), "utf-8");
      await fs.writeFile(backupPath, raw, "utf-8");

      const files = await fs.readdir(backupDir);
      if (files.length > 10) {
        const sorted = files.sort();
        const toDelete = sorted.slice(0, files.length - 10);
        await Promise.all(toDelete.map(f => fs.unlink(path.join(backupDir, f))));
      }
    } catch (err) {
      console.warn("Backup creation failed:", err);
    }
  }

  function register() {
    ipcMain.handle("notes:load", async () => {
      return readStore();
    });

    ipcMain.handle("notes:save", async (_event, payload) => {
      // 校验并序列化一次，写盘复用同一份 json
      const json = assertStorePayload(payload);
      const result = await enqueueWrite(payload, json);
      createBackup().catch(err => console.warn('Backup failed:', err));
      return result;
    });

    ipcMain.handle("notes:save-image", async (_event, payload) => {
      const imagesDir = path.join(app.getPath("userData"), "images");
      await fs.mkdir(imagesDir, { recursive: true });

      const { name, data } = payload;
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
        return `file://${dest.replace(/\\/g, "/")}`;
      } catch (err) {
        console.error("save-image failed", err);
        return "";
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

  return { register, readStore, writeStore, createBackup };
}

module.exports = { createStorageHandlers, safeName };
