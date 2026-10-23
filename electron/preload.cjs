const { contextBridge, ipcRenderer } = require("electron")

function withErrorHandling(fn) {
  return async (...args) => {
    try {
      const result = await fn(...args)
      return result
    } catch (err) {
      console.error(`[preload] IPC call failed:`, err)
      throw new Error(err.message || '操作失败，请重试')
    }
  }
}

/* ===== AI 通道 =====
   刻意不复用 withErrorHandling：它会把任何错误重包成 new Error(err.message)，
   code / retryable / httpStatus 会全部丢失。AI 通道统一由主进程返回信封
   （{ ok: false, error }），因此这里必须原样透传。 */

const AI_STREAM_EVENT = 'ai:stream:event'
/** requestId → 事件回调，单通道多路复用 */
const aiStreamHandlers = new Map()

function dispatchAiStreamEvent(_event, payload) {
  if (!payload || typeof payload.requestId !== 'string') return
  const onEvent = aiStreamHandlers.get(payload.requestId)
  if (!onEvent) return
  try {
    onEvent(payload)
  } catch (err) {
    console.error('[preload] AI 流事件回调异常:', err)
  }
}

let aiStreamBound = false
function ensureAiStreamBinding() {
  if (aiStreamBound) return
  aiStreamBound = true
  // 只注册一次。若每次流式调用都 on + removeListener，并发多个流就会触发
  // MaxListenersExceededWarning，且存在监听器泄漏风险。
  ipcRenderer.on(AI_STREAM_EVENT, dispatchAiStreamEvent)
}

/* ===== 备份完成通知（主 → 渲染） =====
   与 AI 流一致：模块加载时只注册一次 ipcRenderer.on，用回调集合分发；
   绝不按调用次数 on/removeListener（会触发 MaxListenersExceededWarning 并泄漏监听器）。 */
const backupCreatedListeners = new Set()

ipcRenderer.on('backup:created', (_event, payload) => {
  if (!payload || typeof payload.at !== 'string') return
  backupCreatedListeners.forEach((cb) => {
    try {
      cb(payload)
    } catch (err) {
      console.error('[preload] 备份通知回调异常:', err)
    }
  })
})

/* ===== 主进程动作（托盘 / 全局快捷键 → 渲染） =====
   与 AI 流、备份通知一致：只注册一次 ipcRenderer.on，用回调集合分发。 */
const appActionListeners = new Set()

ipcRenderer.on('app:action', (_event, payload) => {
  if (!payload || typeof payload.type !== 'string') return
  appActionListeners.forEach((cb) => {
    try {
      cb(payload)
    } catch (err) {
      console.error('[preload] 应用动作回调异常:', err)
    }
  })
})

contextBridge.exposeInMainWorld("notesApi", {
  // 加载通道返回信封（{ ok, data } / { ok, error }），主进程永不 throw
  load: () => ipcRenderer.invoke("notes:load"),
  save: withErrorHandling((payload) => ipcRenderer.invoke("notes:save", payload)),
  exportDoc: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-doc", payload)),
  exportNotebook: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-notebook", payload)),
  exportNotebookZip: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-notebook-zip", payload)),
  exportAll: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-all", payload)),
  exportHtml: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-html", payload)),
  exportPdf: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-pdf", payload)),
  // 打印返回信封（{ ok } / { ok:false, cancelled }），刻意不包 withErrorHandling 以免丢掉结构
  printDoc: (payload) => ipcRenderer.invoke("notes:print-doc", payload),
  importMd: withErrorHandling(() => ipcRenderer.invoke("notes:import-md")),
  // 批量导入返回信封（{ ok, docs } / { ok:false, canceled }），不包 withErrorHandling 以免丢结构
  importFiles: (payload) => ipcRenderer.invoke("notes:import-files", payload),
  importBackup: withErrorHandling(() => ipcRenderer.invoke("notes:import-backup")),
  saveImage: withErrorHandling((payload) => ipcRenderer.invoke("notes:save-image", payload)),

  /* ===== 应用信息与数据目录（信封返回，主进程永不 throw） ===== */
  appInfo: () => ipcRenderer.invoke("notes:app-info"),
  openDataDir: () => ipcRenderer.invoke("notes:open-data-dir"),
  openExternal: (url) => ipcRenderer.invoke("notes:open-external", { url }),
  // O5 数据目录迁移 / 重启：返回信封
  migrateDataDir: () => ipcRenderer.invoke("notes:migrate-data-dir"),
  // P5 文件关联：读状态 / 开关（仅 Windows，HKCU）
  fileAssociationGet: () => ipcRenderer.invoke("notes:file-association:get"),
  fileAssociationSet: (enabled) => ipcRenderer.invoke("notes:file-association:set", { enabled }),
  relaunchApp: () => ipcRenderer.invoke("notes:relaunch"),

  /* ===== 本机偏好设置（信封返回，主进程永不 throw） ===== */
  appSettingsGet: () => ipcRenderer.invoke('notes:app-settings:get'),
  // P7 系统通知：信封返回（{ ok } / { ok:false, skipped }）
  notify: (payload) => ipcRenderer.invoke('notes:notify', payload),
  // D5 崩溃记录 / D3 更新检查：都返回信封
  crashLogGet: () => ipcRenderer.invoke('notes:crash-log:get'),
  crashLogClear: () => ipcRenderer.invoke('notes:crash-log:clear'),
  checkUpdate: (payload) => ipcRenderer.invoke('notes:check-update', payload),
  // P10 任务栏最近文档
  updateRecents: (docs) => ipcRenderer.invoke('notes:update-recents', docs),
  appSettingsSet: (patch) => ipcRenderer.invoke('notes:app-settings:set', patch),
  /** 订阅主进程动作（托盘菜单 / 全局快捷键） */
  onAppAction: (cb) => {
    appActionListeners.add(cb)
    return () => {
      appActionListeners.delete(cb)
    }
  },

  /* ===== 本地备份（返回信封，主进程永不 throw） ===== */
  backupList: () => ipcRenderer.invoke('backup:list'),
  restoreBackup: (payload) => ipcRenderer.invoke('notes:restore-backup', payload),
  /** 订阅"自动备份完成"通知；返回取消订阅函数 */
  onBackupCreated: (cb) => {
    backupCreatedListeners.add(cb)
    return () => {
      backupCreatedListeners.delete(cb)
    }
  },

  /* ===== AI 能力 ===== */
  aiConfigGet: () => ipcRenderer.invoke('ai:config:get'),
  aiConfigSet: (patch) => ipcRenderer.invoke('ai:config:set', patch),
  aiConfigClear: () => ipcRenderer.invoke('ai:config:clear'),
  aiConfigTest: (patch) => ipcRenderer.invoke('ai:config:test', patch),
  aiListModels: (patch) => ipcRenderer.invoke('ai:models:list', patch),
  aiGenerate: (payload) => ipcRenderer.invoke('ai:generate', payload),
  aiBatch: (payloads, options) => ipcRenderer.invoke('ai:batch', payloads, options),
  aiStreamStart: (payload) => ipcRenderer.invoke('ai:stream:start', payload),
  aiCancel: (requestId) => ipcRenderer.invoke('ai:cancel', { requestId }),
  aiStreamSubscribe: (requestId, onEvent) => {
    ensureAiStreamBinding()
    aiStreamHandlers.set(requestId, onEvent)
    return () => {
      aiStreamHandlers.delete(requestId)
    }
  },
  aiStreamUnsubscribe: (requestId) => {
    aiStreamHandlers.delete(requestId)
  },
})