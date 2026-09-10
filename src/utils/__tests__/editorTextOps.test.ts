import { describe, it, expect } from 'vitest'
import {
  autoPairMarker,
  buildCodeFence,
  buildTableMarkdown,
  continueBlockOnEnter,
  detectSlashToken,
  insertTextAtCursor,
  insertFormula,
  changeIndent,
} from '@/utils/editorTextOps'

/** 构造受控 textarea 并设置光标/选区 */
function makeTa(value: string, start: number, end: number = start): HTMLTextAreaElement {
  const ta = document.createElement('textarea')
  ta.value = value
  ta.setSelectionRange(start, end)
  return ta
}

describe('continueBlockOnEnter - 回车续写块标记', () => {
  it('无序列表续写同标记', () => {
    const ta = makeTa('- 项目一', 5)
    const next = continueBlockOnEnter(ta)
    expect(next).toBe('- 项目一\n- ')
    expect(ta.selectionStart).toBe(8)
  })

  it('有序列表序号自动递增', () => {
    const ta = makeTa('1. 第一项\n2. 第二项', 16)
    const next = continueBlockOnEnter(ta)
    expect(next).toBe('1. 第一项\n2. 第二项\n3. ')
  })

  it('完成任务续写为未完成任务', () => {
    const ta = makeTa('- [x] 已完成', 10)
    const next = continueBlockOnEnter(ta)
    expect(next).toBe('- [x] 已完成\n- [ ] ')
  })

  it('引用续写 > 标记', () => {
    const ta = makeTa('> 名言', 5)
    const next = continueBlockOnEnter(ta)
    expect(next).toBe('> 名言\n> ')
  })

  it('嵌套列表保留缩进', () => {
    const ta = makeTa('- 父项\n  - 子项', 13)
    const next = continueBlockOnEnter(ta)
    expect(next).toBe('- 父项\n  - 子项\n  - ')
  })

  it('空列表项回车退出列表（清除标记）', () => {
    const ta = makeTa('- ', 2)
    const next = continueBlockOnEnter(ta)
    expect(next).toBe('')
    expect(ta.selectionStart).toBe(0)
  })

  it('空任务项回车退出任务列表', () => {
    const ta = makeTa('- [ ] ', 6)
    const next = continueBlockOnEnter(ta)
    expect(next).toBe('')
  })

  it('空引用项回车退出引用', () => {
    const ta = makeTa('正文\n> ', 7)
    const next = continueBlockOnEnter(ta)
    expect(next).toBe('正文\n')
  })

  it('光标在行中间时拆分行并续写', () => {
    const ta = makeTa('- 前后半', 4)
    const next = continueBlockOnEnter(ta)
    expect(next).toBe('- 前后\n- 半')
    expect(ta.selectionStart).toBe(7)
  })

  it('无块标记返回 null（走原生回车）', () => {
    const ta = makeTa('普通文本', 4)
    expect(continueBlockOnEnter(ta)).toBeNull()
  })

  it('光标在行中间的普通文本不退出也不续写', () => {
    const ta = makeTa('- 内容', 3)
    const next = continueBlockOnEnter(ta)
    expect(next).toBe('- 内\n- 容')
  })
})

describe('detectSlashToken - 斜杠命令触发检测', () => {
  it('行首斜杠命中并返回查询词', () => {
    const ta = makeTa('/tabl', 5)
    expect(detectSlashToken(ta)).toEqual({ start: 0, end: 5, query: 'tabl' })
  })

  it('空白后的斜杠命中', () => {
    const ta = makeTa('文字 /tab', 7)
    const token = detectSlashToken(ta)
    expect(token?.query).toBe('tab')
    expect(token?.start).toBe(3)
  })

  it('单词中间的斜杠不命中', () => {
    const ta = makeTa('http://x', 8)
    expect(detectSlashToken(ta)).toBeNull()
  })

  it('斜杠后有空格不命中', () => {
    const ta = makeTa('/ tab', 5)
    expect(detectSlashToken(ta)).toBeNull()
  })

  it('有选区时不命中', () => {
    const ta = makeTa('/tabl', 0, 5)
    expect(detectSlashToken(ta)).toBeNull()
  })
})

