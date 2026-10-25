// 主进程的本机集成类 IPC handler。
//
// 从 main.cjs 纯拆分而来：这些 handler 此前内联在 app.whenReady() 的巨型回调里，
// 与窗口创建、托盘、菜单、CSP 混在同一个函数（main.cjs 曾达 1131 行）。
// 迁移到工厂模块后，main.cjs 只负责组装依赖，逻辑一字未改。
//
// 全部依赖通过参数注入（而不是自己 require electron），因此可以用测试替身
// 直接覆盖 —— 与 handlers-storage / handlers-export / handlers-ai 同一约定。

/**
 * @param {object} deps
 * @param {import('electron').IpcMain} deps.ipcMain
 * @param {import('electron').App} deps.app
 * @param {import('electron').Dialog} deps.dialog
 * @param {import('electron').Notification} deps.Notification
 * @param {() => any} deps.getMainWindow
 * @param {() => void} deps.showMainWindow
 * @param {() => any} deps.getAppSettingsStore
 * @param {() => any} deps.getCrashLogStore
 * @param {() => string} deps.resolveDataDir
 * @param {(enabled: boolean) => {ok: boolean, error?: string}} deps.applyAutoLaunch
 * @param {() => boolean} deps.readAutoLaunchState
 * @param {(enabled: boolean) => {ok: boolean, error?: string}} deps.applyGlobalQuickNote
 * @param {(docs: Array<{id: string, title: string}>) => void} deps.setRecentDocs
 * @param {() => void} deps.rebuildJumpList
 * @param {(args: string[]) => Promise<{stdout: string}>} deps.runReg
 * @param {object} deps.fsp
 * @param {object} deps.path
 * @param {object} deps.validation  { validateMigration, planMigrationEntries }
 * @param {object} deps.fileOpen    { buildRegistryPlan, buildRegistryCommands }
 * @param {object} deps.updateCheck { evaluateUpdate, parseReleaseManifest, DEFAULT_UPDATE_MANIFEST_URL, UPDATE_CHECK_TIMEOUT }
 * @param {(entry: any) => string} deps.formatCrashEntry
 */
function createIntegrationHandlers(deps) {
  const {
    ipcMain,
    app,
    dialog,
    Notification,
    getMainWindow,
    showMainWindow,
    getAppSettingsStore,
    getCrashLogStore,
    resolveDataDir,
    applyAutoLaunch,
    readAutoLaunchState,
    applyGlobalQuickNote,
    setRecentDocs,
    rebuildJumpList,
    runReg,
    fsp,
    path,
    validation,
    fileOpen,
    updateCheck,
    formatCrashEntry,
  } = deps;

  const { validateMigration, planMigrationEntries } = validation;
  const { buildRegistryPlan, buildRegistryCommands } = fileOpen;
  const { evaluateUpdate, parseReleaseManifest, DEFAULT_UPDATE_MANIFEST_URL, UPDATE_CHECK_TIMEOUT } = updateCheck;

  function register() {
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

    // D5：崩溃记录读取 / 清理
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
      setRecentDocs(
        list
          .filter((item) => item && typeof item.id === "string" && item.id.length > 0)
          .slice(0, 10)
          .map((item) => ({ id: item.id, title: typeof item.title === "string" ? item.title : "" })),
      );
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
  }

  return { register };
}

module.exports = { createIntegrationHandlers };
