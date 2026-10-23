// 导出/导入类 IPC handlers：Markdown、ZIP、HTML、PDF 导出与 Markdown 导入。
// 从 main.cjs 纯拆分而来，逻辑不变。

const path = require("node:path");
const fs = require("node:fs/promises");
const {
  normalizeExportOptions,
  buildHeaderFooterTemplates,
} = require("./export-options.cjs");
const {
  MAX_SCAN_DEPTH,
  MAX_IMPORT_FILES,
  buildImportPlan,
  isImagePath,
  isImportablePath,
  rewriteImageLinks,
  uniqueImageName,
} = require("./import-content.cjs");
const {
  assertExportPayload,
  safeName,
  buildExportDocument,
} = require("./shared.mjs");

/**
 * @param {object} deps
 * @param {Electron.IpcMain} deps.ipcMain
 * @param {typeof import('electron').BrowserWindow} deps.BrowserWindow
 * @param {typeof import('electron').dialog} deps.dialog
 * @param {typeof import('jszip')} deps.JSZip
 * @param {() => string} deps.getDataPath 数据文件路径（ZIP 导入的配图落盘需要它定位 userData/images）
 */
function createExportHandlers({ ipcMain, BrowserWindow, dialog, JSZip, getDataPath }) {
  /** 隐藏窗口：PDF 导出与系统打印共用（不显示、无 Node 权限） */
  function createHiddenRenderWindow() {
    return new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
  }

  /** 把导出用的 HTML 载入隐藏窗口（forPrint 版式：白底、无边距装饰） */
  async function loadExportHtml(targetWindow, payload) {
    const htmlContent = buildExportDocument({
      title: payload.title,
      content: payload.content,
      forPrint: true,
    });
    await targetWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  }

  /** 递归收集目录下的可导入文本文件（带深度与数量上限） */
  async function collectFromDirectory(rootDir) {
    const files = [];
    const walk = async (dir, depth) => {
      if (depth > MAX_SCAN_DEPTH) return;
      let entries = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const relative = path.relative(rootDir, full).split(path.sep).join("/");
        if (entry.isDirectory()) {
          if (isImportablePath(path.join(relative, "x.md"))) await walk(full, depth + 1);
          continue;
        }
        if (!isImportablePath(relative)) continue;
        try {
          const stat = await fs.stat(full);
          // 单文件上限在 buildImportPlan 里还会再挡一次，这里先避免把大文件读进内存
          if (stat.size > 5 * 1024 * 1024) continue;
          const content = await fs.readFile(full, "utf-8");
          files.push({ path: relative, content });
        } catch {
          /* 单个文件读失败不影响整批导入 */
        }
      }
    };
    await walk(rootDir, 0);
    return files;
  }

  /** 从 zip 里取出文本与图片；图片落盘后把正文里的相对引用改写到落盘位置 */
  async function collectFromZip(filePath) {
    const buffer = await fs.readFile(filePath);
    const zip = await JSZip.loadAsync(buffer);
    const textEntries = [];
    const imageEntries = [];

    for (const [entryPath, entry] of Object.entries(zip.files)) {
      if (!entry || entry.dir) continue;
      if (isImportablePath(entryPath)) {
        textEntries.push({ path: entryPath, content: await entry.async("string") });
      } else if (isImagePath(entryPath)) {
        imageEntries.push({ path: entryPath, entry });
      }
    }

    // 图片落到 userData/images/import-<时间戳>/ 下，尽量让导入后的文档能直接显示配图。
    // getDataPath 未注入时退化为"不落盘配图"：导入正文仍可用，不应因配图失败而整体失败。
    const mapping = new Map();
    const imageDir =
      imageEntries.length > 0 && typeof getDataPath === "function"
        ? path.join(path.dirname(getDataPath()), "images", "import-" + Date.now())
        : "";

    if (imageDir) {
      await fs.mkdir(imageDir, { recursive: true });
      let index = 0;
      for (const image of imageEntries) {
        index += 1;
        // 上限与 docs 同量级即可，避免恶意 zip 塞入海量图片
        if (index > MAX_IMPORT_FILES) break;
        try {
          const name = uniqueImageName(image.path, index);
          const target = path.join(imageDir, name);
          await fs.writeFile(target, Buffer.from(await image.entry.async("nodebuffer")));
          const url = "file:///" + target.split(path.sep).join("/");
          mapping.set(image.path.split(path.sep).join("/"), url);
          mapping.set(path.basename(image.path), url);
        } catch {
          /* 单张图片失败不影响正文导入 */
        }
      }
    }

    const rewritten = textEntries.map((file) => ({
      path: file.path,
      content: rewriteImageLinks(file.content, (ref) => {
        const normalized = ref.replace(/^\.\//, "").split(path.sep).join("/");
        return mapping.get(normalized) ?? mapping.get(path.basename(normalized)) ?? null;
      }),
    }));

    return { files: rewritten, imageCount: mapping.size };
  }

  function register() {
    ipcMain.handle("notes:export-doc", async (_event, payload) => {
      assertExportPayload(payload);
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
      assertExportPayload(payload, { allowDocs: true });
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
      assertExportPayload(payload, { allowDocs: true });
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

    // 导入 Markdown 文件
    ipcMain.handle("notes:import-md", async () => {
      const win = BrowserWindow.getFocusedWindow();
      const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
        title: "导入 Markdown 文件",
        filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
        properties: ["openFile", "multiSelections"],
      });
      if (canceled || !filePaths || filePaths.length === 0) return null;

      const docs = [];
      for (const fp of filePaths) {
        try {
          const content = await fs.readFile(fp, "utf-8");
          const basename = path.basename(fp, path.extname(fp));
          // 尝试从内容第一行提取标题
          const firstLine = content.split("\n")[0] || "";
          const titleMatch = firstLine.match(/^#{1,6}\s+(.+)$/);
          const title = titleMatch ? titleMatch[1].trim() : basename;
          docs.push({ title, content });
        } catch (err) {
          console.warn("Failed to read import file:", fp, err);
        }
      }
      return docs;
    });

    // 批量导入（O4）：文件夹 / zip 包。返回信封，失败时带上原因
    ipcMain.handle("notes:import-files", async (_event, payload) => {
      const kind = payload && payload.kind;
      if (kind !== "folder" && kind !== "zip") {
        return { ok: false, error: "不支持的导入方式" };
      }

      const win = BrowserWindow.getFocusedWindow();
      const isZip = kind === "zip";
      const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
        title: isZip ? "导入 ZIP 包" : "导入 Markdown 文件夹",
        filters: isZip ? [{ name: "Zip", extensions: ["zip"] }] : undefined,
        properties: isZip ? ["openFile"] : ["openDirectory"],
      });
      if (canceled || !filePaths || filePaths.length === 0) {
        return { ok: false, canceled: true };
      }

      try {
        let plan;
        let imageCount = 0;

        if (isZip) {
          const collected = await collectFromZip(filePaths[0]);
          imageCount = collected.imageCount;
          plan = buildImportPlan(collected.files);
        } else {
          const collected = await collectFromDirectory(filePaths[0]);
          plan = buildImportPlan(collected);
        }

        return { ok: true, docs: plan.docs, skipped: plan.skipped, imageCount };
      } catch (err) {
        console.error("Import failed:", err);
        return { ok: false, error: err && err.message ? String(err.message) : "导入失败" };
      }
    });

    // 导出文档为 HTML
    ipcMain.handle("notes:export-html", async (_event, payload) => {
      assertExportPayload(payload);
      const win = BrowserWindow.getFocusedWindow();
      const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined, {
        title: "导出 HTML 文档",
        defaultPath: `${safeName(payload.title)}.html`,
        filters: [{ name: "HTML", extensions: ["html"] }],
      });
      if (canceled || !filePath) return false;

      const htmlContent = buildExportDocument({
        title: payload.title,
        content: payload.content,
        forPrint: false,
      });
      await fs.writeFile(filePath, htmlContent, "utf-8");
      return true;
    });

    // 导出文档为 PDF
    ipcMain.handle("notes:export-pdf", async (_event, payload) => {
      assertExportPayload(payload);
      const win = BrowserWindow.getFocusedWindow();
      const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined, {
        title: "导出 PDF 文档",
        defaultPath: `${safeName(payload.title)}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (canceled || !filePath) return false;

      const options = normalizeExportOptions(payload.options);
      const pdfWindow = createHiddenRenderWindow();

      // loadURL 也在 try 内：超大内容 data URL 可能超限抛错，失败时同样要销毁隐藏窗口防泄漏
      try {
        await loadExportHtml(pdfWindow, payload);
        const footer = options.headerFooter ? buildHeaderFooterTemplates(payload.title) : null;
        const pdfData = await pdfWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: options.pageSize,
          marginTop: options.margins.top,
          marginBottom: options.margins.bottom,
          marginLeft: options.margins.left,
          marginRight: options.margins.right,
          // 页码与页眉由 Chromium 画在页边距区域内（因此 normalize 时抬高了上下边距）
          displayHeaderFooter: options.headerFooter,
          ...(footer ?? {}),
        });
        await fs.writeFile(filePath, pdfData);
        pdfWindow.close();
        return true;
      } catch (err) {
        console.error("PDF export failed:", err);
        if (!pdfWindow.isDestroyed()) pdfWindow.destroy();
        return false;
      }
    });

    // 系统打印（C5）：走 Chromium 的打印流程，弹出系统打印机选择框
    ipcMain.handle("notes:print-doc", async (_event, payload) => {
      assertExportPayload(payload);
      const printWindow = createHiddenRenderWindow();

      try {
        await loadExportHtml(printWindow, payload);
        const result = await new Promise((resolve) => {
          printWindow.webContents.print(
            { silent: false, printBackground: true },
            (success, failureReason) => resolve({ success, failureReason }),
          );
        });

        if (!printWindow.isDestroyed()) printWindow.destroy();

        if (result.success) return { ok: true };
        // 用户点了取消不是错误，不要在界面上报错
        if (/cancel/i.test(String(result.failureReason || ""))) return { ok: false, cancelled: true };
        return { ok: false, error: result.failureReason || "打印失败" };
      } catch (err) {
        console.error("Print failed:", err);
        if (!printWindow.isDestroyed()) printWindow.destroy();
        return { ok: false, error: err && err.message ? String(err.message) : "打印失败" };
      }
    });
  }

  return { register };
}

module.exports = { createExportHandlers };
