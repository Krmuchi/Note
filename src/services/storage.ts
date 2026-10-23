import JSZip from 'jszip'
import type {
  AppAction,
  AppInfoResult,
  AppSettings,
  AppSettingsResult,
  AppStore,
  BackupResult,
  CrashLogResult,
  FileAssociationState,
  ImportFilesResult,
  ImportKind,
  LoadStoreResult,
  MigrateDataDirResult,
  NoteDoc,
  PdfExportOptions,
  PrintResult,
  UpdateCheckResult,
} from '@/types'
// 与 Electron 主进程共用同一份导出 HTML 生成实现，避免 Web 模式维护第二套
// 粗糙的 markdown→HTML 转换（旧实现 li 无包裹、代码块被丢弃）。
// 该文件是 ESM(.mjs)：渲染层由 Vite 原生解析，主进程用 require()（Electron 41 支持 require(esm)）。
// 注意不要改回 .cjs —— Vite dev server 不做 CJS→ESM 互操作，会报
// "does not provide an export named 'buildExportDocument'"，整树被 ErrorBoundary 兜住变白屏。
import { buildExportDocument } from '../../electron/ipc/shared.mjs'

/**
 * 存储适配层：统一 Electron IPC 与 Web 浏览器模式的数据持久化接口。
 * Electron 下透传 window.notesApi；纯浏览器（npm run dev:web）下走 IndexedDB 与浏览器下载。
 */

export const isWebMode: boolean =
  typeof window !== 'undefined' && typeof window.notesApi === 'undefined'

/* ---------------- IndexedDB 封装（单库单键，存储整个 AppStore JSON） ---------------- */

const DB_NAME = 'notes-web-db'
const DB_VERSION = 1
const KV_STORE = 'kv'
const APP_STORE_KEY = 'app-store'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KV_STORE, 'readonly')
    const req = tx.objectStore(KV_STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KV_STORE, 'readwrite')
    tx.objectStore(KV_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/* ---------------- 浏览器下载辅助 ---------------- */

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function sanitizeFilename(name: string): string {
  return (name || 'untitled').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
}

function emptyStore(): AppStore {
  return { notebooks: [], trash: [], tags: [], searchHistory: [] }
}

/* ---------------- 统一接口 ---------------- */

/** 读取持久化数据；失败返回信封（与主进程 notes:load 契约一致，不抛错） */
export async function loadAppStore(): Promise<LoadStoreResult> {
  if (!isWebMode) {
    return window.notesApi.load()
  }
  try {
    const stored = await idbGet<AppStore>(APP_STORE_KEY)
    return { ok: true, data: stored ?? emptyStore() }
  } catch (err) {
    // Web 模式也返回同一个信封，让上层只有一条失败处理路径
    return { ok: false, error: err instanceof Error ? err.message : '读取本地数据失败' }
  }
}

/** 应用信息（版本与数据目录）；Web 模式返回失败信封 */
export async function getAppInfo(): Promise<AppInfoResult> {
  if (!isWebMode) {
    return window.notesApi.appInfo()
  }
  return { ok: false, error: '浏览器模式没有本地数据目录' }
}

/** 打开数据目录（Electron 专用）；Web 模式返回失败信封 */
export async function openDataDir(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isWebMode) {
    return window.notesApi.openDataDir()
  }
  return { ok: false, error: '浏览器模式没有本地数据目录' }
}

/* ---------------- 本机偏好设置（Electron 专用） ---------------- */

const NO_APP_SETTINGS = { ok: false as const, error: '浏览器模式没有本机偏好设置' }

export async function getAppSettings(): Promise<AppSettingsResult> {
  if (!isWebMode) {
    return window.notesApi.appSettingsGet()
  }
  return NO_APP_SETTINGS
}

export async function setAppSettings(patch: Partial<AppSettings>): Promise<AppSettingsResult> {
  if (!isWebMode) {
    return window.notesApi.appSettingsSet(patch)
  }
  return NO_APP_SETTINGS
}

/** 订阅主进程动作（托盘菜单 / 全局快捷键）；Web 模式返回空取消函数 */
export function onAppAction(cb: (action: AppAction) => void): () => void {
  if (!isWebMode) {
    return window.notesApi.onAppAction(cb)
  }
  return () => {}
}

export async function saveAppStore(payload: AppStore): Promise<AppStore> {
  if (!isWebMode) {
    return window.notesApi.save(payload)
  }
  await idbSet(APP_STORE_KEY, payload)
  return payload
}

export async function exportDoc(payload: { title: string; content: string }): Promise<boolean> {
  if (!isWebMode) {
    return window.notesApi.exportDoc(payload)
  }
  const blob = new Blob([payload.content ?? ''], { type: 'text/markdown;charset=utf-8' })
  downloadBlob(blob, `${sanitizeFilename(payload.title)}.md`)
  return true
}

