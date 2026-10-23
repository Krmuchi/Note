import { describe, it, expect } from 'vitest'
import { deriveDocFromFile, hasImportableFiles, isImportableFileName } from '@/utils/droppedFiles'

describe('isImportableFileName', () => {
  it('识别 markdown / 文本文件，大小写不敏感', () => {
    expect(isImportableFileName('note.md')).toBe(true)
    expect(isImportableFileName('NOTE.MARKDOWN')).toBe(true)
    expect(isImportableFileName('a.txt')).toBe(true)
  })

  it('图片与其它类型不参与导入（它们属于编辑器拖放）', () => {
    expect(isImportableFileName('shot.png')).toBe(false)
    expect(isImportableFileName('report.pdf')).toBe(false)
    expect(isImportableFileName('archive.zip')).toBe(false)
  })
})

describe('deriveDocFromFile', () => {
  it('标题优先取正文第一个 Markdown 标题', () => {
    const doc = deriveDocFromFile('note.md', '\n\n# 我的标题\n\n正文')
    expect(doc.title).toBe('我的标题')
    expect(doc.content).toContain('正文')
  })

  it('没有标题行时用文件名（去扩展名）', () => {
    expect(deriveDocFromFile('会议纪要.md', '没有标题').title).toBe('会议纪要')
  })

  it('文件名去掉扩展名后为空时给出兜底标题', () => {
    expect(deriveDocFromFile('.md', '').title).toBe('导入的文档')
  })

  it('正文原样保留（不吞掉标题行）', () => {
    const content = '# 标题\n正文'
    expect(deriveDocFromFile('x.md', content).content).toBe(content)
  })
})

describe('hasImportableFiles', () => {
  it('只要有一个可导入文件就为真', () => {
    expect(hasImportableFiles([{ name: 'a.png' }, { name: 'b.md' }])).toBe(true)
    expect(hasImportableFiles([{ name: 'a.png' }])).toBe(false)
    expect(hasImportableFiles([])).toBe(false)
    expect(hasImportableFiles(undefined)).toBe(false)
  })
})
