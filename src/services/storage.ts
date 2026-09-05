import JSZip from 'jszip'
import type { AppStore, NoteDoc } from '@/types'

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

export async function loadAppStore(): Promise<AppStore> {
  if (!isWebMode) {
    return window.notesApi.load()
  }
  const stored = await idbGet<AppStore>(APP_STORE_KEY)
  return stored ?? emptyStore()
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

/** Web 模式下返回原 data URL 直接用于编辑器引用，Electron 下由主进程落盘返回文件路径。 */
export async function saveImage(payload: { name: string; data: string }): Promise<string> {
  if (!isWebMode) {
    return window.notesApi.saveImage(payload)
  }
  return payload.data
}

/* ---------------- 导出/导入（Web 模式走浏览器下载与文件选择） ---------------- */

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 将 markdown 文本按行转换为带转义的简单 HTML（仅 Web 模式导出用） */
function markdownToSimpleHtml(content: string): string {
  return (content || '').split('\n').map((raw) => {
    const esc = escapeHtml(raw)
    if (raw.startsWith('# ')) return `<h1>${escapeHtml(raw.slice(2))}</h1>`
    if (raw.startsWith('## ')) return `<h2>${escapeHtml(raw.slice(3))}</h2>`
    if (raw.startsWith('### ')) return `<h3>${escapeHtml(raw.slice(4))}</h3>`
    if (raw.startsWith('#### ')) return `<h4>${escapeHtml(raw.slice(5))}</h4>`
    if (raw.startsWith('> ')) return `<blockquote><p>${escapeHtml(raw.slice(2))}</p></blockquote>`
    if (raw.startsWith('- ')) return `<li>${escapeHtml(raw.slice(2))}</li>`
    if (raw.startsWith('* ')) return `<li>${escapeHtml(raw.slice(2))}</li>`
    if (raw.startsWith('```')) return ''
    if (/^\d+\.\s/.test(raw)) return `<li>${escapeHtml(raw.replace(/^\d+\.\s/, ''))}</li>`
    if (raw.trim() === '') return '<br>'
    return `<p>${esc}</p>`
  }).join('\n')
}

function buildHtmlDocument(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title || '文档')}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; color: #333; }
    h1 { border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 90%; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 6px; overflow-x: auto; }
    blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding: 0.5em 1em; color: #666; background: #f9f9f9; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title || '未命名文档')}</h1>
  <div class="doc-meta">导出时间: ${new Date().toLocaleString('zh-CN')}</div>
  <div class="doc-content">
    ${markdownToSimpleHtml(content)}
  </div>
</body>
</html>`
}

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
  const html = buildHtmlDocument(payload.title, payload.content)
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${sanitizeFilename(payload.title)}.html`)
  return true
}

export async function exportPdfDoc(payload: { title: string; content: string }): Promise<boolean> {
  if (!isWebMode) {
    return window.notesApi.exportPdf(payload)
  }
  // Web 模式：打开打印窗口由用户另存为 PDF
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    throw new Error('无法打开打印窗口，请允许弹出窗口后重试')
  }
  printWindow.document.write(buildHtmlDocument(payload.title, payload.content))
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  return true
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