describe('insertTextAtCursor', () => {
  it('在光标处插入并移动光标', () => {
    const ta = makeTa('前后', 1)
    const next = insertTextAtCursor(ta, '插入')
    expect(next).toBe('前插入后')
    expect(ta.selectionStart).toBe(3)
  })

  it('有选区时替换选区', () => {
    const ta = makeTa('前选中后', 1, 3)
    const next = insertTextAtCursor(ta, '新')
    expect(next).toBe('前新后')
  })
})

describe('autoPairMarker - 行内标记自动补全', () => {
  it('输入反引号补全为成对并居中光标', () => {
    const ta = makeTa('', 0)
    expect(autoPairMarker(ta, '`')).toBe(true)
    expect(ta.value).toBe('``')
    expect(ta.selectionStart).toBe(1)
  })

  it('光标紧邻已有闭合反引号时跳过而不是重复插入', () => {
    const ta = makeTa('``', 1)
    expect(autoPairMarker(ta, '`')).toBe(true)
    expect(ta.value).toBe('``')
    expect(ta.selectionStart).toBe(2)
  })

  it('连续反引号（代码围栏）不接管', () => {
    const ta = makeTa('``', 2)
    expect(autoPairMarker(ta, '`')).toBe(false)
  })

  it('输入第二个星号补全为加粗标记', () => {
    const ta = makeTa('*', 1)
    expect(autoPairMarker(ta, '*')).toBe(true)
    expect(ta.value).toBe('****')
    expect(ta.selectionStart).toBe(2)
  })

  it('单个星号不接管（可能是列表语法）', () => {
    const ta = makeTa('', 0)
    expect(autoPairMarker(ta, '*')).toBe(false)
  })

  it('输入第二个波浪号补全为删除线标记', () => {
    const ta = makeTa('~', 1)
    expect(autoPairMarker(ta, '~')).toBe(true)
    expect(ta.value).toBe('~~~~')
    expect(ta.selectionStart).toBe(2)
  })

  it('有选区时不接管，保留默认替换行为', () => {
    const ta = makeTa('abc', 0, 3)
    expect(autoPairMarker(ta, '*')).toBe(false)
    expect(ta.value).toBe('abc')
  })
})

describe('buildTableMarkdown / buildCodeFence', () => {
  it('按行列生成表格（首行表头 + 分隔行）', () => {
    expect(buildTableMarkdown(2, 2)).toBe(
      '| 列1 | 列2 |\n| --- | --- |\n| 内容 | 内容 |',
    )
  })

  it('行列数被限制在合理范围', () => {
    const md = buildTableMarkdown(100, 100)
    // 行上限 20：1 行表头 + 1 行分隔 + 19 行内容
    expect(md.split('\n')).toHaveLength(21)
    expect(md.split('\n')[0].split('|').filter(Boolean)).toHaveLength(12)
  })

  it('代码围栏可带语言', () => {
    expect(buildCodeFence('python')).toBe('```python')
    expect(buildCodeFence()).toBe('```')
  })
})

describe('insertFormula - 公式插入', () => {
  it('无选区时插入独立公式块模板，光标停在中间空行', () => {
    const ta = makeTa('前文', 2)
    const next = insertFormula(ta)
    expect(next).toBe('前文$$\n\n$$\n')
    // `$$\n` 之后的位置
    expect(ta.selectionStart).toBe(2 + 3)
  })

  it('有选区时包裹为行内公式，光标位于公式内', () => {
    const ta = makeTa('x = 1', 2, 5)
    const next = insertFormula(ta)
    expect(next).toBe('x $$= 1$$')
    expect(ta.selectionStart).toBe(4)
    expect(ta.selectionEnd).toBe(7)
  })

  it('已包裹的公式再次插入则解除包裹', () => {
    const ta = makeTa('$$x^2$$', 0, 7)
    const next = insertFormula(ta)
    expect(next).toBe('x^2')
    expect(ta.selectionStart).toBe(0)
    expect(ta.selectionEnd).toBe(3)
  })
})

describe('changeIndent - Tab 缩进', () => {
  it('无选区时缩进当前行', () => {
    const ta = makeTa('a\nb\nc', 2)
    const next = changeIndent(ta, true)
    expect(next).toBe('a\n  b\nc')
  })

  it('多行选区整块缩进', () => {
    const ta = makeTa('a\nb\nc', 0, 5)
    const next = changeIndent(ta, true)
    expect(next).toBe('  a\n  b\n  c')
  })

  it('反缩进移除行首两空格', () => {
    const ta = makeTa('  a', 3)
    const next = changeIndent(ta, false)
    expect(next).toBe('a')
  })
})