export async function exportNotebook(payload: { title: string; docs: NoteDoc[] }): Promise<boolean> {
  if (!isWebMode) {
    return window.notesApi.exportNotebook(payload)
  }
  const parts = [`# ${payload.title}`]
  for (const doc of payload.docs) {
    parts.push(`\n\n## ${doc.title}\n\n${doc.content ?? ''}`)
  }
  const blob = new Blob([parts.join('')], { type: 'text/markdown;charset=utf-8' })
  downloadBlob(blob, `${sanitizeFilename(payload.title)}.md`)
  return true
}

export async function exportNotebookZip(payload: { title: string; docs: NoteDoc[] }): Promise<boolean> {
  if (!isWebMode) {
    return window.notesApi.exportNotebookZip(payload)
  }
  const zip = new JSZip()
  const folder = zip.folder(sanitizeFilename(payload.title)) ?? zip
  for (const doc of payload.docs) {
    folder.file(`${sanitizeFilename(doc.title)}.md`, doc.content ?? '')
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, `${sanitizeFilename(payload.title)}.zip`)
  return true
}

/**
 * Web 模式下返回原 data URL 直接用于编辑器引用，Electron 下由主进程落盘返回文件路径。
 * 主进程返回 { ok:false,error } 信封时抛错，调用方据此区分"失败内联回退"与成功落盘。
 */
export async function saveImage(payload: { name: string; data: string }): Promise<string> {
  if (!isWebMode) {
    const result = await window.notesApi.saveImage(payload)
    if (!result.ok) {
      throw new Error(result.error || '文件保存失败')
    }
    return result.path
  }
  return payload.data
}

/**
 * 通用附件落盘（非图片文件）。
 * 主进程 notes:save-image 处理器本身不校验 MIME，可复用于任意文件；
 * Web 模式回落为 data URL（体积较大，仅用于内联引用）。
 */
export async function saveFile(payload: { name: string; data: string }): Promise<string> {
  return saveImage(payload)
}

/* ---------------- 导出/导入（Web 模式走浏览器下载与文件选择） ---------------- */

function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => resolve(input.files ? Array.from(input.files) : [])
    input.addEventListener('cancel', () => resolve([]))
    input.click()
  })
}

