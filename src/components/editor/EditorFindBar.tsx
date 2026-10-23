import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  computeScrollTop,
  findAllMatches,
  lineIndexAt,
  measureLineHeight,
  replaceAllMatches,
  type FindMatch,
} from '@/utils/findInText'
import { toast } from '@/components/common/Toast'

interface EditorFindBarProps {
  content: string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  /**
   * 富文本内核下的"按 Markdown 偏移选中并滚动"。
   *
   * 新内核（contenteditable）没有 textarea 的 setSelectionRange，
   * 由 Editor 传入 RichEditorHandle.selectRange；为 undefined 时走 textarea 分支。
   */
  selectRangeInRichEditor?: (start: number, end: number) => boolean
  onReplaceContent: (next: string) => void
  onClose: () => void
  /** 由 Ctrl+H 打开时直接展开替换行 */
  initialShowReplace?: boolean
  /** 预填关键词：搜索面板跳转过来时直接定位到首个命中（S1） */
  initialQuery?: string
  /**
   * 命中信息上抛：右侧刻度带需要"全部命中 + 当前下标 + 正文长度"才能绘制。
   * 由 Editor 持有并渲染，避免 FindBar 自己再插一层布局。
   */
  onMatchesChange?: (info: { matches: FindMatch[]; current: number; contentLength: number } | null) => void
  /**
   * 注册"跳到第 N 处命中"的函数（返回取消注册）。
   * 刻度带的点击要复用 FindBar 内部的 jumpTo（含选中与滚动），
   * 与既有的 onRegisterEditorScrollSync 是同一套 ref 直通模式。
   */
  onRegisterJump?: (fn: ((index: number) => void) | null) => void
}

/**
 * 文档内查找 / 替换（BUG-3）。
 *
 * 之前编辑器完全没有查找能力：长文档里找一句话只能靠肉眼，
 * 而从搜索面板跳进文档后也定位不到具体那句话，形成完整断链。
 */
