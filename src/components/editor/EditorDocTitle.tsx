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

  // 文档切换时把标题写进 DOM（contenteditable 不受 React 控制，需手动同步）
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.textContent !== activeDoc.title) {
      el.textContent = activeDoc.title
    }
  }, [activeDoc.id, activeDoc.title])

  /**
   * 回写标题。
   *
   * 只在内容真的变化时写 store —— 每次输入都写会触发自动版本快照，
   * 标题的逐字符变化会把 30s 合并窗口撑爆（版本记录被标题刷屏）。
   */
  const commit = useCallback(() => {
    const el = ref.current
    if (!el) return
    // 取纯文本：粘贴富文本时不能把标签也塞进标题
    const next = (el.textContent ?? '').replace(/\n/g, ' ').trim()
    if (next !== activeDoc.title) {
      updateDocContent({ title: next })
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
      onInput={commit}
      onBlur={commit}
      onKeyDown={(e) => {
        // Enter 不插入换行（标题是单行语义），而是直接进入正文
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          onEnter?.()
        } else if (e.key === 'Escape') {
          // 还原为已保存标题
          const el = ref.current
          if (el) el.textContent = activeDoc.title
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
        commit()
      }}
    />
  )
}

export default EditorDocTitle
