import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import JSZip from 'jszip'
import { createExportHandlers } from '../../electron/ipc/handlers-export.cjs'

/**
 * 回归：notes:import-files 的 ZIP 分支。
 *
 * 原先 handlers-export.cjs 既没 require getDataPath 也没 require MAX_IMPORT_FILES，
 * 点「导入 ZIP 包」必然抛 ReferenceError 并原样把英文错误弹给用户。
 * 这里用真实 zip 文件走完整 handler，确保两个标识符都能解析、配图确实落盘。
 */

type Handler = (event: unknown, payload: unknown) => Promise<unknown>

interface MakeOpts {
  pick: string
  dataPath: string
  /** 显式模拟"调用方没注入 getDataPath"的场景 */
  omitGetDataPath?: boolean
}

function makeHandlers({ pick, dataPath, omitGetDataPath }: MakeOpts): Map<string, Handler> {
  const handlers = new Map<string, Handler>()
  createExportHandlers({
    ipcMain: { handle: (ch: string, fn: Handler) => handlers.set(ch, fn) },
    BrowserWindow: { getFocusedWindow: () => null, fromWebContents: () => null },
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [pick] }),
      showSaveDialog: async () => ({ canceled: true }),
    },
    JSZip,
    ...(omitGetDataPath ? {} : { getDataPath: () => dataPath }),
  } as never).register()
  return handlers
}

async function makeZip(dir: string, files: Record<string, string | Buffer>): Promise<string> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) zip.file(name, content)
  const p = path.join(dir, 'import.zip')
  fs.writeFileSync(p, await zip.generateAsync({ type: 'nodebuffer' }))
  return p
}

describe('notes:import-files ZIP 分支', () => {
  it('导入 Markdown 并把配图落盘到 userData/images/import-*/ 下', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-zip-'))
    try {
      const dataPath = path.join(tmp, 'notes-data.json')
      const zipPath = await makeZip(tmp, {
        '笔记一.md': '# 标题一\n\n正文一',
        'sub/笔记二.md': '# 标题二\n\n正文二',
        'img/pic.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        'img/pic2.jpg': Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      })

      const handlers = makeHandlers({ pick: zipPath, dataPath })
      const result = (await handlers.get('notes:import-files')!(null, { kind: 'zip' })) as {
        ok: boolean
        error?: string
        docs?: { title: string; content: string }[]
        imageCount?: number
      }

      // 关键：不再返回 ok:false + ReferenceError
      expect(result.error).toBeUndefined()
      expect(result.ok).toBe(true)
      expect(result.docs).toHaveLength(2)
      expect(result.docs!.map((d) => d.title)).toEqual(['标题一', '标题二'])
      expect(result.imageCount).toBeGreaterThan(0)

      // 配图确实写到了 userData/images/import-<ts>/ 下
      const imgRoot = path.join(path.dirname(dataPath), 'images')
      expect(fs.existsSync(imgRoot)).toBe(true)
      const dirs = fs.readdirSync(imgRoot)
      expect(dirs).toHaveLength(1)
      expect(dirs[0]).toMatch(/^import-\d+$/)
      const images = fs.readdirSync(path.join(imgRoot, dirs[0]))
      expect(images).toHaveLength(2)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('未注入 getDataPath 时仍能导入正文（配图不落盘，不整体失败）', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-zip-nodeir-'))
    try {
      const dataPath = path.join(tmp, 'notes-data.json')
      const zipPath = await makeZip(tmp, {
        'a.md': '# A\n\n正文',
        'img/pic.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      })

      const handlers = makeHandlers({ pick: zipPath, dataPath, omitGetDataPath: true })
      const result = (await handlers.get('notes:import-files')!(null, { kind: 'zip' })) as {
        ok: boolean
        docs?: unknown[]
        imageCount?: number
      }

      expect(result.ok).toBe(true)
      expect(result.docs).toHaveLength(1)
      expect(result.imageCount).toBe(0)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('文件夹导入不受影响', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-folder-'))
    try {
      const dataPath = path.join(tmp, 'notes-data.json')
      const mdDir = path.join(tmp, 'md')
      fs.mkdirSync(mdDir, { recursive: true })
      fs.writeFileSync(path.join(mdDir, 'a.md'), '# A\nbody')

      const handlers = makeHandlers({ pick: mdDir, dataPath })
      const result = (await handlers.get('notes:import-files')!(null, { kind: 'folder' })) as {
        ok: boolean
        docs: { title: string }[]
      }

      expect(result.ok).toBe(true)
      expect(result.docs.map((d) => d.title)).toEqual(['A'])
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('两种 kind 都不再出现未定义标识符错误', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-undef-'))
    try {
      const dataPath = path.join(tmp, 'notes-data.json')
      const zipPath = await makeZip(tmp, { 'a.md': '# A' })
      const handlers = makeHandlers({ pick: zipPath, dataPath })

      const result = (await handlers.get('notes:import-files')!(null, { kind: 'zip' })) as {
        error?: string
      }
      const err = result.error ?? ''
      expect(err).not.toMatch(/is not defined/)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
