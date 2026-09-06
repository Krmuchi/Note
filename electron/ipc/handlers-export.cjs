// 导出/导入类 IPC handlers：Markdown、ZIP、HTML、PDF 导出与 Markdown 导入。
// 从 main.cjs 纯拆分而来，逻辑不变。

const path = require("node:path");
const fs = require("node:fs/promises");
const {
  assertExportPayload,
  safeName,
  escapeHtml,
  markdownToSimpleHtml,
} = require("./shared.cjs");

/**
 * @param {object} deps
 * @param {Electron.IpcMain} deps.ipcMain
 * @param {typeof import('electron').BrowserWindow} deps.BrowserWindow
 * @param {typeof import('electron').dialog} deps.dialog
 * @param {typeof import('jszip')} deps.JSZip
 */
function createExportHandlers({ ipcMain, BrowserWindow, dialog, JSZip }) {
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

      const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(payload.title || "文档")}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; color: #333; }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
    h1 { border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
    h2 { border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 90%; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding: 0.5em 1em; color: #666; background: #f9f9f9; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; }
    img { max-width: 100%; height: auto; }
    a { color: #0066cc; }
    u { text-decoration: underline; }
    mark { background: #fff3a0; padding: 0 2px; }
    del { text-decoration: line-through; color: #999; }
    input[type="checkbox"] { margin-right: 6px; }
    hr { border: none; border-top: 2px solid #eee; margin: 1.5em 0; }
    .doc-meta { color: #666; font-size: 14px; margin-bottom: 2em; border-bottom: 1px solid #eee; padding-bottom: 1em; }
  </style>
</head>
<body>
  <h1>${escapeHtml(payload.title || "未命名文档")}</h1>
  <div class="doc-meta">导出时间: ${new Date().toLocaleString('zh-CN')}</div>
  <div class="doc-content">
    ${markdownToSimpleHtml(payload.content)}
  </div>
</body>
</html>`;
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

      // 创建一个隐藏的窗口来渲染 HTML 并打印为 PDF
      const pdfWindow = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(payload.title || "文档")}</title>
  <style>
    body { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.6; color: #333; }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
    h1 { border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 6px; overflow-x: auto; }
    blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding: 0.5em 1em; color: #666; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; }
    img { max-width: 100%; height: auto; }
    u { text-decoration: underline; }
    mark { background: #fff3a0; padding: 0 2px; }
    del { text-decoration: line-through; color: #999; }
    input[type="checkbox"] { margin-right: 6px; }
    hr { border: none; border-top: 2px solid #eee; margin: 1.5em 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(payload.title || "未命名文档")}</h1>
  <div style="color: #666; font-size: 14px; margin-bottom: 2em;">
    导出时间: ${new Date().toLocaleString('zh-CN')}
  </div>
  ${markdownToSimpleHtml(payload.content)}
</body>
</html>`;

      // loadURL 也在 try 内：超大内容 data URL 可能超限抛错，失败时同样要销毁隐藏窗口防泄漏
      try {
        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
        const pdfData = await pdfWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          marginTop: 0.4,
          marginBottom: 0.4,
          marginLeft: 0.4,
          marginRight: 0.4,
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
  }

  return { register };
}

module.exports = { createExportHandlers };
