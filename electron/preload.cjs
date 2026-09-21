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

contextBridge.exposeInMainWorld("notesApi", {
  load: withErrorHandling(() => ipcRenderer.invoke("notes:load")),
  save: withErrorHandling((payload) => ipcRenderer.invoke("notes:save", payload)),
  exportDoc: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-doc", payload)),
  exportNotebook: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-notebook", payload)),
  exportNotebookZip: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-notebook-zip", payload)),
  exportAll: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-all", payload)),
  exportHtml: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-html", payload)),
  exportPdf: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-pdf", payload)),
  importMd: withErrorHandling(() => ipcRenderer.invoke("notes:import-md")),
  importBackup: withErrorHandling(() => ipcRenderer.invoke("notes:import-backup")),
  saveImage: withErrorHandling((payload) => ipcRenderer.invoke("notes:save-image", payload)),

  /* ===== AI 能力 ===== */
  aiConfigGet: () => ipcRenderer.invoke('ai:config:get'),
  aiConfigSet: (patch) => ipcRenderer.invoke('ai:config:set', patch),
  aiConfigClear: () => ipcRenderer.invoke('ai:config:clear'),
  aiConfigTest: (patch) => ipcRenderer.invoke('ai:config:test', patch),
  aiListModels: (patch) => ipcRenderer.invoke('ai:models:list', patch),
  aiGenerate: (payload) => ipcRenderer.invoke('ai:generate', payload),
  aiBatch: (payloads) => ipcRenderer.invoke('ai:batch', payloads),
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