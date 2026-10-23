import { describe, it, expect } from 'vitest'
import { WIKI_LINK_PREFIX, remarkWikiLink } from '@/utils/remarkWikiLink'

/** 直接对 mdast 结构做断言：这是"代码块不被误改"的关键保障。 */

interface Node {
  type: string
  value?: string
  url?: string
  children?: Node[]
}

const run = (tree: Node): Node => {
  remarkWikiLink()(tree)
  return tree
}

const paragraph = (value: string): Node => ({ type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value }] }] })

describe('remarkWikiLink', () => {
  it('把 [[标题]] 转成带前缀的链接节点，其余文本保留', () => {
    const tree = run(paragraph('见 [[项目计划]] 了解详情'))
    const children = tree.children![0].children!

    expect(children[0]).toEqual({ type: 'text', value: '见 ' })
    expect(children[1].type).toBe('link')
    expect(children[1].url).toBe(WIKI_LINK_PREFIX + encodeURIComponent('项目计划'))
    expect(children[1].children![0].value).toBe('项目计划')
    expect(children[2]).toEqual({ type: 'text', value: ' 了解详情' })
  })

  it('一行里多个双链都会转换', () => {
    const tree = run(paragraph('[[A]] 和 [[B]]'))
    const links = tree.children![0].children!.filter((c) => c.type === 'link')
    expect(links).toHaveLength(2)
  })

  it('代码块与行内代码不受影响（mdast 层不会遍历它们的文本）', () => {
    const tree: Node = {
      type: 'root',
      children: [
        { type: 'code', value: 'const x = "[[不该被替换]]"' },
        { type: 'inlineCode', value: '[[也不该]]' },
      ],
    }
    run(tree)
    expect(tree.children![0].value).toBe('const x = "[[不该被替换]]"')
    expect(tree.children![1].value).toBe('[[也不该]]')
  })

  it('空标题原样保留', () => {
    const tree = run(paragraph('[[  ]]'))
    expect(tree.children![0].children![0]).toEqual({ type: 'text', value: '[[  ]]' })
  })

  it('没有双链时结构不变', () => {
    const tree = run(paragraph('普通正文'))
    expect(tree.children![0].children).toEqual([{ type: 'text', value: '普通正文' }])
  })
})