export const EditorFindBar: React.FC<EditorFindBarProps> = ({
  content,
  textareaRef,
  selectRangeInRichEditor,
  onReplaceContent,
  onClose,
  initialShowReplace = false,
  initialQuery = '',
  onMatchesChange,
  onRegisterJump,
}) => {
  const [query, setQuery] = useState(initialQuery)
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [showReplace, setShowReplace] = useState(initialShowReplace)
  const [current, setCurrent] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => findAllMatches(content, query, caseSensitive), [content, query, caseSensitive])
  const safeCurrent = matches.length === 0 ? -1 : Math.min(current, matches.length - 1)

  /** focus=false 用于"边输入边定位"：只选中与滚动，不抢走输入框的焦点 */
  const jumpTo = useCallback(
    (index: number, focus: boolean) => {
      const match = matches[index]
      if (!match) return

      // 富文本内核：按 Markdown 偏移在 DOM 里选中（没有 setSelectionRange）
      if (selectRangeInRichEditor) {
        selectRangeInRichEditor(match.index, match.index + match.length)
        return
      }

      const ta = textareaRef.current
      if (!ta) return
      if (focus) ta.focus()
      ta.setSelectionRange(match.index, match.index + match.length)
      ta.scrollTop = computeScrollTop(lineIndexAt(content, match.index), measureLineHeight(ta), ta.clientHeight)
    },
    [content, matches, textareaRef, selectRangeInRichEditor],
  )

  // 查询条件或内容变化后把当前命中保持在视口内（纯 DOM 操作，不 setState）
  useEffect(() => {
    if (safeCurrent >= 0) jumpTo(safeCurrent, false)
  }, [jumpTo, safeCurrent])

  // 命中信息上抛给 Editor 的刻度带；组件卸载时清空，避免刻度残留在关闭后的编辑器上
  useEffect(() => {
    if (!onMatchesChange) return
    onMatchesChange({ matches, current: safeCurrent, contentLength: content.length })
    return () => onMatchesChange(null)
  }, [matches, safeCurrent, content.length, onMatchesChange])

  // 把"跳到第 N 处"注册给刻度带：点击刻度时既切当前下标，也把选区/滚动带过去
  useEffect(() => {
    if (!onRegisterJump) return
    onRegisterJump((index: number) => {
      setCurrent(index)
      jumpTo(index, true)
    })
    return () => onRegisterJump(null)
  }, [onRegisterJump, jumpTo])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleNext = useCallback(() => {
    if (matches.length === 0) return
    const next = (safeCurrent + 1) % matches.length
    setCurrent(next)
    jumpTo(next, true)
  }, [jumpTo, matches.length, safeCurrent])

  const handlePrev = useCallback(() => {
    if (matches.length === 0) return
    const prev = (safeCurrent - 1 + matches.length) % matches.length
    setCurrent(prev)
    jumpTo(prev, true)
  }, [jumpTo, matches.length, safeCurrent])

  const handleReplaceCurrent = useCallback(() => {
    const match = matches[safeCurrent]
    if (!match) return
    onReplaceContent(content.slice(0, match.index) + replacement + content.slice(match.index + match.length))
  }, [content, matches, onReplaceContent, replacement, safeCurrent])

  const handleReplaceAll = useCallback(() => {
    if (matches.length === 0) return
    const count = matches.length
    onReplaceContent(replaceAllMatches(content, matches, replacement))
    toast.success(`已替换 ${count} 处`)
  }, [content, matches, onReplaceContent, replacement])

  const handleClose = useCallback(() => {
    onClose()
    textareaRef.current?.focus()
  }, [onClose, textareaRef])

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) handlePrev()
      else handleNext()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
    }
  }

  return (
    <div className="find-bar" role="search" aria-label="文档内查找">
      <div className="find-bar-row">
        <input
          ref={inputRef}
          className="find-bar-input"
          placeholder="查找…"
          value={query}
          aria-label="查找内容"
          onChange={(e) => {
            setQuery(e.target.value)
            setCurrent(0)
          }}
          onKeyDown={handleInputKeyDown}
        />
        <span className="find-bar-count" aria-live="polite">
          {query ? (matches.length === 0 ? '无结果' : `${safeCurrent + 1}/${matches.length}`) : ''}
        </span>
        <button type="button" className="find-bar-btn" onClick={handlePrev} disabled={matches.length === 0} title="上一个（Shift+Enter）" aria-label="上一个匹配">
          ↑
        </button>
        <button type="button" className="find-bar-btn" onClick={handleNext} disabled={matches.length === 0} title="下一个（Enter）" aria-label="下一个匹配">
          ↓
        </button>
        <button
          type="button"
          className={`find-bar-btn ${caseSensitive ? 'active' : ''}`}
          onClick={() => {
            setCaseSensitive((v) => !v)
            setCurrent(0)
          }}
          title="区分大小写"
          aria-pressed={caseSensitive}
        >
          Aa
        </button>
        <button
          type="button"
          className={`find-bar-btn ${showReplace ? 'active' : ''}`}
          onClick={() => setShowReplace((v) => !v)}
          title="替换"
          aria-pressed={showReplace}
        >
          ⇄
        </button>
        <button type="button" className="find-bar-btn find-bar-close" onClick={handleClose} title="关闭（Esc）" aria-label="关闭查找">
          ×
        </button>
      </div>

      {showReplace && (
        <div className="find-bar-row">
          <input
            className="find-bar-input"
            placeholder="替换为…"
            value={replacement}
            aria-label="替换内容"
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          <button type="button" className="find-bar-btn find-bar-text-btn" onClick={handleReplaceCurrent} disabled={matches.length === 0}>
            替换
          </button>
          <button type="button" className="find-bar-btn find-bar-text-btn" onClick={handleReplaceAll} disabled={matches.length === 0}>
            全部替换
          </button>
        </div>
      )}
    </div>
  )
}

export default EditorFindBar
