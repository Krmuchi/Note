import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import {
  MAX_IMPORT_FILES,
  buildImportPlan,
  isImagePath,
  isImportablePath,
  rewriteImageLinks,
  titleFromImportPath,
  uniqueImageName,
} from '../../electron/ipc/import-content.cjs'

/** 批量导入的纯逻辑（O4）：筛选规则要保守，链接重写要"解不出来就别动"。 */

describe('isImportablePath', () => {
  it('接受 Markdown 与纯文本', () => {
    expect(isImportablePath('a.md')).toBe(true)
    expect(isImportablePath('子目录/b.markdown')).toBe(true)
    expect(isImportablePath('note.TXT')).toBe(true)
  })

  it('拒绝其它扩展名', () => {
    expect(isImportablePath('a.png')).toBe(false)
    expect(isImportablePath('a.pdf')).toBe(false)
    expect(isImportablePath('a')).toBe(false)
  })

  it('跳过导出包里的噪声与隐藏文件', () => {
    expect(isImportablePath('__MACOSX/._a.md')).toBe(false)
    expect(isImportablePath('.obsidian/config.md')).toBe(false)
    expect(isImportablePath('.DS_Store')).toBe(false)
    expect(isImportablePath('node_modules/pkg/readme.md')).toBe(false)
  })
})

describe('isImagePath', () => {
  it('识别常见图片，且同样跳过噪声目录', () => {
    expect(isImagePath('attachments/a.png')).toBe(true)
    expect(isImagePath('a.JPEG')).toBe(true)
    expect(isImagePath('__MACOSX/a.png')).toBe(false)
    expect(isImagePath('a.md')).toBe(false)
  })
})

describe('titleFromImportPath', () => {
  it('优先取正文第一个标题', () => {
    expect(titleFromImportPath('note.md', '# 会议纪要\n正文')).toBe('会议纪要')
  })

  it('没有标题时用文件名去扩展名', () => {
    expect(titleFromImportPath('dir/项目计划.md', '没有标题')).toBe('项目计划')
  })

  it('去扩展名后为空时给兜底标题', () => {
    // 注意：名为 .md 的文件会被"隐藏文件"规则挡在导入之外，
    // 这里测的是兜底分支本身（basename 去掉扩展名与空白后为空）
    expect(titleFromImportPath('   ', '')).toBe('导入的文档')
  })
})

describe('buildImportPlan', () => {
  it('过滤不可导入项并统计跳过数量', () => {
    const plan = buildImportPlan([
      { path: 'a.md', content: '# A' },
      { path: 'img/b.png', content: 'binary' },
      { path: '.DS_Store', content: '' },
      { path: 'b.txt', content: 'B' },
    ])
    expect(plan.docs.map((d: { title: string }) => d.title)).toEqual(['A', 'b'])
    expect(plan.skipped).toBe(2)
  })

  it('统一路径分隔符（Windows 反斜杠）', () => {
    const plan = buildImportPlan([{ path: 'dir\\sub\\c.md', content: '# C' }])
    expect(plan.docs[0].sourcePath).toBe('dir/sub/c.md')
  })

  it('超过单篇上限的文件被跳过', () => {
    const huge = 'x'.repeat(6 * 1024 * 1024)
    const plan = buildImportPlan([{ path: 'huge.md', content: huge }])
    expect(plan.docs).toHaveLength(0)
    expect(plan.skipped).toBe(1)
  })

  it('总量超过上限时截断（防误选巨大目录）', () => {
    const many = Array.from({ length: MAX_IMPORT_FILES + 10 }, (_, i) => ({ path: 'f' + i + '.md', content: '# ' + i }))
    const plan = buildImportPlan(many)
    expect(plan.docs).toHaveLength(MAX_IMPORT_FILES)
    expect(plan.truncated).toBe(true)
  })

  it('非数组输入不抛错', () => {
    expect(buildImportPlan(null).docs).toEqual([])
    expect(buildImportPlan(undefined).docs).toEqual([])
  })
})

describe('rewriteImageLinks', () => {
  const resolve = (ref: string): string | null => (ref.startsWith('http') ? null : 'file:///data/images/' + ref.replace(/^.*\//, ''))

  it('重写相对路径的 Markdown 图片', () => {
    expect(rewriteImageLinks('![图](attachments/a.png)', resolve)).toBe('![图](file:///data/images/a.png)')
  })

  it('不触碰外链、data: 与已有 file: 地址', () => {
    expect(rewriteImageLinks('![图](https://x/a.png)', resolve)).toBe('![图](https://x/a.png)')
    expect(rewriteImageLinks('![图](data:image/png;base64,AAA)', resolve)).toBe('![图](data:image/png;base64,AAA)')
    expect(rewriteImageLinks('![图](file:///x/a.png)', resolve)).toBe('![图](file:///x/a.png)')
  })

  it('解不出来的引用保持原样（不能改坏正文）', () => {
    const keep = (): null => null
    expect(rewriteImageLinks('![图](missing.png)', keep)).toBe('![图](missing.png)')
  })

  it('同时处理内联 HTML 的 src', () => {
    expect(rewriteImageLinks('<img src="attachments/b.png" />', resolve)).toBe('<img src="file:///data/images/b.png" />')
  })
})

describe('zip 包导入（与主进程同一套筛选）', () => {
  it('真实 zip：取出 Markdown、跳过噪声与图片、标题取首个标题行', async () => {
    const zip = new JSZip()
    zip.file('笔记/项目计划.md', '# 项目计划\n正文')
    zip.file('笔记/README.txt', '纯文本')
    zip.file('attachments/p.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    zip.file('__MACOSX/._项目计划.md', 'junk')
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const loaded = await JSZip.loadAsync(buffer)
    const textEntries: { path: string; content: string }[] = []
    const imagePaths: string[] = []
    for (const [entryPath, entry] of Object.entries(loaded.files)) {
      if (entry.dir) continue
      if (isImportablePath(entryPath)) {
        textEntries.push({ path: entryPath, content: await entry.async('string') })
      } else if (isImagePath(entryPath)) {
        imagePaths.push(entryPath)
      }
    }

    const plan = buildImportPlan(textEntries)
    expect(plan.docs.map((d: { title: string }) => d.title)).toEqual(['项目计划', 'README'])
    expect(imagePaths).toEqual(['attachments/p.png'])
  })
})

describe('uniqueImageName', () => {
  it('去掉目录、清洗非 ASCII 字符并加序号前缀', () => {
    expect(uniqueImageName('a/b/图 片.png', 3)).toBe('0003-___.png')
    expect(uniqueImageName('a/b/photo-1.png', 12)).toBe('0012-photo-1.png')
  })

  it('没有可用文件名时有兜底', () => {
    expect(uniqueImageName('', 1)).toContain('image')
  })
})