export async function exportHtmlDoc(payload: { title: string; content: string }): Promise<boolean> {
  if (!isWebMode) {
    return window.notesApi.exportHtml(payload)
  }
  const html = buildExportDocument({ title: payload.title, content: payload.content })
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${sanitizeFilename(payload.title)}.html`)
  return true
}

export async function exportPdfDoc(payload: {
  title: string
  content: string
  options?: PdfExportOptions
}): Promise<boolean> {
  if (!isWebMode) {
    return window.notesApi.exportPdf(payload)
  }
  // Web 模式：打开打印窗口由用户另存为 PDF
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    throw new Error('无法打开打印窗口，请允许弹出窗口后重试')
  }
  printWindow.document.write(buildExportDocument({ title: payload.title, content: payload.content, forPrint: true }))
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  return true
}

/** 系统打印（C5）；Web 模式退化为浏览器打印 */
export async function printDoc(payload: { title: string; content: string }): Promise<PrintResult> {
  if (!isWebMode) {
    return window.notesApi.printDoc(payload)
  }
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    return { ok: false, error: '无法打开打印窗口，请允许弹出窗口后重试' }
  }
  printWindow.document.write(buildExportDocument({ title: payload.title, content: payload.content, forPrint: true }))
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  return { ok: true }
}

export async function exportAllData(payload: AppStore): Promise<boolean> {
  if (!isWebMode) {
    return window.notesApi.exportAll(payload)
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  downloadBlob(blob, `笔记备份-${new Date().toISOString().slice(0, 10)}.json`)
  return true
}

export async function importMarkdownDocs(): Promise<{ title: string; content: string }[] | null> {
  if (!isWebMode) {
    return window.notesApi.importMd()
  }
  const files = await pickFiles('.md,.markdown,.txt', true)
  if (files.length === 0) return null

  const docs: { title: string; content: string }[] = []
  for (const file of files) {
    const content = await file.text()
    const firstLine = content.split('\n')[0] || ''
    const titleMatch = firstLine.match(/^#{1,6}\s+(.+)$/)
    const basename = file.name.replace(/\.[^.]+$/, '')
    docs.push({ title: titleMatch ? titleMatch[1].trim() : basename, content })
  }
  return docs
}

/* ---------------- 本地备份（仅 Electron：userData/backups） ---------------- */

const WEB_NO_BACKUP: { ok: false; error: string } = {
  ok: false,
  error: '浏览器模式不支持本地自动备份，请使用"导出全部/导入备份"',
}

/** 列出本地自动备份；Web 模式返回失败信封 */
export async function listLocalBackups(): Promise<BackupResult> {
  if (!isWebMode) {
    return window.notesApi.backupList()
  }
  return WEB_NO_BACKUP
}

/** 从本地备份覆盖式恢复；Web 模式返回失败信封 */
export async function restoreLocalBackup(name: string): Promise<{ ok: true; restoredAt: string } | { ok: false; error: string }> {
  if (!isWebMode) {
    return window.notesApi.restoreBackup({ name })
  }
  return WEB_NO_BACKUP
}

/** 订阅"自动备份完成"通知；Web 模式返回空取消函数 */
export function onBackupCreated(cb: (info: { at: string; name: string }) => void): () => void {
  if (!isWebMode) {
    return window.notesApi.onBackupCreated(cb)
  }
  return () => {}
}

/** 批量导入文件夹 / zip 包（O4）；Web 模式不支持 */
/** 用系统浏览器打开 https 链接（Web 模式退回 window.open） */
export async function openExternal(url: string): Promise<void> {
  if (isWebMode) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  const result = await window.notesApi.openExternal(url)
  if (!result.ok) throw new Error(result.error || '打开链接失败')
}

/** P5：读取 .md 文件关联状态 */
export async function getFileAssociation(): Promise<FileAssociationState> {
  if (isWebMode) return { ok: true, supported: false, enabled: false }
  return window.notesApi.fileAssociationGet()
}

/** P5：开启 / 关闭 .md 文件关联（仅 Windows，写 HKCU，可恢复） */
export async function setFileAssociation(enabled: boolean): Promise<FileAssociationState> {
  if (isWebMode) return { ok: false, supported: false, enabled: false, error: '浏览器模式不支持文件关联' }
  return window.notesApi.fileAssociationSet(enabled)
}

/** O5：迁移数据目录（Web 模式没有数据目录概念） */
export async function migrateDataDir(): Promise<MigrateDataDirResult> {
  if (isWebMode) return { ok: false, error: '浏览器模式不支持迁移数据目录' }
  return window.notesApi.migrateDataDir()
}

/** O5：重启应用 */
export async function relaunchApp(): Promise<{ ok: boolean; error?: string }> {
  if (isWebMode) return { ok: false, error: '浏览器模式不支持重启应用' }
  return window.notesApi.relaunchApp()
}

/** D5：读取本机崩溃记录（Web 模式没有主进程，返回空） */
export async function readCrashLog(): Promise<CrashLogResult> {
  if (isWebMode) return { ok: true, entries: [], latest: null, summary: '浏览器模式没有崩溃日志' }
  return window.notesApi.crashLogGet()
}

/** D5：清空崩溃记录 */
export async function clearCrashLog(): Promise<{ ok: boolean; error?: string }> {
  if (isWebMode) return { ok: true }
  return window.notesApi.crashLogClear()
}

/** D3：检查更新 */
export async function checkForUpdate(url?: string): Promise<UpdateCheckResult> {
  if (isWebMode) return { ok: false, error: '浏览器模式不支持检查更新' }
  return window.notesApi.checkUpdate(url ? { url } : undefined)
}

/** P7：系统通知（窗口不在前台时才会真正弹出） */
export async function notify(payload: { title: string; body?: string }): Promise<void> {
  if (isWebMode) return
  try {
    await window.notesApi.notify(payload)
  } catch {
    // 通知失败不该影响主流程
  }
}

/** P10：把最近文档推给主进程，用于任务栏跳转列表 */
export async function updateRecents(docs: { id: string; title: string }[]): Promise<void> {
  if (isWebMode) return
  try {
    await window.notesApi.updateRecents(docs)
  } catch {
    // 跳转列表更新失败不影响使用
  }
}

export async function importFiles(kind: ImportKind): Promise<ImportFilesResult> {
  if (!isWebMode) {
    return window.notesApi.importFiles({ kind })
  }
  return { ok: false, error: '浏览器模式不支持批量导入' }
}

export async function importBackupData(): Promise<AppStore | null> {
  if (!isWebMode) {
    return window.notesApi.importBackup()
  }
  const files = await pickFiles('.json,application/json', false)
  const file = files[0]
  if (!file) return null

  const data = JSON.parse(await file.text()) as AppStore
  if (!data || typeof data !== 'object' || !Array.isArray(data.notebooks)) {
    throw new Error('无效的备份文件：缺少 notebooks 数据')
  }
  return data
}
