import React, { useCallback, useEffect, useRef } from 'react'
import type { NoteDoc } from '@/types'

/**
 * 正文内的大标题（语雀式）。
 *
 * 语雀的文档标题在**正文顶部**，和内容同一条内容列、同一个字号阶梯，
 * 而不是挤在顶部工具条里 —— 后者会让标题看起来像"窗口名"而不是"文档标题"，
 * 也导致标题与正文的左边界对不齐（顶部栏有自己的内边距）。
 *
 * 这里用 contenteditable 而非 input：
 * - 标题要能随内容列一起滚动、换行（长标题在窄窗口下 input 会横向截断）；
 * - 视觉上与正文同级（同一 font-family / 同一 max-width）。
 *
 * Enter 提交并聚焦到正文，符合"标题写完就开始写内容"的直觉。
 *
 * 提交时机（缺陷6/7）：
 * - **不在 onInput 提交**。逐字符写 store 会为每个字符记一份撤销快照
 *   （updateDocContent 里 title 变化会 recordSnapshot），撤销栈被标题刷屏。
 *   输入期间 DOM 就是本地真实值，Enter / 失焦时才提交。
 * - **提交不 trim**。旧实现先 trim 再写 store，而 effect 又把 store 回写到
 *   DOM，于是输入首尾空格会被实时抹掉、光标跟着跳；现在只有**比对时** trim。
 * - **DOM 只在文档切换时同步**（见下方 effect），title 每次变化不再回写 DOM。
 * - Esc 用 focus 时的快照还原并写回 store；旧实现读回 activeDoc.title 再写回
 *   同一个值，等于什么都没做。
 */
export interface EditorDocTitleProps {
  activeDoc: NoteDoc
  updateDocContent: (updates: Partial<NoteDoc>) => void
  /** 按下 Enter / 点击正文区域时把焦点交给编辑器 */
  onEnter?: () => void
}

export const EditorDocTitle: React.FC<EditorDocTitleProps> = ({
  activeDoc,
  updateDocContent,
  onEnter,
}) => {
  const ref = useRef<HTMLDivElement | null>(null)
  /** 进入编辑（focus）时的标题快照，Esc 用它还原，并写回 store */
  const snapshotRef = useRef('')
  /** 上一次成功提交的文本：Enter 之后紧跟着的 blur 会再提交一次，这里去重 */
  const committedRef = useRef<string | null>(null)
  /** Esc 还原后紧随的 blur 不应再提交，否则会把刚还原的值又覆盖回去 */
  const skipBlurCommitRef = useRef(false)
  /** 最新标题（effect 里同步，避免把 title 作为同步 effect 的依赖反复回写 DOM） */
  const titleRef = useRef(activeDoc.title)

  useEffect(() => {
    titleRef.current = activeDoc.title
  }, [activeDoc.title])

  // 文档切换时把标题写进 DOM（contenteditable 不受 React 控制，需手动同步）。
  // 只在 id 变化时执行：跟着 title 每次都回写会与用户正在输入的 DOM 打架。
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const next = titleRef.current
    if (el.textContent !== next) {
      el.textContent = next
    }
    // 换了文档：快照与去重标记都作废
    snapshotRef.current = next
    committedRef.current = null
    skipBlurCommitRef.current = false
  }, [activeDoc.id])

  /*
   * 标题在别处被改动（撤销/重做、其它面板改名）时补一次 DOM 同步。
   * 只在**没有焦点**时写：正在输入时回写会抹掉用户刚敲的内容、光标乱跳 ——
   * 这正是旧实现"每次 title 变化都回写"的病根（缺陷7）。
   */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement === el) return
    if (el.textContent !== activeDoc.title) {
      el.textContent = activeDoc.title
    }
    snapshotRef.current = activeDoc.title
  }, [activeDoc.title])

  /**
   * 回写标题（Enter / 失焦时调用）。
   *
   * 不 trim：DOM 里首尾空格原样保留，只有比对时用 trim 判等 ——
   * 这样"只多敲了个空格"不会产生一次 store 写入。
   */
  const commit = useCallback(() => {
    const el = ref.current
    if (!el) return
    // 取纯文本：粘贴富文本时不能把标签也塞进标题
    const next = (el.textContent ?? '').replace(/\n/g, ' ')
    if (committedRef.current === next) return
    if (next.trim() !== activeDoc.title.trim()) {
      committedRef.current = next
      updateDocContent({ title: next })
    }
  }, [activeDoc.title, updateDocContent])

  /** 还原到进入编辑时的标题 */
  const restoreSnapshot = useCallback(() => {
    const el = ref.current
    const snapshot = snapshotRef.current
    skipBlurCommitRef.current = true
    if (el && el.textContent !== snapshot) {
      el.textContent = snapshot
    }
    committedRef.current = null
    if (snapshot !== activeDoc.title) {
      updateDocContent({ title: snapshot })
    }
  }, [activeDoc.title, updateDocContent])

  return (
    <div
      ref={ref}
      className="editor-doc-title"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="文档标题"
      spellCheck={false}
      data-placeholder="无标题"
      onFocus={() => {
        // 快照"开始编辑前"的标题：Esc 要还原的是这一份，而不是刚敲进去的内容。
        // 不在这里动光标位置 —— 点击标题的哪一处就该把光标放在哪一处。
        snapshotRef.current = activeDoc.title
        committedRef.current = null
        skipBlurCommitRef.current = false
      }}
      onBlur={() => {
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false
          return
        }
        commit()
      }}
      onKeyDown={(e) => {
        // Enter 不插入换行（标题是单行语义），而是直接进入正文
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          onEnter?.()
        } else if (e.key === 'Escape') {
          // 还原为进入编辑时的标题（并写回 store），不再读"当前已存标题"空转
          e.preventDefault()
          restoreSnapshot()
          e.currentTarget.blur()
        }
      }}
      onPaste={(e) => {
        /*
         * 标题只收纯文本：否则粘贴一段 HTML 会把样式带进标题。
         *
         * 用 Range API 插入而不是 `document.execCommand('insertText')`：
         * execCommand 已废弃，且在 jsdom（单元测试环境）里不存在 —— 用它会让
         * 测试直接报 "not a function"，也无法覆盖粘贴行为。
         */
        e.preventDefault()
        const text = e.clipboardData.getData('text/plain').replace(/\n/g, ' ')
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) return
        const range = sel.getRangeAt(0)
        range.deleteContents()
        const node = document.createTextNode(text)
        range.insertNode(node)
        // 光标移到插入文本之后，用户可以继续输入
        range.setStartAfter(node)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        // 提交仍交给 Enter / 失焦（见文件头注释），粘贴只改本地 DOM
      }}
    />
  )
}

export default EditorDocTitle
