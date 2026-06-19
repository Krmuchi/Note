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

contextBridge.exposeInMainWorld("notesApi", {
  load: withErrorHandling(() => ipcRenderer.invoke("notes:load")),
  save: withErrorHandling((payload) => ipcRenderer.invoke("notes:save", payload)),
  exportDoc: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-doc", payload)),
  exportNotebook: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-notebook", payload)),
  exportNotebookZip: withErrorHandling((payload) => ipcRenderer.invoke("notes:export-notebook-zip", payload)),
  saveImage: withErrorHandling((payload) => ipcRenderer.invoke("notes:save-image", payload)),
})